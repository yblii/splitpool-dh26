import type { FastifyInstance, FastifyRequest } from 'fastify';
import type {
  ExtractedReceipt,
  PaymentLedger,
  SaveItemsRequest,
  SetClaimRequest,
  SetTipRequest,
  UpdateSettingsRequest,
} from '@splitpool/contracts';
import { LedgerError } from '@splitpool/contracts';
import type { VerifyToken } from './auth.ts';
import { ApiError } from './errors.ts';
import { collaborationStateFromPayment } from './payments/billState.ts';
import {
  parseWithFallback,
  type ReceiptFallbackReason,
  type ReceiptParser,
} from './receipt/parser.ts';
import { writeReceiptImage } from './receipt/storage.ts';
import { CollaborationService } from './service.ts';

const id = { type: 'string', format: 'uuid' };
const text = (maxLength: number) => ({ type: 'string', minLength: 1, maxLength, pattern: '\\S' });
const integer = (maximum: number, minimum = 0) => ({ type: 'integer', minimum, maximum });
const cents = integer(100000000);
const expectedVersion = integer(2147483646, 1);
const mode = { type: 'string', enum: ['equal', 'proportional'] };
const username = { type: 'string', pattern: '^[A-Za-z0-9_]{3,30}$' };
const object = (properties: Record<string, unknown>, required = Object.keys(properties)) => ({
  type: 'object', additionalProperties: false, properties, required,
});
const ids = { type: 'array', minItems: 1, uniqueItems: true, items: id };
const params = object({ id });

function normalizeImageMimeType(mimeType: string): string {
  if (mimeType === 'image/jpg') return 'image/jpeg';
  return mimeType;
}

export type CollaborationRouteOptions = {
  parser: ReceiptParser;
  receiptRoot?: string;
  /** When set, group reads close collaboration bills whose payment ledger is already terminal. */
  ledger?: PaymentLedger;
};

export async function collaborationRoutes(
  app: FastifyInstance,
  service: CollaborationService,
  verifyToken: VerifyToken,
  options: CollaborationRouteOptions,
) {
  const users = new WeakMap<FastifyRequest, string>();
  const user = (request: FastifyRequest) => users.get(request)!;
  const reconcileBill = async (actorId: string, billId: string | null | undefined) => {
    if (!billId || !options.ledger) return;
    try {
      const projection = options.ledger.billView(actorId, billId, Date.now());
      const phase = projection.session?.phase;
      if (phase !== 'paid' && phase !== 'canceled') return;
      await service.syncPaymentState(
        billId,
        collaborationStateFromPayment({ phase, hasSnapshot: Boolean(projection.snapshotId) }),
      );
    } catch (error) {
      if (error instanceof LedgerError && error.statusCode === 404) return;
      throw error;
    }
  };
  // Encapsulated hook: health and demo routes outside this plugin remain public.
  app.addHook('onRequest', async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    const match = /^Bearer ([^\s]+)$/i.exec(request.headers.authorization ?? '');
    if (!match || match[1].length > 16384) throw new ApiError(401, 'AUTH_REQUIRED', 'A Supabase bearer access token is required.');
    try { users.set(request, await verifyToken(match[1])); }
    catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(503, 'AUTH_UNAVAILABLE', 'Authentication is temporarily unavailable.');
    }
  });
  app.get('/me', async request => ({ profile: await service.me(user(request)) }));
  app.patch<{ Body: { username?: string; displayName?: string } }>('/me', {
    schema: { body: { ...object({ username, displayName: text(80) }, []), minProperties: 1 } },
  }, async request => ({ profile: await service.saveProfile(user(request), request.body) }));
  app.get('/groups', async request => {
    const actorId = user(request);
    const groups = await service.listGroups(actorId);
    for (const group of groups) await reconcileBill(actorId, group.activeBillId);
    return { groups: await service.listGroups(actorId) };
  });
  app.post<{ Body: { name: string } }>('/groups', {
    schema: { body: object({ name: text(100) }) },
  }, async (request, reply) => reply.code(201).send(await service.createGroup(user(request), request.body.name)));
  app.get<{ Params: { id: string } }>('/groups/:id', { schema: { params } }, async (request) => {
    const actorId = user(request);
    const group = await service.getGroup(actorId, request.params.id);
    await reconcileBill(actorId, group.activeBillId);
    return service.getGroup(actorId, request.params.id);
  });
  app.post<{ Params: { id: string }; Body: { username?: string } }>('/groups/:id/invites', {
    schema: { params, body: object({ username }, []) },
  }, async (request, reply) => reply.code(201).send(await service.invite(user(request), request.params.id, request.body.username)));
  app.post<{ Params: { token: string } }>('/invites/:token/accept', {
    schema: { params: object({ token: { type: 'string', pattern: '^[A-Za-z0-9_-]{43}$' } }) },
  }, request => service.acceptInvite(user(request), request.params.token));
  app.post<{ Params: { id: string } }>('/groups/:id/bills', {
    schema: { params, body: object({}, []) },
  }, async (request, reply) => reply.code(201).send(await service.createBill(user(request), request.params.id)));
  app.get<{ Params: { id: string } }>('/bills/:id', { schema: { params } },
    request => service.getBill(user(request), request.params.id));
  app.post<{ Params: { id: string } }>('/bills/:id/receipt-extractions', { schema: { params } },
    async (request, reply) => {
      const file = await request.file();
      if (!file) throw new ApiError(400, 'INVALID_REQUEST', 'Expected a multipart image field named "image".');
      const mimeType = normalizeImageMimeType(file.mimetype || 'application/octet-stream');
      if (!mimeType.startsWith('image/')) throw new ApiError(400, 'INVALID_REQUEST', 'Receipt upload must be an image.');
      const bytes = await file.toBuffer();
      if (!bytes.length) throw new ApiError(400, 'INVALID_REQUEST', 'Receipt image was empty.');

      const billId = request.params.id;
      await service.assertHostCanExtractReceipt(user(request), billId);
      const imageKey = await writeReceiptImage(billId, bytes, mimeType, options.receiptRoot);
      request.log.info({
        billId,
        parser: options.parser.name,
        mimeType,
        bytes: bytes.length,
        imageKey,
      }, 'Starting bill receipt extraction');

      const { draft, usedFallback, reason, errorDetail } = await parseWithFallback(options.parser, {
        bytes,
        mimeType,
        filename: file.filename,
      }, request.log);

      await service.saveReceiptExtraction(user(request), billId, {
        imageKey,
        parsingStatus: usedFallback ? 'fallback' : 'extracted',
        extractedResult: draft,
      });

      const body: {
        draft: ExtractedReceipt;
        usedFallback: boolean;
        imageKey: string;
        reason?: ReceiptFallbackReason;
        errorDetail?: string;
      } = { draft, usedFallback, imageKey };
      if (reason) body.reason = reason;
      if (errorDetail) body.errorDetail = errorDetail;
      return reply.code(200).send(body);
    });
  app.put<{ Params: { id: string }; Body: SaveItemsRequest }>('/bills/:id/items', {
    schema: { params, body: object({ expectedVersion, merchant: { type: 'string', maxLength: 120 },
      items: { type: 'array', maxItems: 500, items: object({ id, name: text(200), quantity: integer(10000, 1), netLineTotalCents: cents },
        ['name', 'quantity', 'netLineTotalCents']) },
      taxCents: cents, serviceChargeCents: cents, printedTotalCents: cents,
    }) },
  }, request => service.saveItems(user(request), request.params.id, request.body));
  app.put<{ Params: { id: string; itemId: string }; Body: SetClaimRequest }>('/bills/:id/items/:itemId/claim', {
    schema: { params: object({ id, itemId: id }), body: object({ expectedVersion,
      fraction: object({ numerator: integer(1000000), denominator: integer(1000000, 1) }),
    }) },
  }, request => service.setClaim(user(request), request.params.id, request.params.itemId, request.body));
  app.patch<{ Params: { id: string }; Body: UpdateSettingsRequest }>('/bills/:id/settings', {
    schema: { params, body: { ...object({ expectedVersion, participantIds: ids,
      taxMode: mode, serviceChargeMode: mode }, ['expectedVersion']), minProperties: 2 } },
  }, request => service.settings(user(request), request.params.id, {
    ...request.body, participantIds: request.body.participantIds?.map(id => id.toLowerCase()),
  }));
  app.put<{ Params: { id: string }; Body: SetTipRequest }>('/bills/:id/tip', {
    schema: { params, body: object({ expectedVersion, tipCents: cents }) },
  }, request => service.setTip(user(request), request.params.id, request.body));
  app.post<{ Params: { id: string }; Body: { state: 'PAID' | 'CANCELLED' } }>('/bills/:id/close', {
    schema: { params, body: object({ state: { type: 'string', enum: ['PAID', 'CANCELLED'] } }) },
  }, request => service.closeBill(user(request), request.params.id, request.body.state));
}

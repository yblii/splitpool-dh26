import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { SaveItemsRequest, SetClaimRequest, SetTipRequest, UpdateSettingsRequest } from '@splitpool/contracts';
import type { VerifyToken } from './auth.ts';
import { ApiError } from './errors.ts';
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

export async function collaborationRoutes(app: FastifyInstance, service: CollaborationService, verifyToken: VerifyToken) {
  const users = new WeakMap<FastifyRequest, string>();
  const user = (request: FastifyRequest) => users.get(request)!;
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
  app.get('/groups', async request => ({ groups: await service.listGroups(user(request)) }));
  app.post<{ Body: { name: string } }>('/groups', {
    schema: { body: object({ name: text(100) }) },
  }, async (request, reply) => reply.code(201).send(await service.createGroup(user(request), request.body.name)));
  app.get<{ Params: { id: string } }>('/groups/:id', { schema: { params } },
    request => service.getGroup(user(request), request.params.id));
  app.post<{ Params: { id: string }; Body: { username?: string } }>('/groups/:id/invites', {
    schema: { params, body: object({ username }, []) },
  }, async (request, reply) => reply.code(201).send(await service.invite(user(request), request.params.id, request.body.username)));
  app.post<{ Params: { token: string } }>('/invites/:token/accept', {
    schema: { params: object({ token: { type: 'string', pattern: '^[A-Za-z0-9_-]{43}$' } }) },
  }, request => service.acceptInvite(user(request), request.params.token));
  app.post<{ Params: { id: string }; Body: { participantIds: string[] } }>('/groups/:id/bills', {
    schema: { params, body: object({ participantIds: ids }) },
  }, async (request, reply) => reply.code(201).send(await service.createBill(user(request), request.params.id, request.body.participantIds.map(id => id.toLowerCase()))));
  app.get<{ Params: { id: string } }>('/bills/:id', { schema: { params } },
    request => service.getBill(user(request), request.params.id));
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
}

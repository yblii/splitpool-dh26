import { createHmac, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  LedgerError,
  PaymentLedger,
  type BillProjection,
  type MerchantScenario,
  type ReviewDraft,
  type SessionProjection,
} from '@splitpool/contracts';
import { collaborationStateFromPayment, type CollaborationBillState } from './billState.ts';
import { collectionChanges, type CollectionStatus, type StripePayments } from './stripe.ts';

const SCENARIOS = new Set<MerchantScenario>(['exact', 'under', 'incremental', 'wrong_merchant', 'reverse', 'late_capture']);
export const WEBHOOK_SECRET = process.env.SIMULATION_WEBHOOK_SECRET ?? 'splitpool-demo-webhook';

export type PaymentBillSync = (billId: string, state: CollaborationBillState) => Promise<void> | void;

export async function registerPaymentRoutes(
  app: FastifyInstance,
  ledger: PaymentLedger,
  simulation = true,
  stripe?: StripePayments,
  syncBillState?: PaymentBillSync,
) {
  app.removeContentTypeParser('application/json');
  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (request, body, done) => {
    const raw = Buffer.isBuffer(body) ? body : Buffer.from(body);
    if (request.url.split('?')[0] === '/api/v1/webhooks/stripe') {
      done(null, raw);
      return;
    }
    try {
      const text = raw.toString('utf8');
      done(null, text ? JSON.parse(text) : {});
    } catch (error) {
      const parseError = error instanceof Error ? error : new Error('Invalid JSON');
      (parseError as Error & { statusCode?: number }).statusCode = 400;
      done(parseError, undefined);
    }
  });
  app.addContentTypeParser('application/vnd.splitpool.simulation+json', { parseAs: 'buffer' }, (_request, body, done) => {
    done(null, body);
  });

  app.get('/api/v1/bills/:id/payment', async (request, reply) => run(reply, async () => {
    try {
      const projection = ledger.billView(actor(request), id(request), now(request, simulation));
      // Self-heal: polling after a paid/canceled session still closes the collaboration row.
      await mirrorBill(syncBillState, projection);
      return projection;
    } catch (error) {
      if (error instanceof LedgerError && error.statusCode === 404) return null;
      throw error;
    }
  }));
  app.post('/api/v1/bills/:id/review', async (request, reply) => run(reply, async () => {
    const projection = ledger.review(actor(request), id(request), reviewDraft(request.body), now(request, simulation));
    await mirrorBill(syncBillState, projection);
    return projection;
  }));
  app.post('/api/v1/bills/:id/reopen', async (request, reply) => run(reply, async () => {
    const projection = ledger.reopen(actor(request), id(request));
    await mirrorBill(syncBillState, projection);
    return projection;
  }));
  app.post('/api/v1/bills/:id/acceptances', async (request, reply) => run(reply, () => ledger.accept(actor(request), id(request))));
  app.post('/api/v1/bills/:id/confirm', async (request, reply) => run(reply, async () => {
    const funding = header(request, 'x-simulation-funding');
    if (funding === 'unavailable') {
      if (!simulation) throw new LedgerError(403, 'Live mode cannot script funding.');
      ledger.useUnavailableFunding(actor(request), id(request));
    }
    const session = ledger.confirm(actor(request), id(request), operationKey(request), now(request, simulation));
    await mirrorSession(syncBillState, session);
    return session;
  }));
  app.post('/api/v1/payment-sessions/:id/contributions/me', async (request, reply) => run(reply, async () => {
    const userId = actor(request);
    const sessionId = id(request);
    const key = operationKey(request);
    const clock = now(request, simulation);
    if (!stripe) {
      const session = ledger.authorize(userId, sessionId, key, clock);
      await mirrorSession(syncBillState, session);
      return session;
    }
    const before = ledger.session(userId, sessionId, clock);
    const pending = before.seats.filter((seat) => seat.userId === userId && seat.status === 'pending');
    if (pending.length === 0) {
      const session = ledger.authorize(userId, sessionId, key, clock);
      await mirrorSession(syncBillState, session);
      return session;
    }
    const paymentMethodId = paymentMethod(request.body);
    const results: CollectionStatus[] = [];
    for (const seat of pending) {
      results.push(await stripe.collect({
        obligationId: seat.obligationId,
        sessionId,
        amountCents: seat.approvedTotalCents,
        paymentMethodId,
        idempotencyKey: `${key}:${seat.obligationId}`,
      }));
    }
    const outcome = results.some((status) => status === 'failed') ? 'fail' : results.some((status) => status === 'requires_action') ? 'action' : 'approve';
    if (outcome === 'fail') {
      await stripe.follow(pending.flatMap((seat, index) => results[index] === 'authorized' ? [{ obligationId: seat.obligationId, kind: 'cancel' as const }] : []));
    }
    const session = ledger.authorize(userId, sessionId, key, clock, outcome);
    await mirrorSession(syncBillState, session);
    return session;
  }));
  app.post('/api/v1/card-holds', async (request, reply) => run(reply, async () => {
    if (!stripe) throw new LedgerError(404, 'Stripe is not configured.');
    const amountCents = amount(request.body);
    const userId = actor(request);
    const key = operationKey(request);
    return stripe.openCardHold({ obligationId: `hold:${userId}:${key}`, sessionId: 'demo', amountCents, idempotencyKey: key });
  }));
  app.post('/api/v1/card-holds/confirm', async (request, reply) => run(reply, async () => {
    if (!stripe) throw new LedgerError(404, 'Stripe is not configured.');
    const paymentIntentId = intentId(request.body);
    const userId = actor(request);
    const key = operationKey(request);
    const status = await stripe.finishCardHold({ obligationId: `hold:${userId}:${key}`, paymentIntentId });
    if (status !== 'authorized') throw new LedgerError(409, 'The card hold was not approved.');
    return { accepted: true };
  }));
  app.post('/api/v1/card-holds/release', async (request, reply) => run(reply, async () => {
    if (!stripe) throw new LedgerError(404, 'Stripe is not configured.');
    const paymentIntentId = intentId(request.body);
    const action = request.body && typeof request.body === 'object' ? (request.body as { action?: unknown }).action : undefined;
    if (action !== 'cancel' && action !== 'capture') throw new LedgerError(400, 'Expected a cancel or capture.');
    await stripe.releaseCardHold({ paymentIntentId, action });
    return { released: true };
  }));
  app.post('/api/v1/payment-sessions/:id/contributions/me/wallet', async (request, reply) => run(reply, async () => {
    if (!stripe) throw new LedgerError(404, 'Stripe is not configured.');
    const userId = actor(request);
    const sessionId = id(request);
    const clock = now(request, simulation);
    const seat = ledger.session(userId, sessionId, clock).seats.find((entry) => entry.userId === userId && entry.status === 'pending' && !stripe.held(entry.obligationId));
    if (!seat) throw new LedgerError(409, 'There is no share left to authorize.');
    const hold = await stripe.openCardHold({
      obligationId: seat.obligationId,
      sessionId,
      amountCents: seat.approvedTotalCents,
      idempotencyKey: `${operationKey(request)}:${seat.obligationId}`,
    });
    return { ...hold, obligationId: seat.obligationId, amountCents: seat.approvedTotalCents };
  }));
  app.post('/api/v1/payment-sessions/:id/contributions/me/wallet/confirm', async (request, reply) => run(reply, async () => {
    if (!stripe) throw new LedgerError(404, 'Stripe is not configured.');
    const userId = actor(request);
    const sessionId = id(request);
    const key = operationKey(request);
    const clock = now(request, simulation);
    const paymentIntentId = intentId(request.body);
    const obligationId = obligation(request.body);
    const pending = ledger.session(userId, sessionId, clock).seats.filter((entry) => entry.userId === userId && entry.status === 'pending');
    if (!pending.some((entry) => entry.obligationId === obligationId)) throw new LedgerError(409, 'That share is not waiting for a card.');
    const status = await stripe.finishCardHold({ obligationId, paymentIntentId });
    if (status !== 'authorized') throw new LedgerError(409, 'The card hold was not approved.');
    const remaining = pending.some((entry) => entry.obligationId !== obligationId && !stripe.held(entry.obligationId));
    if (remaining) return ledger.session(userId, sessionId, clock);
    const session = ledger.authorize(userId, sessionId, key, clock);
    await mirrorSession(syncBillState, session);
    return session;
  }));
  app.post('/api/v1/payment-sessions/:id/contributions/me/retry', async (request, reply) => run(reply, async () => {
    const userId = actor(request);
    const sessionId = id(request);
    const key = operationKey(request);
    const clock = now(request, simulation);
    if (!stripe) {
      const session = ledger.retry(userId, sessionId, key, clock);
      await mirrorSession(syncBillState, session);
      return session;
    }
    const before = ledger.session(userId, sessionId, clock);
    const retryable = before.seats.filter((seat) => seat.userId === userId && (seat.status === 'action_needed' || seat.status === 'refunded'));
    if (retryable.length === 0) {
      const session = ledger.retry(userId, sessionId, key, clock);
      await mirrorSession(syncBillState, session);
      return session;
    }
    const paymentMethodId = paymentMethod(request.body);
    for (const seat of retryable) {
      const status = await stripe.collect({
        obligationId: seat.obligationId,
        sessionId,
        amountCents: seat.approvedTotalCents,
        paymentMethodId,
        idempotencyKey: `${key}:${seat.obligationId}`,
      });
      if (status !== 'authorized') throw new LedgerError(409, 'That share was not authorized.');
    }
    const session = ledger.retry(userId, sessionId, key, clock);
    await mirrorSession(syncBillState, session);
    return session;
  }));
  app.post('/api/v1/payment-sessions/:id/seats/:seatId/cover', async (request, reply) => run(reply, () => {
    const params = request.params as { id: string; seatId: string };
    return ledger.cover(actor(request), params.id, params.seatId, now(request, simulation));
  }));
  app.post('/api/v1/payment-sessions/:id/checkout', async (request, reply) => run(reply, async () => {
    const userId = actor(request);
    const sessionId = id(request);
    const key = operationKey(request);
    const clock = now(request, simulation);
    const current = ledger.session(userId, sessionId, clock);
    let card;
    if (!stripe || current.spenderUserId !== userId || current.checkoutOpen || current.blockers.length > 0) {
      card = ledger.checkout(userId, sessionId, key, clock);
    } else {
      const issued = await stripe.createCard({ sessionId, spenderUserId: userId, budgetCents: current.cardBudgetCents, idempotencyKey: `card:${sessionId}` });
      card = ledger.checkout(userId, sessionId, key, clock, issued);
    }
    await mirrorSession(syncBillState, ledger.session(userId, sessionId, clock));
    return card;
  }));
  app.get('/api/v1/payment-sessions/:id', async (request, reply) => run(reply, () => ledger.session(actor(request), id(request), now(request, simulation))));
  app.get('/api/v1/payment-sessions/:id/card', async (request, reply) => run(reply, () => ledger.card(actor(request), id(request), now(request, simulation))));
  app.post('/api/v1/payment-sessions/:id/card-access', async (request, reply) => run(reply, () => ledger.cardAccess(actor(request), id(request), now(request, simulation))));
  app.post('/api/v1/payment-sessions/:id/cancel', async (request, reply) => run(reply, () => tracked(stripe, ledger, request, simulation, syncBillState, (userId, sessionId, key, clock) => ledger.cancel(userId, sessionId, key, clock))));
  app.post('/api/v1/payment-sessions/:id/decline', async (request, reply) => run(reply, () => tracked(stripe, ledger, request, simulation, syncBillState, (userId, sessionId, key, clock) => ledger.declineCard(userId, sessionId, key, clock))));
  app.post('/api/v1/simulation/payment-sessions/:id/merchant-events', async (request, reply) => run(reply, () => {
    if (!simulation) throw new LedgerError(404, 'Simulation is disabled.');
    const scenario = (request.body as { scenario?: MerchantScenario } | undefined)?.scenario;
    if (!scenario || !SCENARIOS.has(scenario)) throw new LedgerError(400, 'Unknown merchant scenario.');
    return tracked(stripe, ledger, request, simulation, syncBillState, (userId, sessionId, key, clock) => ledger.merchantEvent(userId, sessionId, scenario, key, clock));
  }));
  app.post('/api/v1/webhooks/collections', async (request, reply) => {
    if (!simulation) return reply.code(404).send({ error: 'Simulation webhooks are disabled.' });
    if (!Buffer.isBuffer(request.body)) return reply.code(400).send({ error: 'Expected a raw webhook body.' });
    const signature = header(request, 'x-simulation-signature');
    const expected = createHmac('sha256', WEBHOOK_SECRET).update(request.body).digest('hex');
    if (!signature || signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
      return reply.code(400).send({ error: 'Invalid signature.' });
    }
    let event: { id: string; type: 'authorization.succeeded' | 'authorization.failed' | 'refund.succeeded'; obligationId: string };
    try {
      event = JSON.parse(request.body.toString('utf8'));
    } catch {
      return reply.code(400).send({ error: 'Invalid event.' });
    }
    return ledger.applyCollectionEvent(event);
  });
  app.post('/api/v1/webhooks/stripe', async (request, reply) => run(reply, () => {
    if (!stripe) throw new LedgerError(404, 'Stripe webhooks are disabled.');
    if (!Buffer.isBuffer(request.body)) throw new LedgerError(400, 'Expected a raw webhook body.');
    const notice = stripe.verifyWebhook(request.body, header(request, 'stripe-signature'));
    if (!notice) return { applied: false };
    return ledger.applyCollectionEvent(notice);
  }));
}

async function tracked(
  stripe: StripePayments | undefined,
  ledger: PaymentLedger,
  request: FastifyRequest,
  simulation: boolean,
  syncBillState: PaymentBillSync | undefined,
  apply: (userId: string, sessionId: string, key: string, clock: number) => SessionProjection,
) {
  const userId = actor(request);
  const sessionId = id(request);
  const clock = now(request, simulation);
  const before = stripe ? ledger.session(userId, sessionId, clock) : undefined;
  const after = apply(userId, sessionId, operationKey(request), clock);
  // Close/progress the collaboration bill before Stripe follow-ups so a provider error
  // cannot leave groups stuck on an active bill after the ledger already moved.
  await mirrorSession(syncBillState, after);
  if (stripe && before) await stripe.follow(collectionChanges(before, after));
  return after;
}

async function mirrorBill(syncBillState: PaymentBillSync | undefined, projection: BillProjection) {
  if (!syncBillState) return;
  await syncBillState(
    projection.billId,
    collaborationStateFromPayment({
      phase: projection.session?.phase,
      hasSnapshot: Boolean(projection.snapshotId),
    }),
  );
}

async function mirrorSession(syncBillState: PaymentBillSync | undefined, session: SessionProjection) {
  if (!syncBillState) return;
  await syncBillState(
    session.billId,
    collaborationStateFromPayment({ phase: session.phase, hasSnapshot: true }),
  );
}

async function run(reply: FastifyReply, fn: () => unknown) {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof LedgerError) return reply.code(error.statusCode).send({ error: error.message });
    throw error;
  }
}

function header(request: FastifyRequest, name: string): string | undefined {
  const value = request.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

function actor(request: FastifyRequest): string {
  const userId = header(request, 'x-user-id')?.trim();
  if (!userId) throw new LedgerError(401, 'Sign in is required.');
  return userId;
}

function operationKey(request: FastifyRequest): string {
  const key = header(request, 'idempotency-key')?.trim();
  if (!key) throw new LedgerError(400, 'Expected an idempotency key.');
  return key;
}

function id(request: FastifyRequest): string {
  const params = request.params as { id?: string };
  if (!params.id) throw new LedgerError(400, 'Expected an id.');
  return params.id;
}

function now(request: FastifyRequest, simulation: boolean): number {
  if (!simulation) return Date.now();
  const raw = header(request, 'x-simulation-now');
  if (!raw) return Date.now();
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed)) throw new LedgerError(400, 'Expected a simulation clock.');
  return parsed;
}

function amount(body: unknown): number {
  const value = body && typeof body === 'object' ? (body as { amountCents?: unknown }).amountCents : undefined;
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) throw new LedgerError(400, 'Expected an amount in cents.');
  return value;
}

function intentId(body: unknown): string {
  const value = body && typeof body === 'object' ? (body as { paymentIntentId?: unknown }).paymentIntentId : undefined;
  if (typeof value !== 'string' || !value.startsWith('pi_')) throw new LedgerError(400, 'Expected a Stripe payment intent.');
  return value;
}

function obligation(body: unknown): string {
  const value = body && typeof body === 'object' ? (body as { obligationId?: unknown }).obligationId : undefined;
  if (typeof value !== 'string' || !value.trim()) throw new LedgerError(400, 'Expected an obligation.');
  return value;
}

function paymentMethod(body: unknown): string {
  const value = body && typeof body === 'object' ? (body as { paymentMethodId?: unknown }).paymentMethodId : undefined;
  if (typeof value !== 'string' || !value.startsWith('pm_')) throw new LedgerError(400, 'Expected a Stripe payment method.');
  return value;
}

function reviewDraft(body: unknown): ReviewDraft {
  if (!body || typeof body !== 'object') throw new LedgerError(400, 'Expected a review body.');
  const draft = body as ReviewDraft;
  if (typeof draft.spenderUserId !== 'string' || typeof draft.merchantId !== 'string' || typeof draft.feeScheduleVersion !== 'string') {
    throw new LedgerError(400, 'Expected a spender, merchant, and fee schedule.');
  }
  if (!Array.isArray(draft.seats) || !Array.isArray(draft.itemShares)) throw new LedgerError(400, 'Expected seats and item shares.');
  return draft;
}

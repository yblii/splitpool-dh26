import { createHmac } from 'node:crypto';
import { expect, it } from 'vitest';
import { LedgerError, PaymentLedger, type ReviewDraft } from '@splitpool/contracts';
import { buildApp } from '../app.ts';
import { WEBHOOK_SECRET } from './routes.ts';
import type { CollectionChange, CollectionNotice, StripePayments } from './stripe.ts';

const draft: ReviewDraft = {
  spenderUserId: 'spender',
  merchantId: 'little-table',
  merchantTotalCents: 12000,
  itemSubtotalCents: 12000,
  feeScheduleVersion: 'demo-0',
  seats: [
    { seatId: 'a', userId: 'spender', merchantShareCents: 4000 },
    { seatId: 'b', userId: 'alex', merchantShareCents: 4000 },
    { seatId: 'c', userId: 'sam', merchantShareCents: 4000 },
  ],
  itemShares: [
    { itemId: 'pizza', userId: 'spender', cents: 4000 },
    { itemId: 'pasta', userId: 'alex', cents: 4000 },
    { itemId: 'salad', userId: 'sam', cents: 4000 },
  ],
};

function headers(userId: string, extra: Record<string, string> = {}) {
  return { 'x-user-id': userId, 'x-simulation-now': '1000', ...extra };
}

it('collects each share onto one simulated card and hides the card from other members', async () => {
  const app = await buildApp({ ledger: new PaymentLedger({ fundingDelayMs: 1000 }) });
  try {
    const missing = await app.inject({ method: 'POST', url: '/api/v1/bills/dinner/review', payload: draft });
    expect(missing.statusCode).toBe(401);

    const empty = await app.inject({ method: 'GET', url: '/api/v1/bills/dinner/payment', headers: headers('spender') });
    expect(empty.statusCode).toBe(200);
    expect(empty.json()).toBeNull();

    const review = await app.inject({ method: 'POST', url: '/api/v1/bills/dinner/review', headers: headers('spender'), payload: draft });
    expect(review.statusCode).toBe(200);
    const peeked = await app.inject({ method: 'GET', url: '/api/v1/bills/dinner/payment', headers: headers('alex') });
    expect(peeked.statusCode).toBe(200);
    expect(peeked.json().snapshotId).toBeTruthy();
    for (const user of ['spender', 'alex', 'sam']) {
      const accepted = await app.inject({ method: 'POST', url: '/api/v1/bills/dinner/acceptances', headers: headers(user) });
      expect(accepted.statusCode).toBe(200);
    }
    const confirmed = await app.inject({
      method: 'POST', url: '/api/v1/bills/dinner/confirm', headers: headers('spender', { 'idempotency-key': 'confirm' }),
    });
    expect(confirmed.statusCode).toBe(200);
    const sessionId = confirmed.json().sessionId as string;
    const again = await app.inject({
      method: 'POST', url: '/api/v1/bills/dinner/confirm', headers: headers('spender', { 'idempotency-key': 'confirm' }),
    });
    expect(again.json().sessionId).toBe(sessionId);

    for (const user of ['spender', 'alex', 'sam']) {
      const paid = await app.inject({
        method: 'POST', url: `/api/v1/payment-sessions/${sessionId}/contributions/me`,
        headers: headers(user, { 'idempotency-key': user }),
      });
      expect(paid.statusCode).toBe(200);
    }
    const pending = await app.inject({ method: 'GET', url: `/api/v1/payment-sessions/${sessionId}`, headers: headers('alex') });
    expect(pending.json()).toMatchObject({ phase: 'funding_pending', cardBudgetCents: 12000, label: 'SIMULATED' });
    const locked = await app.inject({
      method: 'POST', url: `/api/v1/payment-sessions/${sessionId}/checkout`,
      headers: headers('spender', { 'idempotency-key': 'card', 'x-simulation-now': '1000' }),
    });
    expect(locked.statusCode).toBe(409);

    const ready = await app.inject({
      method: 'POST', url: `/api/v1/payment-sessions/${sessionId}/checkout`,
      headers: headers('spender', { 'idempotency-key': 'card', 'x-simulation-now': '2000' }),
    });
    expect(ready.json()).toMatchObject({ label: 'SIMULATED', last4: '4242', budgetCents: 12000 });
    const hidden = await app.inject({ method: 'GET', url: `/api/v1/payment-sessions/${sessionId}/card`, headers: headers('alex', { 'x-simulation-now': '2000' }) });
    expect(hidden.statusCode).toBe(403);
    expect(JSON.stringify(hidden.json())).not.toContain('4242');

    const charge = await app.inject({
      method: 'POST', url: `/api/v1/simulation/payment-sessions/${sessionId}/merchant-events`,
      headers: headers('spender', { 'idempotency-key': 'exact', 'x-simulation-now': '2000' }),
      payload: { scenario: 'exact' },
    });
    expect(charge.json().phase).toBe('paid');
  } finally { await app.close(); }
});

it('rejects a forged collection webhook and voids a signed late success', async () => {
  const app = await buildApp({ ledger: new PaymentLedger({ fundingDelayMs: 1000 }) });
  try {
    await app.inject({ method: 'POST', url: '/api/v1/bills/dinner/review', headers: headers('spender'), payload: draft });
    await app.inject({ method: 'POST', url: '/api/v1/bills/dinner/acceptances', headers: headers('spender') });
    await app.inject({ method: 'POST', url: '/api/v1/bills/dinner/acceptances', headers: headers('alex') });
    await app.inject({ method: 'POST', url: '/api/v1/bills/dinner/acceptances', headers: headers('sam') });
    const confirmed = await app.inject({
      method: 'POST', url: '/api/v1/bills/dinner/confirm', headers: headers('spender', { 'idempotency-key': 'confirm' }),
    });
    const sessionId = confirmed.json().sessionId as string;
    const obligationId = confirmed.json().seats[1].obligationId as string;
    await app.inject({
      method: 'POST', url: `/api/v1/payment-sessions/${sessionId}/cancel`,
      headers: headers('spender', { 'idempotency-key': 'cancel' }),
    });
    const body = Buffer.from(JSON.stringify({ id: 'evt-9', type: 'authorization.succeeded', obligationId }));
    const forged = await app.inject({
      method: 'POST', url: '/api/v1/webhooks/collections',
      headers: { 'content-type': 'application/vnd.splitpool.simulation+json', 'x-simulation-signature': 'deadbeef' },
      payload: body,
    });
    expect(forged.statusCode).toBe(400);
    const signature = createHmac('sha256', WEBHOOK_SECRET).update(body).digest('hex');
    const signed = await app.inject({
      method: 'POST', url: '/api/v1/webhooks/collections',
      headers: { 'content-type': 'application/vnd.splitpool.simulation+json', 'x-simulation-signature': signature },
      payload: body,
    });
    expect(signed.json()).toEqual({ applied: true });
    const view = await app.inject({ method: 'GET', url: `/api/v1/payment-sessions/${sessionId}`, headers: headers('spender') });
    expect(view.json().seats.find((seat: { obligationId: string }) => seat.obligationId === obligationId).status).toBe('voided');
  } finally { await app.close(); }
});

it('authorizes each share with Stripe and issues a virtual card for the pool', async () => {
  const calls: string[] = [];
  const stripe: StripePayments = {
    async collect(input) {
      calls.push(`collect:${input.amountCents}:${input.paymentMethodId}`);
      return 'authorized';
    },
    async openCardHold() { throw new Error('unused'); },
    async finishCardHold() { throw new Error('unused'); },
    async releaseCardHold() { throw new Error('unused'); },
    held() { return false; },
    async createCard(input) {
      calls.push(`card:${input.budgetCents}`);
      return { cardId: 'ic_pool', last4: '1234' };
    },
    async follow(changes) { calls.push(changes.map((change: CollectionChange) => change.kind).join(',')); },
    verifyWebhook(payload, signature): CollectionNotice | null {
      if (signature !== 'good') throw new LedgerError(400, 'Invalid signature.');
      return JSON.parse(payload.toString()) as CollectionNotice;
    },
  };
  const app = await buildApp({ ledger: new PaymentLedger({ fundingDelayMs: 1000 }), stripe });
  try {
    await app.inject({ method: 'POST', url: '/api/v1/bills/dinner/review', headers: headers('spender'), payload: draft });
    for (const user of ['spender', 'alex', 'sam']) {
      await app.inject({ method: 'POST', url: '/api/v1/bills/dinner/acceptances', headers: headers(user) });
    }
    const confirmed = await app.inject({
      method: 'POST', url: '/api/v1/bills/dinner/confirm', headers: headers('spender', { 'idempotency-key': 'confirm' }),
    });
    const sessionId = confirmed.json().sessionId as string;
    const missing = await app.inject({
      method: 'POST', url: `/api/v1/payment-sessions/${sessionId}/contributions/me`,
      headers: headers('spender', { 'idempotency-key': 'spender' }),
    });
    expect(missing.statusCode).toBe(400);

    for (const user of ['spender', 'alex', 'sam']) {
      const paid = await app.inject({
        method: 'POST', url: `/api/v1/payment-sessions/${sessionId}/contributions/me`,
        headers: headers(user, { 'idempotency-key': user }),
        payload: { paymentMethodId: `pm_${user}` },
      });
      expect(paid.statusCode).toBe(200);
    }
    const ready = await app.inject({
      method: 'POST', url: `/api/v1/payment-sessions/${sessionId}/checkout`,
      headers: headers('spender', { 'idempotency-key': 'card', 'x-simulation-now': '2000' }),
    });
    expect(ready.json()).toMatchObject({ label: 'STRIPE', last4: '1234', budgetCents: 12000, simulated: false });
    expect(calls).toEqual(['collect:4000:pm_spender', 'collect:4000:pm_alex', 'collect:4000:pm_sam', 'card:12000']);

    const forged = await app.inject({
      method: 'POST', url: '/api/v1/webhooks/stripe',
      headers: { 'content-type': 'application/json', 'stripe-signature': 'bad' },
      payload: Buffer.from('{}'),
    });
    expect(forged.statusCode).toBe(400);
  } finally { await app.close(); }
});

it('authorizes a share after Apple Pay, Google Pay, or card-funded Link confirms the hold', async () => {
  const held = new Set<string>();
  const stripe: StripePayments = {
    async collect() { throw new Error('unused'); },
    async openCardHold(input) {
      return { clientSecret: 'cs_test', paymentIntentId: `pi_${input.obligationId}` };
    },
    async finishCardHold(input) {
      if (input.paymentIntentId === 'pi_bank') throw new LedgerError(409, 'That wallet has to pay with a card.');
      held.add(input.obligationId);
      return 'authorized';
    },
    async releaseCardHold() { throw new Error('unused'); },
    held(obligationId) { return held.has(obligationId); },
    async createCard() { return { cardId: 'ic_pool', last4: '1234' }; },
    async follow() {},
    verifyWebhook() { return null; },
  };
  const app = await buildApp({ ledger: new PaymentLedger({ fundingDelayMs: 1000 }), stripe });
  try {
    await app.inject({ method: 'POST', url: '/api/v1/bills/dinner/review', headers: headers('spender'), payload: draft });
    for (const user of ['spender', 'alex', 'sam']) {
      await app.inject({ method: 'POST', url: '/api/v1/bills/dinner/acceptances', headers: headers(user) });
    }
    const confirmed = await app.inject({
      method: 'POST', url: '/api/v1/bills/dinner/confirm', headers: headers('spender', { 'idempotency-key': 'confirm' }),
    });
    const sessionId = confirmed.json().sessionId as string;
    const seat = confirmed.json().seats.find((entry: { userId: string }) => entry.userId === 'alex');
    const opened = await app.inject({
      method: 'POST', url: `/api/v1/payment-sessions/${sessionId}/contributions/me/wallet`,
      headers: headers('alex', { 'idempotency-key': 'alex-wallet' }),
    });
    expect(opened.json()).toMatchObject({ clientSecret: 'cs_test', obligationId: seat.obligationId, amountCents: seat.approvedTotalCents });
    const bank = await app.inject({
      method: 'POST', url: '/api/v1/card-holds/confirm',
      headers: headers('alex', { 'idempotency-key': 'alex-demo' }),
      payload: { paymentIntentId: 'pi_bank' },
    });
    expect(bank.statusCode).toBe(409);
    const confirmedHold = await app.inject({
      method: 'POST', url: `/api/v1/payment-sessions/${sessionId}/contributions/me/wallet/confirm`,
      headers: headers('alex', { 'idempotency-key': 'alex-wallet' }),
      payload: { paymentIntentId: opened.json().paymentIntentId, obligationId: seat.obligationId },
    });
    expect(confirmedHold.statusCode).toBe(200);
    expect(confirmedHold.json().seats.find((entry: { userId: string }) => entry.userId === 'alex').status).toBe('authorized');
  } finally { await app.close(); }
});

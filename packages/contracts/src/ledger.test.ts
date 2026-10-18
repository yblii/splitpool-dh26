import { describe, expect, it } from 'vitest';
import { COLLECTION_WINDOW_MS, SPEND_WINDOW_MS } from './payment';
import { CARD_FEE_SCHEDULE, LedgerError, PaymentLedger, type ReviewDraft } from './ledger';

const start = 1_000_000;

function draft(version = 'demo-0'): ReviewDraft {
  return {
    spenderUserId: 'spender',
    merchantId: 'little-table',
    merchantTotalCents: 12000,
    itemSubtotalCents: 12000,
    feeScheduleVersion: version,
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
}

function ledger() {
  return new PaymentLedger({ fundingDelayMs: 1_000 });
}

function collect(pool: PaymentLedger, billId = 'bill', version = 'demo-0', now = start) {
  pool.review('spender', billId, draft(version), now);
  for (const user of ['spender', 'alex', 'sam']) pool.accept(user, billId);
  return pool.confirm('spender', billId, `confirm-${billId}`, now);
}

describe('pooled virtual card', () => {
  it('keeps the card locked until every share is authorized and funding is ready', () => {
    const pool = ledger();
    const session = collect(pool);
    expect(session.cardBudgetCents).toBe(12000);
    expect(session.seats.reduce((sum, seat) => sum + seat.merchantShareCents, 0)).toBe(session.cardBudgetCents);
    pool.authorize('spender', session.sessionId, 'auth-spender', start);
    pool.authorize('alex', session.sessionId, 'auth-alex', start);
    const declined = pool.authorize('sam', session.sessionId, 'auth-sam', start, 'fail');
    expect(declined.phase).toBe('collecting');
    expect(declined.blockers).toContain('collection_incomplete');
    expect(() => pool.checkout('spender', session.sessionId, 'card', start)).toThrow(LedgerError);
    const retried = pool.retry('sam', session.sessionId, 'retry-sam', start);
    expect(retried.seats.find((seat) => seat.userId === 'spender')?.status).toBe('authorized');
    expect(retried.funding).toBe('pending');
    expect(retried.phase).toBe('funding_pending');
    const ready = pool.session('spender', session.sessionId, start + 1_000);
    expect(ready.funding).toBe('ready');
    expect(ready.phase).toBe('ready_to_pay');
  });

  it('grosses up other payers and leaves only principal on the card', () => {
    const pool = ledger();
    const session = collect(pool, 'bill', CARD_FEE_SCHEDULE.version);
    const spender = session.seats.find((seat) => seat.userId === 'spender')!;
    const alex = session.seats.find((seat) => seat.userId === 'alex')!;
    expect(spender.approvedTotalCents).toBe(4000);
    expect(alex.approvedTotalCents).toBeGreaterThan(4000);
    expect(session.cardBudgetCents).toBe(12000);
  });

  it('funds two bills from their own principal', () => {
    const pool = ledger();
    const first = collect(pool, 'one');
    const second = collect(pool, 'two');
    for (const user of ['spender', 'alex', 'sam']) {
      pool.authorize(user, first.sessionId, `one-${user}`, start);
      pool.authorize(user, second.sessionId, `two-${user}`, start);
    }
    expect(pool.session('spender', first.sessionId, start + 1_000).cardBudgetCents).toBe(12000);
    expect(pool.session('spender', second.sessionId, start + 1_000).cardBudgetCents).toBe(12000);
  });

  it('reuses one cardholder and one spend deadline', () => {
    const pool = ledger();
    const session = collect(pool);
    for (const user of ['spender', 'alex', 'sam']) pool.authorize(user, session.sessionId, user, start);
    const first = pool.checkout('spender', session.sessionId, 'card', start + 1_000);
    const second = pool.checkout('spender', session.sessionId, 'card-again', start + 5_000);
    expect(second.spendDeadlineMs).toBe(first.spendDeadlineMs);
    expect(second.spendDeadlineMs).toBe(start + 1_000 + SPEND_WINDOW_MS);
    expect(pool.card('spender', session.sessionId, start + 5_000).spendDeadlineMs).toBe(first.spendDeadlineMs);
    expect(pool.cardholderCount('spender')).toBe(1);
    expect(() => pool.card('alex', session.sessionId, start + 5_000)).toThrow(/spender/);
  });

  it('pays an under-budget capture and refunds the residual by share', () => {
    const pool = ledger();
    const session = collect(pool);
    for (const user of ['spender', 'alex', 'sam']) pool.authorize(user, session.sessionId, user, start);
    pool.checkout('spender', session.sessionId, 'card', start + 1_000);
    const paid = pool.merchantEvent('spender', session.sessionId, 'under', 'merchant-under', start + 1_000);
    expect(paid.phase).toBe('paid');
    expect(paid.pendingRefundCents).toBe(100);
    expect(paid.seats.map((seat) => seat.pendingRefundCents)).toEqual([34, 33, 33]);
    const again = pool.merchantEvent('spender', session.sessionId, 'under', 'merchant-under', start + 1_000);
    expect(again.pendingRefundCents).toBe(100);
  });

  it('approves a same-merchant increase and rejects a second purchase, another merchant, and an over-budget capture', () => {
    const pool = ledger();
    const session = collect(pool);
    for (const user of ['spender', 'alex', 'sam']) pool.authorize(user, session.sessionId, user, start);
    pool.checkout('spender', session.sessionId, 'card', start + 1_000);
    const increased = pool.merchantEvent('spender', session.sessionId, 'incremental', 'merchant-up', start + 1_000);
    expect(increased.phase).toBe('paid');
    const wrong = pool.merchantEvent('spender', session.sessionId, 'wrong_merchant', 'merchant-wrong', start + 2_000);
    expect(wrong.phase).toBe('paid');

    const held = collect(pool, 'over');
    for (const user of ['spender', 'alex', 'sam']) pool.authorize(user, held.sessionId, user, start);
    pool.checkout('spender', held.sessionId, 'card', start + 1_000);
    pool.merchantEvent('spender', held.sessionId, 'late_capture', 'hold', start + 1_000);
    const before = pool.session('spender', held.sessionId, start + 1_000);
    const over = pool.captureAboveBudget('spender', held.sessionId, start + 1_000);
    expect(over.phase).not.toBe('paid');
    expect(over.cases.some((entry) => entry.kind === 'over_budget')).toBe(true);
    expect(over.seats.map((seat) => seat.approvedTotalCents)).toEqual(before.seats.map((seat) => seat.approvedTotalCents));
  });

  it('voids unused authorizations at the collection deadline and blocks new purchases when a hold is open', () => {
    const pool = ledger();
    const expired = collect(pool, 'expire');
    pool.authorize('spender', expired.sessionId, 'spender', start);
    const closed = pool.session('spender', expired.sessionId, start + COLLECTION_WINDOW_MS);
    expect(closed.seats.every((seat) => seat.status === 'voided')).toBe(true);
    expect(closed.windowClosed).toBe('collection');

    const open = collect(pool, 'open');
    for (const user of ['spender', 'alex', 'sam']) pool.authorize(user, open.sessionId, user, start);
    pool.checkout('spender', open.sessionId, 'card', start + 1_000);
    pool.merchantEvent('spender', open.sessionId, 'late_capture', 'hold', start + 1_000);
    const blocked = pool.session('spender', open.sessionId, start + 1_000 + SPEND_WINDOW_MS);
    expect(blocked.spendingBlocked).toBe(true);
    expect(blocked.phase).toBe('payment_pending');
    const captured = pool.merchantEvent('spender', open.sessionId, 'late_capture', 'capture-later', start + 1_000 + SPEND_WINDOW_MS);
    expect(captured.phase).toBe('paid');
  });

  it('voids a late authorization after cancel and keeps a dispute from charging anyone else', () => {
    const pool = ledger();
    const session = collect(pool);
    pool.cancel('spender', session.sessionId, 'cancel', start);
    const obligationId = session.seats.find((seat) => seat.userId === 'alex')!.obligationId;
    const late = pool.applyCollectionEvent({ id: 'evt-1', type: 'authorization.succeeded', obligationId });
    expect(late.applied).toBe(true);
    expect(pool.session('spender', session.sessionId, start).seats.find((seat) => seat.userId === 'alex')?.status).toBe('voided');
    expect(pool.applyCollectionEvent({ id: 'evt-1', type: 'authorization.succeeded', obligationId }).applied).toBe(false);

    const paid = collect(pool, 'paid');
    for (const user of ['spender', 'alex', 'sam']) pool.authorize(user, paid.sessionId, user, start);
    pool.checkout('spender', paid.sessionId, 'card', start + 1_000);
    pool.merchantEvent('spender', paid.sessionId, 'exact', 'exact', start + 1_000);
    const before = pool.session('alex', paid.sessionId, start + 1_000);
    const disputed = pool.dispute('alex', paid.sessionId, start + 1_000);
    expect(disputed.phase).toBe('paid');
    expect(disputed.cases.some((entry) => entry.kind === 'dispute')).toBe(true);
    expect(disputed.seats.map((seat) => seat.approvedTotalCents)).toEqual(before.seats.map((seat) => seat.approvedTotalCents));
  });

  it('returns every share when the card is declined and collects the same frozen bill again', () => {
    const pool = ledger();
    const session = collect(pool, 'bill', CARD_FEE_SCHEDULE.version);
    const snapshotId = pool.billView('spender', 'bill', start).snapshotId;
    for (const user of ['spender', 'alex', 'sam']) pool.authorize(user, session.sessionId, user, start);
    pool.checkout('spender', session.sessionId, 'card', start + 1_000);
    pool.merchantEvent('spender', session.sessionId, 'late_capture', 'hold', start + 1_000);
    const held = pool.session('spender', session.sessionId, start + 1_000);
    expect(held.phase).toBe('payment_pending');
    expect(held.seats.find((seat) => seat.userId === 'alex')?.approvedTotalCents).toBeGreaterThan(4000);

    expect(() => pool.declineCard('alex', session.sessionId, 'decline', start + 1_000)).toThrow(/host/);
    const restarted = pool.declineCard('spender', session.sessionId, 'decline', start + 1_000);
    const repeated = pool.declineCard('spender', session.sessionId, 'decline', start + 2_000);
    expect(repeated.sessionId).toBe(restarted.sessionId);
    expect(restarted.sessionId).not.toBe(session.sessionId);
    expect(restarted.phase).toBe('collecting');
    expect(restarted.checkoutOpen).toBe(false);
    expect(restarted.seats.map((seat) => seat.status)).toEqual(['pending', 'pending', 'pending']);
    expect(restarted.seats.map((seat) => seat.merchantShareCents)).toEqual([4000, 4000, 4000]);
    expect(restarted.seats.find((seat) => seat.userId === 'alex')?.approvedTotalCents).toBeGreaterThan(4000);
    expect(pool.billView('spender', 'bill', start + 1_000)).toMatchObject({
      snapshotId,
      acceptedUserIds: ['spender', 'alex', 'sam'],
    });
    expect(pool.billView('spender', 'bill', start + 1_000).card?.last4).toBeNull();

    for (const user of ['spender', 'alex', 'sam']) pool.authorize(user, restarted.sessionId, user, start + 1_000);
    const card = pool.checkout('spender', restarted.sessionId, 'card', start + 2_000);
    expect(card.last4).toBe('4242');
    expect(card.spendDeadlineMs).toBe(start + 2_000 + SPEND_WINDOW_MS);
    expect(() => pool.declineCard('spender', restarted.sessionId, 'again', start + 3_000 + SPEND_WINDOW_MS)).not.toThrow();
    const paid = collect(pool, 'paid');
    for (const user of ['spender', 'alex', 'sam']) pool.authorize(user, paid.sessionId, `paid-${user}`, start);
    pool.checkout('spender', paid.sessionId, 'card', start + 1_000);
    pool.merchantEvent('spender', paid.sessionId, 'exact', 'exact', start + 1_000);
    expect(() => pool.declineCard('spender', paid.sessionId, 'too-late', start + 1_000)).toThrow(/captured/);
    expect(() => pool.declineCard('spender', collect(pool, 'early').sessionId, 'early', start)).toThrow(/not been opened/);
  });

  it('leaves funding unavailable without opening the card', () => {
    const pool = ledger();
    const session = collect(pool);
    pool.useUnavailableFunding('spender', 'bill');
    for (const user of ['spender', 'alex', 'sam']) pool.authorize(user, session.sessionId, user, start);
    const view = pool.session('spender', session.sessionId, start + 5_000);
    expect(view.funding).toBe('unavailable');
    expect(view.phase).toBe('funding_pending');
    expect(() => pool.checkout('spender', session.sessionId, 'card', start + 5_000)).toThrow(/funding_unavailable/);
  });
});

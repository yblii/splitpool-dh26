import { describe, expect, it } from 'vitest';
import { allocateCents } from './allocate';
import {
  allocateTrackedRefund,
  applyMerchantCapture,
  checkoutBlockers,
  COLLECTION_WINDOW_MS,
  deadlineMs,
  decideAuthorization,
  derivePhase,
  grossUpCharge,
  priceSeat,
  productPolicy,
  SPEND_WINDOW_MS,
  unwindAction,
  validateFrozenBill,
  type AuthRequest,
  type FeeSchedule,
  type FrozenBill,
  type PaymentFacts,
} from './payment';

const cardFee: FeeSchedule = { version: 'card-290-30', percentageBps: 290, fixedCents: 30 };

function facts(overrides: Partial<PaymentFacts> = {}): PaymentFacts {
  return {
    canceled: false,
    seats: [{ required: true, status: 'authorized' }],
    funding: 'ready',
    openHoldCents: 0,
    capturedMerchantCents: 0,
    consentedMaxCents: 12000,
    overBudget: false,
    ...overrides,
  };
}

function auth(overrides: Partial<AuthRequest> = {}): AuthRequest {
  return {
    merchantId: 'little-table',
    currency: 'usd',
    amountCents: 12000,
    nowMs: 0,
    spendDeadlineMs: SPEND_WINDOW_MS,
    checkoutOpen: true,
    instrument: 'active',
    canceled: false,
    consentedMaxCents: 12000,
    expectedMerchantId: 'little-table',
    maxIndependentAuths: 1,
    openHolds: [],
    capturedCents: 0,
    activeIndependentAuths: 0,
    newChainId: 'chain-1',
    ...overrides,
  };
}

describe('payment products', () => {
  it('keeps the hackathon ledger, live reimbursement, and sponsored advance apart', () => {
    expect(productPolicy('hackathon_ledger', 12000)).toMatchObject({
      holdsCustomerFunds: false, issuesCard: true, advanceCapCents: null,
    });
    expect(productPolicy('spender_reimbursement', 12000)).toMatchObject({
      holdsCustomerFunds: false, issuesCard: false, advanceCapCents: 0,
    });
    expect(productPolicy('sponsored_advance', 12000)).toMatchObject({
      holdsCustomerFunds: true, issuesCard: true, advanceCapCents: 12000,
    });
  });
});

describe('seat pricing', () => {
  it('grosses a $40 share up so the card still receives $40', () => {
    const charge = grossUpCharge(4000, cardFee);
    expect(charge).toBe(4151);
    const processorFee = Math.floor(charge * 290 / 10_000) + 30;
    expect(charge - processorFee).toBeGreaterThanOrEqual(4000);
    expect(priceSeat(4000, cardFee, false)).toEqual({
      merchantShareCents: 4000,
      disclosedFeeCents: 151,
      approvedTotalCents: 4151,
      subsidyCents: 0,
    });
  });

  it('charges the spender their principal and records the fee as a subsidy', () => {
    expect(priceSeat(4000, cardFee, true)).toEqual({
      merchantShareCents: 4000,
      disclosedFeeCents: 0,
      approvedTotalCents: 4000,
      subsidyCents: 151,
    });
  });

  it('accepts a frozen bill whose shares, fees, and item lines reconcile', () => {
    const bill: FrozenBill = {
      billId: 'bill-1',
      snapshotId: 'snap-1',
      version: 1,
      hostUserId: 'host',
      spenderUserId: 'spender',
      currency: 'usd',
      merchantId: 'little-table',
      merchantTotalCents: 12000,
      itemSubtotalCents: 10000,
      feeScheduleVersion: cardFee.version,
      feeRefundPolicy: 'principal_only',
      consentedMaxCents: 12000,
      seats: [
        { seatId: 'a', userId: 'spender', ...priceSeat(4000, cardFee, true) },
        { seatId: 'b', userId: 'alex', ...priceSeat(4000, cardFee, false) },
        { seatId: 'c', userId: 'sam', ...priceSeat(4000, cardFee, false) },
      ],
      itemShares: [
        { itemId: 'pizza', userId: 'spender', cents: 4000 },
        { itemId: 'pasta', userId: 'alex', cents: 3000 },
        { itemId: 'salad', userId: 'sam', cents: 3000 },
      ],
    };
    expect(() => validateFrozenBill(bill, cardFee)).not.toThrow();
    bill.seats[1].approvedTotalCents = 4000;
    expect(() => validateFrozenBill(bill, cardFee)).toThrow(/fee schedule/);
  });
});

describe('merchant budget', () => {
  it('approves one purchase and a same-merchant increase inside the budget', () => {
    const first = decideAuthorization(auth());
    expect(first).toMatchObject({ decision: 'approve', chainId: 'chain-1', holdCents: 12000 });
    const raised = decideAuthorization(auth({
      amountCents: 12000,
      openHolds: [{ chainId: 'chain-1', merchantId: 'little-table', amountCents: 10000 }],
      activeIndependentAuths: 1,
      capturedCents: 0,
      consentedMaxCents: 12000,
    }));
    expect(raised).toMatchObject({ decision: 'approve', reason: 'approved', chainId: 'chain-1', holdCents: 12000 });
  });

  it('declines a second independent purchase, the wrong merchant, and an over-budget increase', () => {
    expect(decideAuthorization(auth({
      amountCents: 2000,
      capturedCents: 10000,
      activeIndependentAuths: 1,
    })).reason).toBe('independent_auth');
    expect(decideAuthorization(auth({ merchantId: 'other-cafe' })).reason).toBe('merchant');
    expect(decideAuthorization(auth({
      amountCents: 13000,
      openHolds: [{ chainId: 'chain-1', merchantId: 'little-table', amountCents: 10000 }],
      activeIndependentAuths: 1,
    })).reason).toBe('over_budget');
  });

  it('treats an under-budget final capture as paid and refunds the residual by share', () => {
    const settled = applyMerchantCapture({
      consentedMaxCents: 12000,
      capturedCents: 0,
      openHoldCents: 10000,
      captureCents: 11000,
      final: true,
    });
    expect(settled).toEqual({ outcome: 'paid', capturedCents: 11000, residualCents: 1000 });
    expect(allocateTrackedRefund(1000, [4000, 4000, 4000])).toEqual(allocateCents(1000, [4000, 4000, 4000]));
    expect(allocateTrackedRefund(1000, [4000, 4000, 4000]).reduce((sum, cents) => sum + cents, 0)).toBe(1000);
  });

  it('keeps a partial capture pending and refuses a capture above the consented maximum', () => {
    expect(applyMerchantCapture({
      consentedMaxCents: 12000, capturedCents: 0, openHoldCents: 10000, captureCents: 8000, final: false,
    })).toEqual({ outcome: 'pending', capturedCents: 8000, openHoldCents: 2000 });
    expect(applyMerchantCapture({
      consentedMaxCents: 12000, capturedCents: 0, openHoldCents: 10000, captureCents: 13000, final: true,
    })).toEqual({ outcome: 'over_budget', capturedCents: 0 });
    expect(() => allocateTrackedRefund(500, [100, 100])).toThrow(/exceeds/);
  });
});

describe('collection, checkout, and phase', () => {
  it('voids unspent auths at the collection deadline and after an unused spend window', () => {
    const started = 1_000;
    const deadline = deadlineMs(started, COLLECTION_WINDOW_MS);
    expect(unwindAction({
      nowMs: deadline, collectionDeadlineMs: deadline, spendDeadlineMs: null,
      checkoutOpen: false, openHoldCents: 0, capturedMerchantCents: 0,
    })).toBe('void_auths');
    const spendDeadline = deadlineMs(deadline, SPEND_WINDOW_MS);
    expect(unwindAction({
      nowMs: spendDeadline, collectionDeadlineMs: deadline, spendDeadlineMs: spendDeadline,
      checkoutOpen: true, openHoldCents: 0, capturedMerchantCents: 0,
    })).toBe('void_and_refund');
    expect(unwindAction({
      nowMs: spendDeadline, collectionDeadlineMs: deadline, spendDeadlineMs: spendDeadline,
      checkoutOpen: true, openHoldCents: 10000, capturedMerchantCents: 0,
    })).toBe('block_new_purchases');
  });

  it('derives the phase from collection, funding, merchant exposure, and cancel intent', () => {
    expect(derivePhase(facts({ seats: [{ required: true, status: 'failed' }] }))).toBe('collecting');
    expect(derivePhase(facts({ funding: 'pending' }))).toBe('funding_pending');
    expect(derivePhase(facts({ funding: 'unavailable' }))).toBe('funding_pending');
    expect(derivePhase(facts())).toBe('ready_to_pay');
    expect(checkoutBlockers(facts())).toEqual([]);
    expect(checkoutBlockers(facts({ funding: 'unavailable' }))).toEqual(['funding_unavailable']);
    expect(derivePhase(facts({ openHoldCents: 10000 }))).toBe('payment_pending');
    expect(derivePhase(facts({ capturedMerchantCents: 11000 }))).toBe('paid');
    expect(derivePhase(facts({ overBudget: true, capturedMerchantCents: 11000 }))).toBe('payment_pending');
    expect(derivePhase(facts({ canceled: true, openHoldCents: 10000 }))).toBe('canceling');
    expect(derivePhase(facts({
      canceled: true,
      seats: [{ required: true, status: 'refunded' }],
    }))).toBe('canceled');
  });

  it('declines spending after the spend deadline and before checkout is open', () => {
    expect(decideAuthorization(auth({ nowMs: SPEND_WINDOW_MS })).reason).toBe('spend_window');
    expect(decideAuthorization(auth({ checkoutOpen: false })).reason).toBe('checkout_closed');
  });
});

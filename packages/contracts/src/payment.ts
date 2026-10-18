import { allocateCents } from './allocate';

export const COLLECTION_WINDOW_MS = 15 * 60 * 1000;
export const SPEND_WINDOW_MS = 2 * 60 * 60 * 1000;

export type PaymentProduct = 'hackathon_ledger' | 'spender_reimbursement' | 'sponsored_advance';
export type SpendableResult = 'ready' | 'pending' | 'unavailable';
export type FundingState = 'not_requested' | SpendableResult;
export type SpendInstrumentStatus = 'none' | 'inactive' | 'active' | 'closed';
export type ObligationStatus =
  | 'pending'
  | 'requires_action'
  | 'authorized'
  | 'capture_pending'
  | 'captured'
  | 'voided'
  | 'failed'
  | 'refund_pending'
  | 'refunded';
export type PaymentPhase =
  | 'collecting'
  | 'funding_pending'
  | 'ready_to_pay'
  | 'payment_pending'
  | 'paid'
  | 'canceling'
  | 'canceled';
export type FeeRefundPolicy = 'principal_only';

export type FeeSchedule = {
  version: string;
  percentageBps: number;
  fixedCents: number;
};

export type PricedSeat = {
  merchantShareCents: number;
  disclosedFeeCents: number;
  approvedTotalCents: number;
  subsidyCents: number;
};

export type FrozenSeat = PricedSeat & {
  seatId: string;
  userId: string;
};

export type FrozenItemShare = {
  itemId: string;
  userId: string;
  cents: number;
};

export type FrozenBill = {
  billId: string;
  snapshotId: string;
  version: number;
  hostUserId: string;
  spenderUserId: string;
  currency: 'usd';
  merchantId: string;
  merchantTotalCents: number;
  itemSubtotalCents: number;
  feeScheduleVersion: string;
  feeRefundPolicy: FeeRefundPolicy;
  consentedMaxCents: number;
  seats: FrozenSeat[];
  itemShares: FrozenItemShare[];
};

export type ProductPolicy = {
  product: PaymentProduct;
  holdsCustomerFunds: boolean;
  issuesCard: boolean;
  /** Null means the hackathon simulator advances no real funds. */
  advanceCapCents: number | null;
};

export type OpenHold = {
  chainId: string;
  merchantId: string;
  amountCents: number;
};

export type AuthRequest = {
  merchantId: string;
  currency: string;
  amountCents: number;
  nowMs: number;
  spendDeadlineMs: number;
  checkoutOpen: boolean;
  instrument: SpendInstrumentStatus;
  canceled: boolean;
  consentedMaxCents: number;
  expectedMerchantId: string;
  maxIndependentAuths: number;
  openHolds: OpenHold[];
  capturedCents: number;
  /** Independent authorizations that have not been reversed. */
  activeIndependentAuths: number;
  chainId?: string;
  newChainId: string;
};

export type AuthDecision = {
  decision: 'approve' | 'decline';
  reason: string;
  chainId: string | null;
  holdCents: number;
};

export type CaptureResult =
  | { outcome: 'pending'; capturedCents: number; openHoldCents: number }
  | { outcome: 'paid'; capturedCents: number; residualCents: number }
  | { outcome: 'over_budget'; capturedCents: number };

export type PaymentFacts = {
  canceled: boolean;
  seats: Array<{ required: boolean; status: ObligationStatus }>;
  funding: FundingState;
  openHoldCents: number;
  capturedMerchantCents: number;
  consentedMaxCents: number;
  overBudget: boolean;
};

export type UnwindAction = 'none' | 'void_auths' | 'void_and_refund' | 'block_new_purchases';

const SEAT_TERMINAL = new Set<ObligationStatus>(['voided', 'failed', 'refunded']);

function assertCents(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`Expected nonnegative integer cents for ${label}.`);
}

function assertId(value: string, label: string) {
  if (value.trim() === '') throw new Error(`Expected a ${label}.`);
}

export function deadlineMs(startMs: number, windowMs: number): number {
  if (!Number.isSafeInteger(startMs) || !Number.isSafeInteger(windowMs) || windowMs < 0) {
    throw new Error('Expected a safe start time and nonnegative window.');
  }
  return startMs + windowMs;
}

/** Hackathon ledger, live reimbursement, or a sponsored per-bill advance. No shared pool. */
export function productPolicy(product: PaymentProduct, consentedMaxCents: number): ProductPolicy {
  assertCents(consentedMaxCents, 'consented max');
  switch (product) {
    case 'hackathon_ledger':
      return { product, holdsCustomerFunds: false, issuesCard: true, advanceCapCents: null };
    case 'spender_reimbursement':
      return { product, holdsCustomerFunds: false, issuesCard: false, advanceCapCents: 0 };
    case 'sponsored_advance':
      return { product, holdsCustomerFunds: true, issuesCard: true, advanceCapCents: consentedMaxCents };
  }
}

/** Ceiling charge whose processor fee still leaves the principal intact. */
export function grossUpCharge(principalCents: number, schedule: FeeSchedule): number {
  assertCents(principalCents, 'principal');
  assertCents(schedule.fixedCents, 'fixed fee');
  if (!Number.isSafeInteger(schedule.percentageBps) || schedule.percentageBps < 0 || schedule.percentageBps >= 10_000) {
    throw new Error('Expected a fee rate below 100%.');
  }
  if (principalCents === 0) return 0;
  const numerator = BigInt(principalCents + schedule.fixedCents) * 10_000n;
  const denominator = BigInt(10_000 - schedule.percentageBps);
  const charge = Number((numerator + denominator - 1n) / denominator);
  if (!Number.isSafeInteger(charge)) throw new Error('Charge exceeds a safe integer.');
  return charge;
}

export function priceSeat(merchantShareCents: number, schedule: FeeSchedule, payerIsSpender: boolean): PricedSeat {
  const chargeCents = grossUpCharge(merchantShareCents, schedule);
  const fullFeeCents = chargeCents - merchantShareCents;
  if (payerIsSpender) {
    return {
      merchantShareCents,
      disclosedFeeCents: 0,
      approvedTotalCents: merchantShareCents,
      subsidyCents: fullFeeCents,
    };
  }
  return {
    merchantShareCents,
    disclosedFeeCents: fullFeeCents,
    approvedTotalCents: chargeCents,
    subsidyCents: 0,
  };
}

export function validateFrozenBill(bill: FrozenBill, schedule: FeeSchedule): void {
  assertId(bill.billId, 'bill id');
  assertId(bill.snapshotId, 'snapshot id');
  assertId(bill.hostUserId, 'host');
  assertId(bill.spenderUserId, 'spender');
  assertId(bill.merchantId, 'merchant');
  assertId(bill.feeScheduleVersion, 'fee schedule');
  if (!Number.isSafeInteger(bill.version) || bill.version < 1) throw new Error('Expected a snapshot version.');
  if (bill.currency !== 'usd') throw new Error('Expected USD.');
  if (bill.feeRefundPolicy !== 'principal_only') throw new Error('Expected principal-only fee refunds.');
  if (schedule.version !== bill.feeScheduleVersion) throw new Error('Fee schedule version does not match the snapshot.');
  assertCents(bill.merchantTotalCents, 'merchant total');
  assertCents(bill.itemSubtotalCents, 'item subtotal');
  assertCents(bill.consentedMaxCents, 'consented max');
  if (bill.consentedMaxCents !== bill.merchantTotalCents) throw new Error('Consented maximum must equal the merchant total.');
  if (bill.seats.length === 0) throw new Error('Expected at least one seat.');

  const seatIds = new Set<string>();
  let merchantSum = 0;
  let spenderSeats = 0;
  const payers = new Set<string>();
  for (const seat of bill.seats) {
    assertId(seat.seatId, 'seat id');
    assertId(seat.userId, 'payer');
    if (seatIds.has(seat.seatId)) throw new Error('Duplicate seat.');
    seatIds.add(seat.seatId);
    payers.add(seat.userId);
    const priced = priceSeat(seat.merchantShareCents, schedule, seat.userId === bill.spenderUserId);
    if (seat.userId === bill.spenderUserId) spenderSeats += 1;
    for (const key of ['merchantShareCents', 'disclosedFeeCents', 'approvedTotalCents', 'subsidyCents'] as const) {
      if (seat[key] !== priced[key]) throw new Error('Seat price does not match the fee schedule.');
    }
    merchantSum += seat.merchantShareCents;
  }
  if (spenderSeats === 0) throw new Error('Spender must hold a seat.');
  if (merchantSum !== bill.merchantTotalCents) throw new Error('Seat shares must equal the merchant total.');

  let itemSum = 0;
  for (const share of bill.itemShares) {
    assertId(share.itemId, 'item id');
    assertCents(share.cents, 'item share');
    if (!payers.has(share.userId)) throw new Error('Item share names a payer who has no seat.');
    itemSum += share.cents;
  }
  if (itemSum !== bill.itemSubtotalCents) throw new Error('Item shares must equal the item subtotal.');
}

export function allocateTrackedRefund(amountCents: number, shareWeights: number[]): number[] {
  assertCents(amountCents, 'refund');
  const basis = shareWeights.reduce((sum, weight) => sum + weight, 0);
  if (amountCents > basis) throw new Error('Refund exceeds the recorded share basis.');
  return allocateCents(amountCents, shareWeights);
}

function decline(reason: string, chainId: string | null = null, holdCents = 0): AuthDecision {
  return { decision: 'decline', reason, chainId, holdCents };
}

export function decideAuthorization(request: AuthRequest): AuthDecision {
  assertCents(request.amountCents, 'authorization amount');
  assertCents(request.capturedCents, 'captured amount');
  assertCents(request.consentedMaxCents, 'consented max');
  if (!Number.isSafeInteger(request.maxIndependentAuths) || request.maxIndependentAuths < 1) {
    throw new Error('Expected a positive independent-authorization limit.');
  }
  if (!Number.isSafeInteger(request.activeIndependentAuths) || request.activeIndependentAuths < 0) {
    throw new Error('Expected a nonnegative independent-authorization count.');
  }
  if (!Number.isSafeInteger(request.nowMs) || !Number.isSafeInteger(request.spendDeadlineMs)) {
    throw new Error('Expected a safe authorization time.');
  }
  for (const hold of request.openHolds) {
    assertId(hold.chainId, 'chain id');
    assertCents(hold.amountCents, 'open hold');
  }
  if (request.canceled) return decline('canceled');
  if (request.instrument !== 'active') return decline('instrument_inactive');
  if (!request.checkoutOpen) return decline('checkout_closed');
  if (request.nowMs >= request.spendDeadlineMs) return decline('spend_window');
  if (request.currency !== 'usd') return decline('currency');
  if (request.amountCents === 0) return decline('amount');
  if (request.merchantId !== request.expectedMerchantId) return decline('merchant');

  const sameMerchant = request.openHolds.filter((hold) => hold.merchantId === request.merchantId);
  const linked = request.chainId ? request.openHolds.find((hold) => hold.chainId === request.chainId) : undefined;
  if (request.chainId && (!linked || linked.merchantId !== request.merchantId)) return decline('unknown_chain');

  const existing = linked ?? (sameMerchant.length === 1 ? sameMerchant[0] : undefined);
  if (sameMerchant.length > 1 && !linked) return decline('ambiguous_chain');

  let chainId = existing?.chainId ?? null;
  let holdCents = request.amountCents;
  let newChain = false;
  if (existing) {
    if (request.amountCents < existing.amountCents) return decline('decrease', existing.chainId, existing.amountCents);
    chainId = existing.chainId;
    holdCents = request.amountCents;
  } else {
    assertId(request.newChainId, 'new chain id');
    newChain = true;
    chainId = request.newChainId;
  }

  const otherHolds = request.openHolds.reduce((sum, hold) => sum + (hold.chainId === existing?.chainId ? 0 : hold.amountCents), 0);
  if (request.capturedCents + otherHolds + holdCents > request.consentedMaxCents) {
    return decline('over_budget', chainId, existing?.amountCents ?? 0);
  }
  if (newChain && request.activeIndependentAuths + 1 > request.maxIndependentAuths) {
    return decline('independent_auth');
  }
  return { decision: 'approve', reason: 'approved', chainId, holdCents };
}

export function applyMerchantCapture(input: {
  consentedMaxCents: number;
  capturedCents: number;
  openHoldCents: number;
  captureCents: number;
  final: boolean;
}): CaptureResult {
  assertCents(input.consentedMaxCents, 'consented max');
  assertCents(input.capturedCents, 'captured amount');
  assertCents(input.openHoldCents, 'open hold');
  assertCents(input.captureCents, 'capture');
  const capturedCents = input.capturedCents + input.captureCents;
  if (capturedCents > input.consentedMaxCents) return { outcome: 'over_budget', capturedCents: input.capturedCents };
  if (input.final || input.captureCents >= input.openHoldCents) {
    return { outcome: 'paid', capturedCents, residualCents: input.consentedMaxCents - capturedCents };
  }
  return { outcome: 'pending', capturedCents, openHoldCents: input.openHoldCents - input.captureCents };
}

function requiredSeats(facts: PaymentFacts) {
  return facts.seats.filter((seat) => seat.required);
}

export function derivePhase(facts: PaymentFacts): PaymentPhase {
  assertCents(facts.openHoldCents, 'open hold');
  assertCents(facts.capturedMerchantCents, 'merchant capture');
  assertCents(facts.consentedMaxCents, 'consented max');
  const required = requiredSeats(facts);
  const exposure = facts.openHoldCents > 0 || facts.capturedMerchantCents > 0;
  const settledWithinBudget = facts.capturedMerchantCents > 0
    && facts.openHoldCents === 0
    && facts.capturedMerchantCents <= facts.consentedMaxCents
    && !facts.overBudget;

  if (facts.overBudget || facts.capturedMerchantCents > facts.consentedMaxCents) return 'payment_pending';
  if (settledWithinBudget) return 'paid';
  if (facts.canceled && exposure) return 'canceling';
  if (facts.canceled && required.every((seat) => SEAT_TERMINAL.has(seat.status))) return 'canceled';
  if (facts.canceled) return 'canceling';
  if (facts.openHoldCents > 0) return 'payment_pending';
  if (required.some((seat) => seat.status === 'capture_pending' || seat.status === 'refund_pending')) return 'payment_pending';

  const authorized = required.every((seat) => seat.status === 'authorized');
  if (authorized && (facts.funding === 'pending' || facts.funding === 'unavailable' || facts.funding === 'not_requested')) {
    return 'funding_pending';
  }
  if (authorized && facts.funding === 'ready') return 'ready_to_pay';
  return 'collecting';
}

export function checkoutBlockers(facts: PaymentFacts): Array<'canceled' | 'collection_incomplete' | 'funding_pending' | 'funding_unavailable' | 'over_budget'> {
  const blockers: Array<'canceled' | 'collection_incomplete' | 'funding_pending' | 'funding_unavailable' | 'over_budget'> = [];
  if (facts.canceled) blockers.push('canceled');
  if (facts.overBudget) blockers.push('over_budget');
  const required = requiredSeats(facts);
  if (!required.every((seat) => seat.status === 'authorized')) blockers.push('collection_incomplete');
  if (facts.funding === 'pending' || facts.funding === 'not_requested') blockers.push('funding_pending');
  if (facts.funding === 'unavailable') blockers.push('funding_unavailable');
  return blockers;
}

export function unwindAction(input: {
  nowMs: number;
  collectionDeadlineMs: number;
  spendDeadlineMs: number | null;
  checkoutOpen: boolean;
  openHoldCents: number;
  capturedMerchantCents: number;
}): UnwindAction {
  assertCents(input.openHoldCents, 'open hold');
  assertCents(input.capturedMerchantCents, 'merchant capture');
  if (!Number.isSafeInteger(input.nowMs) || !Number.isSafeInteger(input.collectionDeadlineMs)) {
    throw new Error('Expected a safe collection time.');
  }
  if (input.spendDeadlineMs !== null && !Number.isSafeInteger(input.spendDeadlineMs)) {
    throw new Error('Expected a safe spend deadline.');
  }
  const exposure = input.openHoldCents > 0 || input.capturedMerchantCents > 0;
  const spendEnded = input.spendDeadlineMs !== null && input.nowMs >= input.spendDeadlineMs;
  if (exposure) return input.checkoutOpen && spendEnded ? 'block_new_purchases' : 'none';
  if (input.checkoutOpen) return spendEnded ? 'void_and_refund' : 'none';
  return input.nowMs >= input.collectionDeadlineMs ? 'void_auths' : 'none';
}

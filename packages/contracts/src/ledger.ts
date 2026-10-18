import {
  allocateTrackedRefund,
  applyMerchantCapture,
  checkoutBlockers,
  COLLECTION_WINDOW_MS,
  deadlineMs,
  decideAuthorization,
  derivePhase,
  priceSeat,
  productPolicy,
  SPEND_WINDOW_MS,
  unwindAction,
  validateFrozenBill,
  type AuthDecision,
  type CaptureResult,
  type FeeSchedule,
  type FrozenBill,
  type FrozenSeat,
  type FundingState,
  type ObligationStatus,
  type PaymentFacts,
  type PaymentPhase,
  type SpendInstrumentStatus,
} from './payment';

export const DEMO_FEE_SCHEDULE: FeeSchedule = { version: 'demo-0', percentageBps: 0, fixedCents: 0 };
export const CARD_FEE_SCHEDULE: FeeSchedule = { version: 'card-290-30', percentageBps: 290, fixedCents: 30 };
const SCHEDULES = [DEMO_FEE_SCHEDULE, CARD_FEE_SCHEDULE];

export class LedgerError extends Error {
  constructor(readonly statusCode: number, message: string) {
    super(message);
  }
}

export type ReviewDraft = {
  spenderUserId: string;
  merchantId: string;
  merchantTotalCents: number;
  itemSubtotalCents: number;
  feeScheduleVersion: string;
  seats: Array<{ seatId: string; userId: string; merchantShareCents: number }>;
  itemShares: Array<{ itemId: string; userId: string; cents: number }>;
};

export type MerchantScenario = 'exact' | 'under' | 'incremental' | 'wrong_merchant' | 'reverse' | 'late_capture';

export type SeatProjection = {
  obligationId: string;
  seatId: string;
  userId: string;
  merchantShareCents: number;
  approvedTotalCents: number;
  status: 'pending' | 'action_needed' | 'authorized' | 'captured' | 'voided' | 'refunded';
  canRetry: boolean;
  pendingRefundCents: number;
};

export type SessionProjection = {
  sessionId: string;
  billId: string;
  phase: PaymentPhase;
  simulated: true;
  label: 'SIMULATED';
  hostUserId: string;
  spenderUserId: string;
  merchantId: string;
  merchantTotalCents: number;
  cardBudgetCents: number;
  funding: FundingState;
  collectionDeadlineMs: number | null;
  spendDeadlineMs: number | null;
  spendingBlocked: boolean;
  checkoutOpen: boolean;
  windowClosed: 'collection' | 'spend' | null;
  blockers: string[];
  seats: SeatProjection[];
  cases: Array<{ kind: string; open: boolean }>;
  pendingRefundCents: number;
};

export type CardProjection = {
  simulated: boolean;
  label: 'SIMULATED' | 'STRIPE';
  last4: string | null;
  budgetCents: number;
  spendDeadlineMs: number | null;
  spendingBlocked: boolean;
  instrument: SpendInstrumentStatus;
  phase: PaymentPhase;
};

export type BillProjection = {
  billId: string;
  hostUserId: string;
  snapshotId: string | null;
  spenderUserId: string | null;
  acceptedUserIds: string[];
  session: SessionProjection | null;
  card: CardProjection | null;
};

type Obligation = {
  obligationId: string;
  seatId: string;
  userId: string;
  merchantShareCents: number;
  approvedTotalCents: number;
  required: boolean;
  status: ObligationStatus;
  superseded: boolean;
  attempts: string[];
  pendingRefundCents: number;
};

type Hold = { chainId: string; merchantId: string; amountCents: number; status: 'approved' | 'reversed' | 'captured' };
type Job = { id: string; kind: string; operationKey: string; status: 'pending' | 'completed' };
type RefundRow = { id: string; obligationId: string; amountCents: number; status: 'pending' | 'refunded' };
type Inbox = { id: string; applied: boolean };

type Session = {
  id: string;
  createdAtMs: number;
  collectionDeadlineMs: number;
  cancelRequestedAtMs: number | null;
  funding: FundingState;
  fundingReadyAtMs: number | null;
  obligations: Obligation[];
  holds: Hold[];
  capturedMerchantCents: number;
  cases: Array<{ id: string; kind: string; open: boolean }>;
  checkoutOpen: boolean;
  instrument: SpendInstrumentStatus;
  spendOpenedAtMs: number | null;
  spendDeadlineMs: number | null;
  spendingBlocked: boolean;
  activeIndependentAuths: number;
  cardId: string | null;
  last4: string | null;
  cardProvider: 'simulated' | 'stripe';
  jobs: Job[];
  refunds: RefundRow[];
  inbox: Inbox[];
  windowClosed: 'collection' | 'spend' | null;
};

type Bill = {
  billId: string;
  hostUserId: string;
  snapshot: FrozenBill | null;
  schedule: FeeSchedule | null;
  acceptances: Map<string, { snapshotId: string; approvedTotalCents: number }>;
  session: Session | null;
  fundingPlan: 'pending_then_ready' | 'unavailable';
};

type Cached = { hash: string; value: unknown };

export class PaymentLedger {
  private readonly bills = new Map<string, Bill>();
  private readonly cardholders = new Set<string>();
  private readonly idempotency = new Map<string, Cached>();
  private readonly quarantine = new Set<string>();
  private readonly fundingDelayMs: number;
  private readonly id: () => string;

  constructor(options: { fundingDelayMs?: number; ids?: () => string } = {}) {
    this.fundingDelayMs = options.fundingDelayMs ?? 1_500;
    let sequence = 0;
    this.id = options.ids ?? (() => {
      sequence += 1;
      return `pay_${sequence}`;
    });
  }

  review(callerUserId: string, billId: string, draft: ReviewDraft, nowMs: number): BillProjection {
    const bill = this.bill(billId, callerUserId);
    this.requireHost(bill, callerUserId);
    if (bill.session) throw new LedgerError(409, 'Collection already started.');
    const schedule = SCHEDULES.find((entry) => entry.version === draft.feeScheduleVersion);
    if (!schedule) throw new LedgerError(422, 'Unknown fee schedule.');
    let snapshot: FrozenBill;
    try {
      const policy = productPolicy('hackathon_ledger', draft.merchantTotalCents);
      if (!policy.issuesCard || policy.advanceCapCents !== null) throw new LedgerError(409, 'This build only simulates a per-bill ledger.');
      const seats: FrozenSeat[] = draft.seats.map((seat) => ({
        ...seat,
        ...priceSeat(seat.merchantShareCents, schedule, seat.userId === draft.spenderUserId),
      }));
      snapshot = {
        billId,
        snapshotId: this.id(),
        version: (bill.snapshot?.version ?? 0) + 1,
        hostUserId: bill.hostUserId,
        spenderUserId: draft.spenderUserId,
        currency: 'usd',
        merchantId: draft.merchantId,
        merchantTotalCents: draft.merchantTotalCents,
        itemSubtotalCents: draft.itemSubtotalCents,
        feeScheduleVersion: schedule.version,
        feeRefundPolicy: 'principal_only',
        consentedMaxCents: draft.merchantTotalCents,
        seats,
        itemShares: draft.itemShares,
      };
      validateFrozenBill(snapshot, schedule);
    } catch (error) {
      if (error instanceof LedgerError) throw error;
      throw new LedgerError(422, error instanceof Error ? error.message : 'Invalid snapshot.');
    }
    bill.snapshot = snapshot;
    bill.schedule = schedule;
    bill.acceptances.clear();
    void nowMs;
    return this.project(callerUserId, bill);
  }

  reopen(callerUserId: string, billId: string): BillProjection {
    const bill = this.requireBill(billId, callerUserId);
    this.requireHost(bill, callerUserId);
    if (bill.session) throw new LedgerError(409, 'Collection already started.');
    bill.snapshot = null;
    bill.schedule = null;
    bill.acceptances.clear();
    return this.project(callerUserId, bill);
  }

  accept(callerUserId: string, billId: string): BillProjection {
    const bill = this.requireBill(billId, callerUserId);
    const snapshot = this.requireSnapshot(bill);
    if (bill.session) throw new LedgerError(409, 'Collection already started.');
    const mine = snapshot.seats.filter((seat) => seat.userId === callerUserId && seat.merchantShareCents > 0);
    if (mine.length === 0) throw new LedgerError(403, 'You do not have a share to accept.');
    const approvedTotalCents = mine.reduce((sum, seat) => sum + seat.approvedTotalCents, 0);
    bill.acceptances.set(callerUserId, { snapshotId: snapshot.snapshotId, approvedTotalCents });
    return this.project(callerUserId, bill);
  }

  confirm(callerUserId: string, billId: string, operationKey: string, nowMs: number): SessionProjection {
    return this.once(`confirm:${billId}:${callerUserId}:${operationKey}`, operationKey, () => {
      const bill = this.requireBill(billId, callerUserId);
      this.requireHost(bill, callerUserId);
      const snapshot = this.requireSnapshot(bill);
      if (bill.session && bill.session.cancelRequestedAtMs == null) return this.sessionProjection(bill);
      if (bill.session) throw new LedgerError(409, 'This snapshot was canceled. Freeze a new bill.');
      for (const seat of snapshot.seats) {
        if (seat.merchantShareCents === 0) continue;
        const acceptance = bill.acceptances.get(seat.userId);
        const expected = snapshot.seats.filter((entry) => entry.userId === seat.userId)
          .reduce((sum, entry) => sum + entry.approvedTotalCents, 0);
        if (!acceptance || acceptance.snapshotId !== snapshot.snapshotId || acceptance.approvedTotalCents !== expected) {
          throw new LedgerError(409, 'Every payer must accept their frozen share.');
        }
      }
      bill.session = this.freshSession(snapshot, nowMs);
      return this.sessionProjection(bill);
    });
  }

  authorize(callerUserId: string, sessionId: string, operationKey: string, nowMs: number, outcome: 'approve' | 'fail' | 'action' = 'approve'): SessionProjection {
    return this.once(`authorize:${sessionId}:${callerUserId}:${operationKey}`, `${operationKey}:${outcome}`, () => {
      const bill = this.requireSession(sessionId, callerUserId);
      this.applyTime(bill, nowMs);
      const session = bill.session!;
      if (session.windowClosed) throw new LedgerError(409, 'The collection window is closed.');
      const mine = this.active(session).filter((seat) => seat.userId === callerUserId && seat.required);
      if (mine.length === 0) throw new LedgerError(403, 'You do not have a share to authorize.');
      for (const seat of mine) {
        if (seat.status === 'failed' || seat.status === 'requires_action' || seat.status === 'refunded') {
          throw new LedgerError(409, 'Retry that share instead of starting a second authorization.');
        }
        if (seat.status !== 'pending') continue;
        this.enqueue(session, 'authorize', `${operationKey}:${seat.obligationId}`);
        seat.attempts.push(operationKey);
        if (session.cancelRequestedAtMs != null || outcome === 'fail') {
          seat.status = session.cancelRequestedAtMs != null ? 'voided' : 'failed';
        } else if (outcome === 'action') {
          seat.status = 'requires_action';
        } else {
          seat.status = 'authorized';
        }
        this.completeJobs(session, `${operationKey}:${seat.obligationId}`);
      }
      this.ensureSpendable(bill, nowMs);
      return this.sessionProjection(bill);
    });
  }

  retry(callerUserId: string, sessionId: string, operationKey: string, nowMs: number): SessionProjection {
    return this.once(`retry:${sessionId}:${callerUserId}:${operationKey}`, operationKey, () => {
      const bill = this.requireSession(sessionId, callerUserId);
      this.applyTime(bill, nowMs);
      const session = bill.session!;
      if (session.windowClosed || session.cancelRequestedAtMs != null) throw new LedgerError(409, 'This session is not collecting new authorizations.');
      const mine = this.active(session).filter((seat) => seat.userId === callerUserId && seat.required
        && (seat.status === 'failed' || seat.status === 'requires_action' || seat.status === 'refunded'));
      if (mine.length === 0) throw new LedgerError(409, 'There is no failed share to retry.');
      for (const seat of mine) {
        this.enqueue(session, 'authorize', `${operationKey}:${seat.obligationId}`);
        seat.attempts.push(operationKey);
        seat.status = 'authorized';
        seat.pendingRefundCents = 0;
        this.completeJobs(session, `${operationKey}:${seat.obligationId}`);
      }
      this.ensureSpendable(bill, nowMs);
      return this.sessionProjection(bill);
    });
  }

  cover(callerUserId: string, sessionId: string, seatId: string, nowMs: number): SessionProjection {
    const bill = this.requireSession(sessionId, callerUserId);
    this.applyTime(bill, nowMs);
    const session = bill.session!;
    const snapshot = this.requireSnapshot(bill);
    if (!bill.schedule) throw new LedgerError(409, 'The snapshot has no fee schedule.');
    if (session.checkoutOpen || session.capturedMerchantCents > 0) throw new LedgerError(409, 'That share can no longer be covered.');
    const current = this.active(session).find((seat) => seat.seatId === seatId);
    if (!current || !current.required) throw new LedgerError(404, 'Seat not found.');
    if (current.status === 'captured' || current.status === 'capture_pending') throw new LedgerError(409, 'That share is already captured.');
    if (current.userId === callerUserId) throw new LedgerError(409, 'You already hold that seat.');
    if (current.status === 'authorized') {
      this.enqueue(session, 'void', `cover-void:${current.obligationId}`);
      current.status = 'voided';
      this.completeJobs(session, `cover-void:${current.obligationId}`);
    }
    current.superseded = true;
    const priced = priceSeat(current.merchantShareCents, bill.schedule, callerUserId === snapshot.spenderUserId);
    session.obligations.push({
      obligationId: this.id(),
      seatId,
      userId: callerUserId,
      merchantShareCents: priced.merchantShareCents,
      approvedTotalCents: priced.approvedTotalCents,
      required: true,
      status: 'pending',
      superseded: false,
      attempts: [],
      pendingRefundCents: 0,
    });
    this.ensureSpendable(bill, nowMs);
    return this.sessionProjection(bill);
  }

  checkout(callerUserId: string, sessionId: string, operationKey: string, nowMs: number, issued?: { cardId: string; last4: string }): CardProjection {
    return this.once(`checkout:${sessionId}:${operationKey}`, operationKey, () => {
      const bill = this.requireSession(sessionId, callerUserId);
      this.applyTime(bill, nowMs);
      const snapshot = this.requireSnapshot(bill);
      if (callerUserId !== snapshot.spenderUserId) throw new LedgerError(403, 'Only the spender can open checkout.');
      const session = bill.session!;
      const blockers = checkoutBlockers(this.facts(bill));
      if (blockers.length > 0) throw new LedgerError(409, `Checkout is closed: ${blockers.join(', ')}.`);
      if (!session.cardId) {
        if (issued && (!issued.cardId.trim() || !/^\d{4}$/.test(issued.last4))) throw new LedgerError(502, 'Stripe did not return a card.');
        this.enqueue(session, 'create_card', operationKey);
        this.cardholders.add(snapshot.spenderUserId);
        session.cardId = issued?.cardId ?? this.id();
        session.last4 = issued?.last4 ?? '4242';
        session.cardProvider = issued ? 'stripe' : 'simulated';
        session.instrument = 'active';
        session.checkoutOpen = true;
        session.spendOpenedAtMs = nowMs;
        session.spendDeadlineMs = deadlineMs(nowMs, SPEND_WINDOW_MS);
        this.completeJobs(session, operationKey);
      }
      return this.cardProjection(bill);
    });
  }

  declineCard(callerUserId: string, sessionId: string, operationKey: string, nowMs: number): SessionProjection {
    return this.once(`decline:${sessionId}:${operationKey}`, operationKey, () => {
      const bill = this.requireSession(sessionId, callerUserId);
      this.requireHost(bill, callerUserId);
      this.applyTime(bill, nowMs);
      const session = bill.session!;
      const snapshot = this.requireSnapshot(bill);
      if (session.capturedMerchantCents > 0) throw new LedgerError(409, 'The restaurant already captured this charge.');
      if (!session.cardId) throw new LedgerError(409, 'The card has not been opened.');
      for (const seat of snapshot.seats) {
        if (seat.merchantShareCents === 0) continue;
        const acceptance = bill.acceptances.get(seat.userId);
        const expected = snapshot.seats.filter((entry) => entry.userId === seat.userId)
          .reduce((sum, entry) => sum + entry.approvedTotalCents, 0);
        if (!acceptance || acceptance.snapshotId !== snapshot.snapshotId || acceptance.approvedTotalCents !== expected) {
          throw new LedgerError(409, 'Every payer must still accept the frozen share.');
        }
      }
      this.releaseDeclinedPool(session);
      bill.session = this.freshSession(snapshot, nowMs);
      return this.sessionProjection(bill);
    });
  }

  cancel(callerUserId: string, sessionId: string, operationKey: string, nowMs: number): SessionProjection {
    return this.once(`cancel:${sessionId}:${operationKey}`, operationKey, () => {
      const bill = this.requireSession(sessionId, callerUserId);
      this.requireHost(bill, callerUserId);
      const session = bill.session!;
      if (session.cancelRequestedAtMs == null) session.cancelRequestedAtMs = nowMs;
      this.applyTime(bill, nowMs);
      this.unwindCanceled(bill);
      return this.sessionProjection(bill);
    });
  }

  merchantEvent(callerUserId: string, sessionId: string, scenario: MerchantScenario, operationKey: string, nowMs: number): SessionProjection {
    return this.once(`merchant:${sessionId}:${operationKey}`, `${scenario}:${operationKey}`, () => {
      const bill = this.requireSession(sessionId, callerUserId);
      const snapshot = this.requireSnapshot(bill);
      if (callerUserId !== snapshot.spenderUserId && callerUserId !== bill.hostUserId) {
        throw new LedgerError(403, 'Only the spender can run a simulated merchant charge.');
      }
      this.applyTime(bill, nowMs);
      const session = bill.session!;
      const max = snapshot.consentedMaxCents;
      const approved = (amountCents: number, merchantId: string) => this.authorizeMerchant(bill, amountCents, merchantId, nowMs).decision === 'approve';
      if (scenario === 'wrong_merchant') {
        this.authorizeMerchant(bill, Math.max(1, max), 'other-merchant', nowMs);
      } else if (scenario === 'exact' && approved(max, snapshot.merchantId)) {
        this.captureMerchant(bill, max, true);
      } else if (scenario === 'under' && approved(max, snapshot.merchantId)) {
        this.captureMerchant(bill, max > 100 ? max - 100 : Math.floor(max / 2), true);
      } else if (scenario === 'incremental' && approved(Math.max(1, Math.floor(max * 0.8)), snapshot.merchantId) && approved(max, snapshot.merchantId)) {
        this.captureMerchant(bill, max, true);
      } else if (scenario === 'reverse' && approved(max, snapshot.merchantId)) {
        this.reverseMerchant(bill);
      } else if (scenario === 'late_capture') {
        if (this.openHoldCents(session) === 0) approved(max, snapshot.merchantId);
        else this.captureMerchant(bill, this.openHoldCents(session), true);
      }
      return this.sessionProjection(bill);
    });
  }

  /** Test seam for a capture above the consented budget. The client API does not expose an amount. */
  captureAboveBudget(callerUserId: string, sessionId: string, nowMs: number): SessionProjection {
    const bill = this.requireSession(sessionId, callerUserId);
    this.applyTime(bill, nowMs);
    const snapshot = this.requireSnapshot(bill);
    if (this.openHoldCents(bill.session!) === 0) this.authorizeMerchant(bill, snapshot.consentedMaxCents, snapshot.merchantId, nowMs);
    this.captureMerchant(bill, snapshot.consentedMaxCents + 1, true);
    return this.sessionProjection(bill);
  }

  dispute(callerUserId: string, sessionId: string, nowMs: number): SessionProjection {
    const bill = this.requireSession(sessionId, callerUserId);
    this.applyTime(bill, nowMs);
    const session = bill.session!;
    if (this.facts(bill).capturedMerchantCents <= 0) throw new LedgerError(409, 'There is no merchant capture to dispute.');
    const before = this.active(session).map((seat) => ({ ...seat }));
    session.cases.push({ id: this.id(), kind: 'dispute', open: true });
    this.active(session).forEach((seat, index) => {
      seat.approvedTotalCents = before[index].approvedTotalCents;
      seat.merchantShareCents = before[index].merchantShareCents;
      seat.status = before[index].status;
    });
    return this.sessionProjection(bill);
  }

  applyCollectionEvent(event: { id: string; type: 'authorization.succeeded' | 'authorization.failed' | 'refund.succeeded'; obligationId: string }): { applied: boolean } {
    if (this.quarantine.has(event.id)) return { applied: false };
    for (const bill of this.bills.values()) {
      const session = bill.session;
      if (!session) continue;
      if (session.inbox.some((entry) => entry.id === event.id)) return { applied: false };
      const seat = session.obligations.find((entry) => entry.obligationId === event.obligationId && !entry.superseded);
      if (!seat) continue;
      session.inbox.push({ id: event.id, applied: false });
      const record = session.inbox[session.inbox.length - 1];
      if (event.type === 'authorization.failed') {
        if (seat.status === 'authorized' || seat.status === 'captured' || seat.status === 'refunded') return { applied: false };
        seat.status = 'failed';
        record.applied = true;
        return { applied: true };
      }
      if (event.type === 'authorization.succeeded') {
        if (session.cancelRequestedAtMs != null) {
          this.enqueue(session, 'void', `late:${event.id}`);
          seat.status = 'voided';
          this.completeJobs(session, `late:${event.id}`);
          record.applied = true;
          return { applied: true };
        }
        if (seat.status === 'pending' || seat.status === 'requires_action' || seat.status === 'failed') {
          seat.status = 'authorized';
          this.ensureSpendable(bill, session.createdAtMs);
          record.applied = true;
          return { applied: true };
        }
        return { applied: false };
      }
      const refund = session.refunds.find((entry) => entry.obligationId === seat.obligationId && entry.status === 'pending');
      if (!refund) return { applied: false };
      refund.status = 'refunded';
      seat.pendingRefundCents = Math.max(0, seat.pendingRefundCents - refund.amountCents);
      record.applied = true;
      return { applied: true };
    }
    this.quarantine.add(event.id);
    return { applied: false };
  }

  session(callerUserId: string, sessionId: string, nowMs: number): SessionProjection {
    const bill = this.requireSession(sessionId, callerUserId);
    this.applyTime(bill, nowMs);
    return this.sessionProjection(bill);
  }

  card(callerUserId: string, sessionId: string, nowMs: number): CardProjection {
    const bill = this.requireSession(sessionId, callerUserId);
    const snapshot = this.requireSnapshot(bill);
    if (callerUserId !== snapshot.spenderUserId) throw new LedgerError(403, 'Only the spender can view the card.');
    this.applyTime(bill, nowMs);
    return this.cardProjection(bill);
  }

  cardAccess(callerUserId: string, sessionId: string, nowMs: number): { simulated: boolean; label: 'SIMULATED' | 'STRIPE'; last4: string; expiresAtMs: number; budgetCents: number } {
    const bill = this.requireSession(sessionId, callerUserId);
    const snapshot = this.requireSnapshot(bill);
    if (callerUserId !== snapshot.spenderUserId) throw new LedgerError(403, 'Only the spender can view the card.');
    this.applyTime(bill, nowMs);
    const session = bill.session!;
    if (!session.last4 || !session.cardId) throw new LedgerError(409, 'Checkout has not created a card.');
    const stripe = session.cardProvider === 'stripe';
    return { simulated: !stripe, label: stripe ? 'STRIPE' : 'SIMULATED', last4: session.last4, expiresAtMs: nowMs + 60_000, budgetCents: snapshot.consentedMaxCents };
  }

  peekBill(callerUserId: string, billId: string, nowMs: number): BillProjection | null {
    const bill = this.bills.get(billId);
    if (!bill || !this.isMember(bill, callerUserId)) return null;
    this.applyTime(bill, nowMs);
    return this.project(callerUserId, bill);
  }

  billView(callerUserId: string, billId: string, nowMs: number): BillProjection {
    const bill = this.requireBill(billId, callerUserId);
    this.applyTime(bill, nowMs);
    return this.project(callerUserId, bill);
  }

  useUnavailableFunding(callerUserId: string, billId: string): void {
    const bill = this.requireBill(billId, callerUserId);
    this.requireHost(bill, callerUserId);
    if (bill.session?.funding === 'ready') throw new LedgerError(409, 'Funding is already ready.');
    bill.fundingPlan = 'unavailable';
  }

  tick(nowMs: number): boolean {
    let changed = false;
    for (const bill of this.bills.values()) {
      if (bill.session && this.applyTime(bill, nowMs)) changed = true;
    }
    return changed;
  }

  cardholderCount(userId: string): number {
    return this.cardholders.has(userId) ? 1 : 0;
  }

  private once<T>(scope: string, hash: string, fn: () => T): T {
    const existing = this.idempotency.get(scope);
    if (existing) {
      if (existing.hash !== hash) throw new LedgerError(409, 'Idempotency key was reused with a different request.');
      return existing.value as T;
    }
    const value = fn();
    this.idempotency.set(scope, { hash, value: JSON.parse(JSON.stringify(value)) as T });
    return value;
  }

  private bill(billId: string, hostUserId: string): Bill {
    const existing = this.bills.get(billId);
    if (existing) return existing;
    const created: Bill = { billId, hostUserId, snapshot: null, schedule: null, acceptances: new Map(), session: null, fundingPlan: 'pending_then_ready' };
    this.bills.set(billId, created);
    return created;
  }

  private requireBill(billId: string, callerUserId: string): Bill {
    const bill = this.bills.get(billId);
    if (!bill || !this.isMember(bill, callerUserId)) throw new LedgerError(404, 'Bill not found.');
    return bill;
  }

  private requireSession(sessionId: string, callerUserId: string): Bill {
    for (const bill of this.bills.values()) {
      if (bill.session?.id === sessionId) {
        if (!this.isMember(bill, callerUserId)) throw new LedgerError(404, 'Payment session not found.');
        return bill;
      }
    }
    throw new LedgerError(404, 'Payment session not found.');
  }

  private requireSnapshot(bill: Bill): FrozenBill {
    if (!bill.snapshot) throw new LedgerError(409, 'Freeze the bill before collecting.');
    return bill.snapshot;
  }

  private requireHost(bill: Bill, callerUserId: string) {
    if (bill.hostUserId !== callerUserId) throw new LedgerError(403, 'Only the host can do that.');
  }

  private isMember(bill: Bill, callerUserId: string): boolean {
    if (bill.hostUserId === callerUserId) return true;
    if (bill.snapshot?.seats.some((seat) => seat.userId === callerUserId)) return true;
    return bill.session?.obligations.some((seat) => seat.userId === callerUserId) ?? false;
  }

  private active(session: Session): Obligation[] {
    return session.obligations.filter((seat) => !seat.superseded);
  }

  private facts(bill: Bill): PaymentFacts {
    const session = bill.session;
    const snapshot = bill.snapshot;
    return {
      canceled: session?.cancelRequestedAtMs != null,
      seats: session ? this.active(session).map((seat) => ({ required: seat.required, status: seat.status })) : [],
      funding: session?.funding ?? 'not_requested',
      openHoldCents: session ? this.openHoldCents(session) : 0,
      capturedMerchantCents: session?.capturedMerchantCents ?? 0,
      consentedMaxCents: snapshot?.consentedMaxCents ?? 0,
      overBudget: session?.cases.some((entry) => entry.kind === 'over_budget' && entry.open) ?? false,
    };
  }

  private openHoldCents(session: Session): number {
    return session.holds.filter((hold) => hold.status === 'approved').reduce((sum, hold) => sum + hold.amountCents, 0);
  }

  private ensureSpendable(bill: Bill, nowMs: number) {
    const session = bill.session;
    if (!session) return;
    const required = this.active(session).filter((seat) => seat.required);
    if (!required.every((seat) => seat.status === 'authorized')) {
      if (session.funding !== 'ready') {
        session.funding = 'not_requested';
        session.fundingReadyAtMs = null;
      }
      return;
    }
    if (session.funding === 'ready' || session.funding === 'unavailable') return;
    if (bill.fundingPlan === 'unavailable') {
      session.funding = 'unavailable';
      session.fundingReadyAtMs = null;
      return;
    }
    if (session.funding === 'not_requested') {
      session.funding = 'pending';
      session.fundingReadyAtMs = nowMs + this.fundingDelayMs;
    }
    if (session.funding === 'pending' && session.fundingReadyAtMs != null && nowMs >= session.fundingReadyAtMs) {
      session.funding = 'ready';
    }
  }

  private applyTime(bill: Bill, nowMs: number): boolean {
    const session = bill.session;
    if (!session) return false;
    const before = JSON.stringify([session.funding, session.windowClosed, session.spendingBlocked, this.active(session).map((seat) => seat.status), session.cancelRequestedAtMs]);
    this.ensureSpendable(bill, nowMs);
    if (!session.checkoutOpen && session.cancelRequestedAtMs == null) {
      const action = unwindAction({
        nowMs,
        collectionDeadlineMs: session.collectionDeadlineMs,
        spendDeadlineMs: session.spendDeadlineMs,
        checkoutOpen: false,
        openHoldCents: this.openHoldCents(session),
        capturedMerchantCents: session.capturedMerchantCents,
      });
      if (action === 'void_auths') this.voidUnused(session, 'collection');
    } else if (session.spendDeadlineMs != null) {
      const action = unwindAction({
        nowMs,
        collectionDeadlineMs: session.collectionDeadlineMs,
        spendDeadlineMs: session.spendDeadlineMs,
        checkoutOpen: session.checkoutOpen,
        openHoldCents: this.openHoldCents(session),
        capturedMerchantCents: session.capturedMerchantCents,
      });
      if (action === 'void_and_refund') this.voidAndRefund(session);
      if (action === 'block_new_purchases') session.spendingBlocked = true;
    }
    if (session.cancelRequestedAtMs != null) this.unwindCanceled(bill);
    const after = JSON.stringify([session.funding, session.windowClosed, session.spendingBlocked, this.active(session).map((seat) => seat.status), session.cancelRequestedAtMs]);
    return before !== after;
  }

  private freshSession(snapshot: FrozenBill, nowMs: number): Session {
    return {
      id: this.id(),
      createdAtMs: nowMs,
      collectionDeadlineMs: deadlineMs(nowMs, COLLECTION_WINDOW_MS),
      cancelRequestedAtMs: null,
      funding: 'not_requested',
      fundingReadyAtMs: null,
      obligations: snapshot.seats.map((seat) => ({
        obligationId: this.id(),
        seatId: seat.seatId,
        userId: seat.userId,
        merchantShareCents: seat.merchantShareCents,
        approvedTotalCents: seat.approvedTotalCents,
        required: seat.merchantShareCents > 0,
        status: 'pending' as const,
        superseded: false,
        attempts: [],
        pendingRefundCents: 0,
      })),
      holds: [],
      capturedMerchantCents: 0,
      cases: [],
      checkoutOpen: false,
      instrument: 'none',
      spendOpenedAtMs: null,
      spendDeadlineMs: null,
      spendingBlocked: false,
      activeIndependentAuths: 0,
      cardId: null,
      last4: null,
      cardProvider: 'simulated',
      jobs: [],
      refunds: [],
      inbox: [],
      windowClosed: null,
    };
  }

  private releaseDeclinedPool(session: Session) {
    for (const hold of session.holds) if (hold.status === 'approved') hold.status = 'reversed';
    session.activeIndependentAuths = 0;
    for (const seat of this.active(session)) {
      if (!seat.required) continue;
      if (seat.status === 'captured' || seat.status === 'capture_pending') {
        this.enqueue(session, 'refund', `decline:${seat.obligationId}`);
        session.refunds.push({ id: this.id(), obligationId: seat.obligationId, amountCents: seat.merchantShareCents, status: 'refunded' });
        seat.status = 'refunded';
        seat.pendingRefundCents = 0;
        this.completeJobs(session, `decline:${seat.obligationId}`);
      } else if (seat.status === 'authorized' || seat.status === 'pending' || seat.status === 'requires_action' || seat.status === 'failed') {
        this.enqueue(session, 'void', `decline:${seat.obligationId}`);
        seat.status = 'voided';
        this.completeJobs(session, `decline:${seat.obligationId}`);
      }
    }
    session.checkoutOpen = false;
    if (session.instrument === 'active') session.instrument = 'closed';
  }

  private voidUnused(session: Session, reason: 'collection' | 'spend') {
    for (const seat of this.active(session)) {
      if (!seat.required) continue;
      if (seat.status === 'authorized' || seat.status === 'pending' || seat.status === 'requires_action' || seat.status === 'failed') {
        this.enqueue(session, 'void', `window:${seat.obligationId}`);
        seat.status = 'voided';
        this.completeJobs(session, `window:${seat.obligationId}`);
      }
    }
    session.windowClosed = reason;
    if (reason === 'spend') {
      session.instrument = 'closed';
      session.checkoutOpen = false;
    }
  }

  private voidAndRefund(session: Session) {
    for (const seat of this.active(session)) {
      if (!seat.required) continue;
      if (seat.status === 'captured' || seat.status === 'capture_pending') {
        this.enqueue(session, 'refund', `window-refund:${seat.obligationId}`);
        seat.status = 'refunded';
        seat.pendingRefundCents = 0;
        this.completeJobs(session, `window-refund:${seat.obligationId}`);
      }
    }
    this.voidUnused(session, 'spend');
  }

  private unwindCanceled(bill: Bill) {
    const session = bill.session;
    if (!session || session.cancelRequestedAtMs == null) return;
    const exposure = this.openHoldCents(session) > 0 || session.capturedMerchantCents > 0;
    if (exposure) return;
    for (const seat of this.active(session)) {
      if (seat.status === 'authorized' || seat.status === 'pending' || seat.status === 'requires_action') {
        this.enqueue(session, 'void', `cancel:${seat.obligationId}`);
        seat.status = 'voided';
        this.completeJobs(session, `cancel:${seat.obligationId}`);
      } else if (seat.status === 'captured' || seat.status === 'capture_pending') {
        this.enqueue(session, 'refund', `cancel-refund:${seat.obligationId}`);
        seat.status = 'refunded';
        this.completeJobs(session, `cancel-refund:${seat.obligationId}`);
      }
    }
    session.checkoutOpen = false;
    if (session.instrument === 'active') session.instrument = 'closed';
  }

  private authorizeMerchant(bill: Bill, amountCents: number, merchantId: string, nowMs: number): AuthDecision {
    const session = bill.session!;
    const snapshot = this.requireSnapshot(bill);
    if (session.spendingBlocked) {
      return { decision: 'decline', reason: 'spend_window', chainId: null, holdCents: 0 };
    }
    const openHolds = session.holds.filter((hold) => hold.status === 'approved')
      .map((hold) => ({ chainId: hold.chainId, merchantId: hold.merchantId, amountCents: hold.amountCents }));
    const decision = decideAuthorization({
      merchantId,
      currency: 'usd',
      amountCents,
      nowMs,
      spendDeadlineMs: session.spendDeadlineMs ?? nowMs,
      checkoutOpen: session.checkoutOpen,
      instrument: session.instrument,
      canceled: session.cancelRequestedAtMs != null,
      consentedMaxCents: snapshot.consentedMaxCents,
      expectedMerchantId: snapshot.merchantId,
      maxIndependentAuths: 1,
      openHolds,
      capturedCents: session.capturedMerchantCents,
      activeIndependentAuths: session.activeIndependentAuths,
      newChainId: this.id(),
    });
    if (decision.decision === 'decline' || !decision.chainId) return decision;
    const existing = session.holds.find((hold) => hold.chainId === decision.chainId && hold.status === 'approved');
    if (existing) existing.amountCents = decision.holdCents;
    else {
      session.holds.push({ chainId: decision.chainId, merchantId, amountCents: decision.holdCents, status: 'approved' });
      session.activeIndependentAuths += 1;
    }
    this.capturePayers(session);
    return decision;
  }

  private capturePayers(session: Session) {
    for (const seat of this.active(session)) {
      if (!seat.required || seat.status !== 'authorized') continue;
      this.enqueue(session, 'capture_payer', `capture:${seat.obligationId}`);
      seat.status = 'captured';
      this.completeJobs(session, `capture:${seat.obligationId}`);
    }
  }

  private captureMerchant(bill: Bill, amountCents: number, final: boolean): CaptureResult {
    const session = bill.session!;
    const snapshot = this.requireSnapshot(bill);
    const result = applyMerchantCapture({
      consentedMaxCents: snapshot.consentedMaxCents,
      capturedCents: session.capturedMerchantCents,
      openHoldCents: this.openHoldCents(session),
      captureCents: amountCents,
      final,
    });
    if (result.outcome === 'over_budget') {
      session.cases.push({ id: this.id(), kind: 'over_budget', open: true });
      return result;
    }
    session.capturedMerchantCents = result.capturedCents;
    const hold = session.holds.find((entry) => entry.status === 'approved');
    if (result.outcome === 'pending' && hold) hold.amountCents = result.openHoldCents;
    if (result.outcome === 'paid') {
      for (const entry of session.holds) if (entry.status === 'approved') entry.status = 'captured';
      if (result.residualCents > 0) this.refundResidual(session, result.residualCents);
    }
    return result;
  }

  private refundResidual(session: Session, residualCents: number) {
    const seats = this.active(session).filter((seat) => seat.required);
    const shares = allocateTrackedRefund(residualCents, seats.map((seat) => seat.merchantShareCents));
    seats.forEach((seat, index) => {
      if (shares[index] === 0) return;
      this.enqueue(session, 'refund', `residual:${seat.obligationId}`);
      seat.pendingRefundCents += shares[index];
      this.completeJobs(session, `residual:${seat.obligationId}`);
    });
  }

  private reverseMerchant(bill: Bill) {
    const session = bill.session!;
    for (const hold of session.holds) if (hold.status === 'approved') hold.status = 'reversed';
    session.activeIndependentAuths = 0;
    for (const seat of this.active(session)) {
      if (seat.status !== 'captured' && seat.status !== 'capture_pending') continue;
      this.enqueue(session, 'refund', `reverse:${seat.obligationId}`);
      seat.status = 'refunded';
      seat.pendingRefundCents = 0;
      this.completeJobs(session, `reverse:${seat.obligationId}`);
    }
  }

  private enqueue(session: Session, kind: string, operationKey: string) {
    if (session.jobs.some((job) => job.operationKey === operationKey)) return;
    session.jobs.push({ id: this.id(), kind, operationKey, status: 'pending' });
  }

  private completeJobs(session: Session, operationKey: string) {
    for (const job of session.jobs) if (job.operationKey === operationKey) job.status = 'completed';
  }

  private coarse(status: ObligationStatus): SeatProjection['status'] {
    if (status === 'failed' || status === 'requires_action') return 'action_needed';
    if (status === 'capture_pending') return 'captured';
    if (status === 'refund_pending') return 'refunded';
    if (status === 'authorized' || status === 'pending' || status === 'captured' || status === 'voided' || status === 'refunded') return status;
    return 'pending';
  }

  private sessionProjection(bill: Bill): SessionProjection {
    const session = bill.session!;
    const snapshot = this.requireSnapshot(bill);
    const facts = this.facts(bill);
    const seats = this.active(session).map((seat) => ({
      obligationId: seat.obligationId,
      seatId: seat.seatId,
      userId: seat.userId,
      merchantShareCents: seat.merchantShareCents,
      approvedTotalCents: seat.approvedTotalCents,
      status: this.coarse(seat.status),
      canRetry: seat.required && (seat.status === 'failed' || seat.status === 'requires_action' || seat.status === 'refunded'),
      pendingRefundCents: seat.pendingRefundCents,
    }));
    return {
      sessionId: session.id,
      billId: bill.billId,
      phase: derivePhase(facts),
      simulated: true,
      label: 'SIMULATED',
      hostUserId: bill.hostUserId,
      spenderUserId: snapshot.spenderUserId,
      merchantId: snapshot.merchantId,
      merchantTotalCents: snapshot.merchantTotalCents,
      cardBudgetCents: snapshot.consentedMaxCents,
      funding: session.funding,
      collectionDeadlineMs: session.collectionDeadlineMs,
      spendDeadlineMs: session.spendDeadlineMs,
      spendingBlocked: session.spendingBlocked,
      checkoutOpen: session.checkoutOpen,
      windowClosed: session.windowClosed,
      blockers: checkoutBlockers(facts),
      seats,
      cases: session.cases.map((entry) => ({ kind: entry.kind, open: entry.open })),
      pendingRefundCents: seats.reduce((sum, seat) => sum + seat.pendingRefundCents, 0),
    };
  }


  private cardProjection(bill: Bill): CardProjection {
    const session = bill.session!;
    const snapshot = this.requireSnapshot(bill);
    const stripe = session.cardProvider === 'stripe';
    return {
      simulated: !stripe,
      label: stripe ? 'STRIPE' : 'SIMULATED',
      last4: session.last4,
      budgetCents: snapshot.consentedMaxCents,
      spendDeadlineMs: session.spendDeadlineMs,
      spendingBlocked: session.spendingBlocked,
      instrument: session.instrument,
      phase: derivePhase(this.facts(bill)),
    };
  }

  private project(callerUserId: string, bill: Bill): BillProjection {
    if (!this.isMember(bill, callerUserId)) throw new LedgerError(404, 'Bill not found.');
    const card = bill.session && callerUserId === bill.snapshot?.spenderUserId ? this.cardProjection(bill) : null;
    return {
      billId: bill.billId,
      hostUserId: bill.hostUserId,
      snapshotId: bill.snapshot?.snapshotId ?? null,
      spenderUserId: bill.snapshot?.spenderUserId ?? null,
      acceptedUserIds: [...bill.acceptances.keys()],
      session: bill.session ? this.sessionProjection(bill) : null,
      card,
    };
  }
}

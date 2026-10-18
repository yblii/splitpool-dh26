import Stripe from 'stripe';
import { LedgerError, type SessionProjection } from '@splitpool/contracts';

const API_VERSION = '2026-09-30.endive';

export type CollectionStatus = 'authorized' | 'requires_action' | 'failed';

export type CollectionChange =
  | { obligationId: string; kind: 'cancel' }
  | { obligationId: string; kind: 'capture' }
  | { obligationId: string; kind: 'refund'; amountCents: number };

export type CollectionNotice = {
  id: string;
  type: 'authorization.succeeded' | 'authorization.failed' | 'refund.succeeded';
  obligationId: string;
};

type IntentRecord = { paymentIntentId: string; alreadyCaptured: boolean };

type FollowUp = { kind: 'cancel' } | { kind: 'capture' } | { kind: 'refund'; amountCents: number };

export interface StripePayments {
  collect(input: { obligationId: string; sessionId: string; amountCents: number; paymentMethodId: string; idempotencyKey: string }): Promise<CollectionStatus>;
  openCardHold(input: { obligationId: string; sessionId: string; amountCents: number; idempotencyKey: string }): Promise<{ clientSecret: string; paymentIntentId: string }>;
  finishCardHold(input: { obligationId: string; paymentIntentId: string }): Promise<CollectionStatus>;
  releaseCardHold(input: { paymentIntentId: string; action: 'cancel' | 'capture' }): Promise<void>;
  held(obligationId: string): boolean;
  createCard(input: { sessionId: string; spenderUserId: string; budgetCents: number; idempotencyKey: string }): Promise<{ cardId: string; last4: string }>;
  follow(changes: CollectionChange[]): Promise<void>;
  verifyWebhook(payload: Buffer, signature: string | undefined): CollectionNotice | null;
}

const CARD_HOLD_GROUP = 'lfsg_000';

export function acceptsCardHold(details: {
  type?: string | null;
  card?: { wallet?: { type?: string | null; link?: { funding_source_group?: string | null } | null } | null } | null;
  link?: { funding_source_group?: string | null } | null;
} | null | undefined): boolean {
  if (details?.type === 'card') {
    const group = details.card?.wallet?.link?.funding_source_group;
    return group == null || group === CARD_HOLD_GROUP;
  }
  return details?.type === 'link' && details.link?.funding_source_group === CARD_HOLD_GROUP;
}

export function createStripePayments(apiKey: string, options: { cardholderId?: string; webhookSecret?: string } = {}): StripePayments {
  if (!apiKey.startsWith('rk_') && !apiKey.startsWith('sk_')) throw new Error('Expected a Stripe restricted or secret API key.');
  const stripe = new Stripe(apiKey, { apiVersion: API_VERSION, typescript: true });
  return new StripePaymentGateway(stripe, options);
}

export function collectionChanges(before: SessionProjection, after: SessionProjection): CollectionChange[] {
  const changes: CollectionChange[] = [];
  for (const seat of before.seats) {
    const next = after.seats.find((entry) => entry.obligationId === seat.obligationId);
    if (seat.status === 'authorized' && (!next || next.status === 'voided')) changes.push({ obligationId: seat.obligationId, kind: 'cancel' });
    else if (seat.status === 'authorized' && next?.status === 'captured') changes.push({ obligationId: seat.obligationId, kind: 'capture' });
    else if (seat.status === 'captured' && (!next || next.status === 'refunded')) changes.push({ obligationId: seat.obligationId, kind: 'refund', amountCents: seat.merchantShareCents });
    else if (next && next.pendingRefundCents > seat.pendingRefundCents) changes.push({ obligationId: seat.obligationId, kind: 'refund', amountCents: next.pendingRefundCents - seat.pendingRefundCents });
  }
  return changes;
}

export class StripePaymentGateway implements StripePayments {
  private readonly intents = new Map<string, IntentRecord>();
  private readonly pending = new Map<string, FollowUp>();
  private cardholderId: string | undefined;

  constructor(private readonly stripe: Stripe, private readonly options: { cardholderId?: string; webhookSecret?: string }) {
    this.cardholderId = options.cardholderId;
  }

  held(obligationId: string): boolean {
    return this.intents.has(obligationId);
  }

  async openCardHold(input: { obligationId: string; sessionId: string; amountCents: number; idempotencyKey: string }): Promise<{ clientSecret: string; paymentIntentId: string }> {
    await this.flush();
    try {
      const intent = await this.stripe.paymentIntents.create({
        amount: input.amountCents,
        currency: 'usd',
        capture_method: 'manual',
        allowed_payment_method_types: ['card', 'link'],
        metadata: { obligation_id: input.obligationId, session_id: input.sessionId },
      }, { idempotencyKey: input.idempotencyKey });
      if (!intent.client_secret) throw new LedgerError(502, 'Stripe did not return a card hold.');
      return { clientSecret: intent.client_secret, paymentIntentId: intent.id };
    } catch (error) {
      throw stripeFailure(error);
    }
  }

  async finishCardHold(input: { obligationId: string; paymentIntentId: string }): Promise<CollectionStatus> {
    let intent: Stripe.PaymentIntent;
    try {
      intent = await this.stripe.paymentIntents.retrieve(input.paymentIntentId, { expand: ['latest_charge'] });
    } catch (error) {
      throw stripeFailure(error);
    }
    const details = intent.latest_charge && typeof intent.latest_charge === 'object' ? intent.latest_charge.payment_method_details : null;
    if (!acceptsCardHold(details)) {
      await this.cancelHold(input.paymentIntentId, `reject:${input.obligationId}`);
      throw new LedgerError(409, 'That wallet has to pay with a card.');
    }
    const status = collectionStatus(intent.status);
    if (status === 'failed') {
      await this.cancelHold(input.paymentIntentId, `fail:${input.obligationId}`);
      throw new LedgerError(409, 'The card hold was not approved.');
    }
    if (status === 'authorized') {
      this.intents.set(input.obligationId, { paymentIntentId: intent.id, alreadyCaptured: intent.status === 'succeeded' });
    }
    return status;
  }

  async releaseCardHold(input: { paymentIntentId: string; action: 'cancel' | 'capture' }): Promise<void> {
    try {
      if (input.action === 'cancel') await this.cancelHold(input.paymentIntentId, `cancel:${input.paymentIntentId}`);
      else {
        await this.stripe.paymentIntents.capture(input.paymentIntentId, {}, { idempotencyKey: `capture:${input.paymentIntentId}` });
        for (const intent of this.intents.values()) if (intent.paymentIntentId === input.paymentIntentId) intent.alreadyCaptured = true;
      }
    } catch (error) {
      throw stripeFailure(error);
    }
  }

  async collect(input: { obligationId: string; sessionId: string; amountCents: number; paymentMethodId: string; idempotencyKey: string }): Promise<CollectionStatus> {
    await this.flush();
    try {
      const intent = await this.stripe.paymentIntents.create({
        amount: input.amountCents,
        currency: 'usd',
        capture_method: 'manual',
        confirm: true,
        payment_method: input.paymentMethodId,
        metadata: { obligation_id: input.obligationId, session_id: input.sessionId },
      }, { idempotencyKey: input.idempotencyKey });
      const alreadyCaptured = intent.status === 'succeeded';
      this.intents.set(input.obligationId, { paymentIntentId: intent.id, alreadyCaptured });
      return collectionStatus(intent.status);
    } catch (error) {
      throw stripeFailure(error);
    }
  }

  async createCard(input: { sessionId: string; spenderUserId: string; budgetCents: number; idempotencyKey: string }): Promise<{ cardId: string; last4: string }> {
    await this.flush();
    try {
      const cardholder = await this.cardholder(input.spenderUserId);
      const card = await this.stripe.issuing.cards.create({
        cardholder,
        currency: 'usd',
        type: 'virtual',
        status: 'active',
        spending_controls: { spending_limits: [{ amount: input.budgetCents, interval: 'all_time' }] },
        metadata: { session_id: input.sessionId, spender_user_id: input.spenderUserId },
      }, { idempotencyKey: input.idempotencyKey });
      if (!card.last4 || !/^\d{4}$/.test(card.last4)) throw new LedgerError(502, 'Stripe did not return a card.');
      return { cardId: card.id, last4: card.last4 };
    } catch (error) {
      throw stripeFailure(error);
    }
  }

  async follow(changes: CollectionChange[]): Promise<void> {
    for (const change of changes) {
      if (!this.intents.has(change.obligationId)) continue;
      const current = this.pending.get(change.obligationId);
      if (change.kind === 'refund' && current?.kind === 'refund') current.amountCents += change.amountCents;
      else this.pending.set(change.obligationId, change.kind === 'refund' ? { kind: 'refund', amountCents: change.amountCents } : { kind: change.kind });
    }
    await this.flush();
  }

  verifyWebhook(payload: Buffer, signature: string | undefined): CollectionNotice | null {
    if (!this.options.webhookSecret) throw new LedgerError(503, 'Set STRIPE_WEBHOOK_SECRET before accepting Stripe webhooks.');
    if (!signature) throw new LedgerError(400, 'Invalid signature.');
    let event: Stripe.Event;
    try {
      event = this.stripe.webhooks.constructEvent(payload, signature, this.options.webhookSecret);
    } catch {
      throw new LedgerError(400, 'Invalid signature.');
    }
    return noticeFrom(event);
  }

  private async cardholder(spenderUserId: string): Promise<string> {
    if (this.cardholderId) return this.cardholderId;
    const cardholder = await this.stripe.issuing.cardholders.create({
      type: 'individual',
      name: 'SplitPool Spender',
      email: 'spender@splitpool.test',
      phone_number: '+18005550100',
      status: 'active',
      billing: { address: { line1: '123 Main Street', city: 'San Francisco', state: 'CA', postal_code: '94111', country: 'US' } },
      individual: {
        first_name: 'SplitPool',
        last_name: 'Spender',
        dob: { day: 1, month: 1, year: 1990 },
        card_issuing: { user_terms_acceptance: { date: Math.floor(Date.now() / 1000), ip: '127.0.0.1' } },
      },
      metadata: { spender_user_id: spenderUserId },
    }, { idempotencyKey: `cardholder:${spenderUserId}` });
    this.cardholderId = cardholder.id;
    return cardholder.id;
  }

  private async cancelHold(paymentIntentId: string, idempotencyKey: string): Promise<void> {
    try {
      await this.stripe.paymentIntents.cancel(paymentIntentId, {}, { idempotencyKey });
    } catch (error) {
      throw stripeFailure(error);
    }
  }

  private async flush(): Promise<void> {
    for (const [obligationId, followUp] of this.pending) {
      const intent = this.intents.get(obligationId);
      if (!intent) {
        this.pending.delete(obligationId);
        continue;
      }
      try {
        if (followUp.kind === 'cancel') {
          await this.stripe.paymentIntents.cancel(intent.paymentIntentId, {}, { idempotencyKey: `cancel:${obligationId}` });
        } else if (followUp.kind === 'capture') {
          if (!intent.alreadyCaptured) await this.stripe.paymentIntents.capture(intent.paymentIntentId, {}, { idempotencyKey: `capture:${obligationId}` });
          intent.alreadyCaptured = true;
        } else {
          await this.stripe.refunds.create({
            payment_intent: intent.paymentIntentId,
            amount: followUp.amountCents,
            metadata: { obligation_id: obligationId },
          }, { idempotencyKey: `refund:${obligationId}:${followUp.amountCents}` });
        }
        this.pending.delete(obligationId);
      } catch (error) {
        throw stripeFailure(error);
      }
    }
  }
}

function collectionStatus(status: Stripe.PaymentIntent.Status): CollectionStatus {
  if (status === 'requires_capture' || status === 'succeeded') return 'authorized';
  if (status === 'requires_action' || status === 'requires_confirmation' || status === 'processing') return 'requires_action';
  return 'failed';
}

function noticeFrom(event: Stripe.Event): CollectionNotice | null {
  if (event.type !== 'payment_intent.amount_capturable_updated' && event.type !== 'payment_intent.payment_failed' && event.type !== 'charge.refunded') return null;
  const obligationId = (event.data.object as { metadata?: { obligation_id?: string } }).metadata?.obligation_id;
  if (!obligationId) return null;
  const type = event.type === 'payment_intent.payment_failed' ? 'authorization.failed'
    : event.type === 'charge.refunded' ? 'refund.succeeded'
    : 'authorization.succeeded';
  return { id: event.id, type, obligationId };
}

function stripeFailure(error: unknown): LedgerError {
  if (error instanceof LedgerError) return error;
  const message = error instanceof Error && error.message ? error.message : 'Stripe request failed.';
  return new LedgerError(502, message);
}

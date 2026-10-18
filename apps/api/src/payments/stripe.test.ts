import { expect, it } from 'vitest';
import type Stripe from 'stripe';
import { LedgerError, type SessionProjection } from '@splitpool/contracts';
import { acceptsCardHold, collectionChanges, StripePaymentGateway } from './stripe.ts';

it('collects a manual-capture PaymentIntent and creates a budgeted virtual card', async () => {
  const requests: Array<{ method: string; params: unknown; options: unknown }> = [];
  const client = {
    paymentIntents: {
      create: async (params: unknown, options: unknown) => {
        requests.push({ method: 'paymentIntents.create', params, options });
        return { id: 'pi_1', status: 'requires_capture' };
      },
      cancel: async (id: string, params: unknown, options: unknown) => {
        requests.push({ method: 'paymentIntents.cancel', params: { id, params }, options });
        return { id, status: 'canceled' };
      },
      capture: async () => ({ id: 'pi_1', status: 'succeeded' }),
    },
    refunds: { create: async () => ({ id: 're_1' }) },
    issuing: {
      cards: {
        create: async (params: unknown, options: unknown) => {
          requests.push({ method: 'issuing.cards.create', params, options });
          return { id: 'ic_1', last4: '4242' };
        },
      },
      cardholders: { create: async () => ({ id: 'ich_created' }) },
    },
    webhooks: { constructEvent: () => { throw new Error('bad signature'); } },
  };
  const gateway = new StripePaymentGateway(client as unknown as Stripe, { webhookSecret: 'whsec_test', cardholderId: 'ich_ready' });
  await expect(gateway.collect({
    obligationId: 'ob_1', sessionId: 'sess_1', amountCents: 4000, paymentMethodId: 'pm_card_visa', idempotencyKey: 'auth-1',
  })).resolves.toBe('authorized');
  await expect(gateway.createCard({
    sessionId: 'sess_1', spenderUserId: 'spender', budgetCents: 12000, idempotencyKey: 'card:sess_1',
  })).resolves.toEqual({ cardId: 'ic_1', last4: '4242' });

  expect(requests[0]).toMatchObject({
    method: 'paymentIntents.create',
    params: {
      amount: 4000,
      currency: 'usd',
      capture_method: 'manual',
      confirm: true,
      payment_method: 'pm_card_visa',
      metadata: { obligation_id: 'ob_1', session_id: 'sess_1' },
    },
    options: { idempotencyKey: 'auth-1' },
  });
  expect(JSON.stringify(requests[0]?.params)).not.toContain('payment_method_types');
  expect(requests[1]).toMatchObject({
    method: 'issuing.cards.create',
    params: {
      cardholder: 'ich_ready',
      currency: 'usd',
      type: 'virtual',
      status: 'active',
      spending_controls: { spending_limits: [{ amount: 12000, interval: 'all_time' }] },
    },
    options: { idempotencyKey: 'card:sess_1' },
  });

  await gateway.follow([{ obligationId: 'ob_1', kind: 'cancel' }]);
  expect(requests[2]).toMatchObject({ method: 'paymentIntents.cancel', params: { id: 'pi_1' } });
  expect(() => gateway.verifyWebhook(Buffer.from('{}'), 'sig')).toThrow(LedgerError);
});

it('cancels an authorization that disappears when the card is declined', () => {
  const before = projection('authorized', 0);
  const after = projection('pending', 0, 'ob_2');
  expect(collectionChanges(before, after)).toEqual([{ obligationId: 'ob_1', kind: 'cancel' }]);
});

it('opens a manual card hold for Apple Pay, Google Pay, and card-funded Link', async () => {
  const requests: Array<{ method: string; params: unknown }> = [];
  const client = {
    paymentIntents: {
      create: async (params: unknown) => {
        requests.push({ method: 'paymentIntents.create', params });
        return { id: 'pi_wallet', client_secret: 'cs_wallet', status: 'requires_payment_method' };
      },
      retrieve: async () => ({
        id: 'pi_wallet',
        status: 'requires_capture',
        latest_charge: { payment_method_details: { type: 'card', card: { wallet: { type: 'apple_pay' } } } },
      }),
      cancel: async () => ({ id: 'pi_wallet', status: 'canceled' }),
      capture: async () => ({ id: 'pi_wallet', status: 'succeeded' }),
    },
  };
  const gateway = new StripePaymentGateway(client as unknown as Stripe, {});
  await expect(gateway.openCardHold({
    obligationId: 'ob_1', sessionId: 'sess_1', amountCents: 1800, idempotencyKey: 'wallet-1',
  })).resolves.toEqual({ clientSecret: 'cs_wallet', paymentIntentId: 'pi_wallet' });
  expect(requests[0]?.params).toMatchObject({
    amount: 1800,
    currency: 'usd',
    capture_method: 'manual',
    allowed_payment_method_types: ['card', 'link'],
  });
  expect(requests[0]?.params).not.toHaveProperty('payment_method_types');
  await expect(gateway.finishCardHold({ obligationId: 'ob_1', paymentIntentId: 'pi_wallet' })).resolves.toBe('authorized');
  expect(gateway.held('ob_1')).toBe(true);
});

it('cancels Link when the funding source is not a card', async () => {
  const canceled: string[] = [];
  const client = {
    paymentIntents: {
      retrieve: async () => ({
        id: 'pi_bank',
        status: 'requires_capture',
        latest_charge: { payment_method_details: { type: 'link', link: { funding_source_group: 'lfsg_003' } } },
      }),
      cancel: async (id: string) => {
        canceled.push(id);
        return { id, status: 'canceled' };
      },
    },
  };
  const gateway = new StripePaymentGateway(client as unknown as Stripe, {});
  await expect(gateway.finishCardHold({ obligationId: 'ob_1', paymentIntentId: 'pi_bank' })).rejects.toThrow('That wallet has to pay with a card.');
  expect(canceled).toEqual(['pi_bank']);
  expect(gateway.held('ob_1')).toBe(false);
});

it('accepts card wallets and card-funded Link only', () => {
  expect(acceptsCardHold({ type: 'card', card: { wallet: { type: 'apple_pay' } } })).toBe(true);
  expect(acceptsCardHold({ type: 'card', card: { wallet: { type: 'google_pay' } } })).toBe(true);
  expect(acceptsCardHold({ type: 'card', card: { wallet: { type: 'link', link: { funding_source_group: 'lfsg_000' } } } })).toBe(true);
  expect(acceptsCardHold({ type: 'link', link: { funding_source_group: 'lfsg_000' } })).toBe(true);
  expect(acceptsCardHold({ type: 'card' })).toBe(true);
  expect(acceptsCardHold({ type: 'link', link: { funding_source_group: 'lfsg_003' } })).toBe(false);
  expect(acceptsCardHold({ type: 'card', card: { wallet: { link: { funding_source_group: 'lfsg_003' } } } })).toBe(false);
  expect(acceptsCardHold({ type: 'us_bank_account' })).toBe(false);
  expect(acceptsCardHold(null)).toBe(false);
});

function projection(status: string, pendingRefundCents: number, obligationId = 'ob_1'): SessionProjection {
  return {
    seats: [{
      obligationId, seatId: 'a', userId: 'spender', merchantShareCents: 4000, approvedTotalCents: 4000,
      status: status as SessionProjection['seats'][number]['status'], canRetry: false, pendingRefundCents,
    }],
  } as SessionProjection;
}

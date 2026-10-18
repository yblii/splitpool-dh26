import { apiUrl } from './api';

export const stripePublishableKey = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim() ?? '';

export async function openDemoCardHold(userId: string, amountCents: number, idempotencyKey: string) {
  const payload = await post('/api/v1/card-holds', userId, idempotencyKey, { amountCents });
  if (!payload || typeof payload !== 'object' || !('clientSecret' in payload) || !('paymentIntentId' in payload)) {
    throw new Error('Stripe did not return a card hold.');
  }
  const { clientSecret, paymentIntentId } = payload as { clientSecret: unknown; paymentIntentId: unknown };
  if (typeof clientSecret !== 'string' || typeof paymentIntentId !== 'string') throw new Error('Stripe did not return a card hold.');
  return { clientSecret, paymentIntentId };
}

export async function completeDemoCardHold(userId: string, paymentIntentId: string, idempotencyKey: string) {
  await post('/api/v1/card-holds/confirm', userId, idempotencyKey, { paymentIntentId });
}

export async function releaseDemoCardHold(userId: string, paymentIntentId: string, action: 'cancel' | 'capture') {
  await post('/api/v1/card-holds/release', userId, `${action}:${paymentIntentId}`, { paymentIntentId, action });
}

async function post(path: string, userId: string, idempotencyKey: string, body: unknown) {
  if (!apiUrl) throw new Error('Set EXPO_PUBLIC_API_URL before paying with a wallet.');
  const response = await fetch(`${apiUrl}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-user-id': userId, 'idempotency-key': idempotencyKey },
    body: JSON.stringify(body),
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string'
      ? payload.error
      : 'The card hold failed.';
    throw new Error(message);
  }
  return payload;
}

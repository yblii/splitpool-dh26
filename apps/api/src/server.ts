import { buildApp } from './app.ts';
import { createStripePayments } from './payments/stripe.ts';

const apiKey = process.env.STRIPE_API_KEY?.trim();
const stripe = apiKey ? createStripePayments(apiKey, {
  cardholderId: process.env.STRIPE_CARDHOLDER_ID?.trim(),
  webhookSecret: process.env.STRIPE_WEBHOOK_SECRET?.trim(),
}) : undefined;
const app = await buildApp({ stripe });
if (apiKey?.startsWith('sk_')) {
  app.log.warn('STRIPE_API_KEY is a secret key. Prefer a restricted key with PaymentIntent and Issuing write access.');
}
try {
  await app.listen({ host: '0.0.0.0', port: Number(process.env.PORT ?? 3001) });
} catch (error) {
  app.log.error(error);
  process.exitCode = 1;
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, async () => { await app.close(); });
}

import cors from '@fastify/cors';
import Fastify from 'fastify';
import { makeDemoBill, PaymentLedger } from '@splitpool/contracts';
import { registerPaymentRoutes } from './payments/routes.ts';
import type { StripePayments } from './payments/stripe.ts';

export async function buildApp(options: { ledger?: PaymentLedger; simulation?: boolean; stripe?: StripePayments } = {}) {
  const app = Fastify({ logger: true });
  await app.register(cors, { origin: true });
  app.get('/api/v1/health', () => ({ status: 'ok', service: 'splitpool-api', mode: options.simulation === false ? 'live' : 'demo' }));
  app.get('/api/v1/demo/bill', () => makeDemoBill());
  await registerPaymentRoutes(app, options.ledger ?? new PaymentLedger(), options.simulation !== false, options.stripe);
  return app;
}

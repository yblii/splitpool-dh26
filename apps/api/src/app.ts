import cors from '@fastify/cors';
import Fastify from 'fastify';
import { makeDemoBill } from '@splitpool/contracts';

export async function buildApp() {
  const app = Fastify({ logger: true });
  // Read-only demo routes. Add authentication before exposing private data.
  await app.register(cors, { origin: true });
  app.get('/api/v1/health', () => ({ status: 'ok', service: 'splitpool-api', mode: 'demo' }));
  app.get('/api/v1/demo/bill', () => makeDemoBill());
  return app;
}

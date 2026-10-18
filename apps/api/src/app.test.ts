import { expect, it } from 'vitest';
import { buildApp } from './app.ts';

it('serves health and a read-only demo bill without exposing write operations', async () => {
  const app = await buildApp();
  try {
    const health = await app.inject({ method: 'GET', url: '/api/v1/health' });
    expect(health.statusCode).toBe(200);
    expect(health.json()).toMatchObject({ status: 'ok', mode: 'demo' });
    const bill = await app.inject({ method: 'GET', url: '/api/v1/demo/bill' });
    expect(bill.json().items).toHaveLength(3);
    const groups = await app.inject({ method: 'POST', url: '/api/v1/groups' });
    expect(groups.statusCode).toBe(404);
  } finally { await app.close(); }
});

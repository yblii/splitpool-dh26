import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../src/app.ts';
import type { Database } from '../src/db.ts';
import { ApiError } from '../src/errors.ts';

const userId = '00000000-0000-4000-8000-000000000001';
const billId = '00000000-0000-4000-8000-000000000002';
const itemId = '00000000-0000-4000-8000-000000000003';

test('public demo remains usable without database configuration', async () => {
  const app = await buildApp({ logger: false });
  try {
    assert.equal((await app.inject('/api/v1/health')).json().mode, 'demo');
    assert.equal((await app.inject('/api/v1/demo/bill')).json().items.length, 3);
    assert.equal((await app.inject('/api/v1/groups')).statusCode, 404);
  } finally { await app.close(); }
});

test('private routes verify bearer tokens and reject invalid input before touching the database', async () => {
  let queries = 0;
  const db: Database = {
    async query() { queries++; return { rows: [], rowCount: 0 }; },
    async transaction() { queries++; throw new Error('Unexpected database call'); },
    async close() {},
  };
  const app = await buildApp({ db, logger: false, verifyToken: async token => {
    if (token !== 'valid') throw new ApiError(401, 'INVALID_TOKEN', 'Sign in again.');
    return userId;
  } });
  try {
    assert.equal((await app.inject('/api/v1/groups')).statusCode, 401);
    assert.equal((await app.inject({ url: '/api/v1/groups', headers: { authorization: 'Bearer bad' } })).statusCode, 401);
    const headers = { authorization: 'Bearer valid' };
    for (const fraction of [{ numerator: 1, denominator: 0 }, { numerator: -1, denominator: 2 }, { numerator: 0.5, denominator: 1 }, { numerator: '1', denominator: 2 }]) {
      const result = await app.inject({ method: 'PUT', url: `/api/v1/bills/${billId}/items/${itemId}/claim`, headers,
        payload: { expectedVersion: 1, fraction } });
      assert.equal(result.statusCode, 400);
    }
    const spoof = await app.inject({ method: 'PUT', url: `/api/v1/bills/${billId}/items/${itemId}/claim`, headers,
      payload: { expectedVersion: 1, fraction: { numerator: 1, denominator: 2 }, userId: 'someone-else' } });
    assert.equal(spoof.statusCode, 400);
    assert.equal((await app.inject({ method: 'POST', url: '/api/v1/groups', headers, payload: { name: '  ' } })).statusCode, 400);
    assert.equal((await app.inject({ url: '/api/v1/bills/not-a-uuid', headers })).statusCode, 400);
    assert.equal(queries, 0);
    const me = await app.inject({ url: '/api/v1/me', headers });
    assert.deepEqual(me.json(), { profile: null });
    assert.equal(me.headers['cache-control'], 'no-store');
  } finally { await app.close(); }
});

test('configuration cannot enable private database routes without authentication', async () => {
  await assert.rejects(() => buildApp({ verifyToken: async () => userId, logger: false }), /configured together/);
});

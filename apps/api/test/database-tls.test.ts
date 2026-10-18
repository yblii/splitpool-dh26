import { test } from 'node:test';
import assert from 'node:assert/strict';
import { databaseTlsConfig } from '../src/database-tls.ts';

test('database TLS preserves verification configuration by default', () => {
  const url = 'postgresql://user:password@localhost/db?sslmode=verify-full';
  assert.deepEqual(databaseTlsConfig(url, {}), { connectionString: url });
});

test('self-signed opt-in requires explicit development environment', () => {
  for (const NODE_ENV of [undefined, 'production', 'test']) {
    assert.throws(() => databaseTlsConfig('postgresql://localhost/db', {
      NODE_ENV, DATABASE_ALLOW_SELF_SIGNED: 'true',
    }), /requires NODE_ENV=development/);
  }
});

test('development exception is scoped to encrypted database connections', () => {
  const config = databaseTlsConfig('postgresql://user:password@localhost/db?sslmode=disable&sslrootcert=old.crt&application_name=splitpool', {
    NODE_ENV: 'development', DATABASE_ALLOW_SELF_SIGNED: 'true',
  });
  const url = new URL(config.connectionString!);
  assert.equal(url.searchParams.has('sslmode'), false);
  assert.equal(url.searchParams.has('sslrootcert'), false);
  assert.equal(url.searchParams.get('application_name'), 'splitpool');
  assert.deepEqual(config.ssl, { rejectUnauthorized: false });
});

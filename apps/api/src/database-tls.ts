import type { PoolConfig } from 'pg';

export function databaseTlsConfig(connectionString: string,
  environment: NodeJS.ProcessEnv = process.env): PoolConfig {
  if (environment.DATABASE_ALLOW_SELF_SIGNED !== 'true') return { connectionString };
  if (environment.NODE_ENV !== 'development') {
    throw new Error('DATABASE_ALLOW_SELF_SIGNED requires NODE_ENV=development. Use verified TLS for deployed services.');
  }
  const url = new URL(connectionString);
  // pg connection-string TLS parameters override the explicit ssl object.
  // This opt-in always enables encryption, even if the URL requested sslmode=disable.
  for (const key of ['ssl', 'sslmode', 'sslcert', 'sslkey', 'sslrootcert', 'uselibpqcompat'])
    url.searchParams.delete(key);
  return { connectionString: url.toString(), ssl: { rejectUnauthorized: false } };
}

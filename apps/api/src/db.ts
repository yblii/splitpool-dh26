import pg from 'pg';
import { readFileSync } from 'node:fs';
import { databaseTlsConfig } from './database-tls.ts';

export interface Sql {
  query<T extends pg.QueryResultRow = pg.QueryResultRow>(text: string, values?: unknown[]): Promise<{ rows: T[]; rowCount: number | null }>;
}
export interface Database extends Sql {
  transaction<T>(work: (sql: Sql) => Promise<T>, readOnly?: boolean): Promise<T>;
  close(): Promise<void>;
}

export function postgresDatabase(connectionString: string): Database {
  const pool = new pg.Pool({ ...databaseTlsConfig(connectionString), max: 10, connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 30000, statement_timeout: 15000 });
  pool.on('error', () => { console.error('An idle database connection failed.'); });
  return {
    query: (text, values) => pool.query(text, values),
    async transaction(work, readOnly = false) {
      const client = await pool.connect();
      try {
        // Multiple SELECTs for a bill must observe the same committed snapshot.
        await client.query(readOnly ? 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY' : 'BEGIN');
        const result = await work(client);
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally { client.release(); }
    },
    close: () => pool.end(),
  };
}

const migrations: { version: number; file: string }[] = [
  { version: 1, file: '001_collaboration.sql' },
  { version: 2, file: '002_receipts.sql' },
];

export async function migrate(db: Database) {
  await db.transaction(async (tx) => {
    await tx.query('SELECT pg_advisory_xact_lock(73618421)');
    await tx.query('CREATE TABLE IF NOT EXISTS schema_migrations (version integer PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
    for (const migration of migrations) {
      const applied = await tx.query('SELECT version FROM schema_migrations WHERE version = $1', [migration.version]);
      if (applied.rows.length) continue;
      const sql = readFileSync(new URL(`../migrations/${migration.file}`, import.meta.url), 'utf8');
      await tx.query(sql);
      await tx.query('INSERT INTO schema_migrations(version) VALUES ($1)', [migration.version]);
    }
  });
}

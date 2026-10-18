import { loadApiEnv } from './load-env.ts';
import { postgresDatabase, migrate } from './db.ts';

const env = loadApiEnv();
if (!process.env.DATABASE_URL?.trim()) {
  const hint = env.found
    ? `Found ${env.path} but DATABASE_URL is empty.`
    : `Missing ${env.path}. Copy apps/api/.env.example (or create .env) and set DATABASE_URL.`;
  console.error(`migrate failed: DATABASE_URL is required. ${hint}`);
  process.exitCode = 1;
} else {
  const db = postgresDatabase(process.env.DATABASE_URL);
  try {
    await migrate(db);
    console.log('Database migrations applied.');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`migrate failed: ${message}`);
    if (/self[- ]signed|UNABLE_TO_VERIFY|certificate/i.test(message)) {
      console.error(
        'Tip: for local Tiger Data TLS, set NODE_ENV=development and DATABASE_ALLOW_SELF_SIGNED=true in apps/api/.env',
      );
    }
    if (/duplicate key|unique constraint|one_bill_per_group|one_active_bill_per_group/i.test(message)) {
      console.error(
        'Tip: a group still has more than one bill. Pull the latest 003 migration (it collapses extras) and retry.',
      );
    }
    process.exitCode = 1;
  } finally {
    await db.close();
  }
}

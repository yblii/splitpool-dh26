import { postgresDatabase, migrate } from './db.ts';

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
const db = postgresDatabase(process.env.DATABASE_URL);
try { await migrate(db); console.log('Database migrations applied.'); }
finally { await db.close(); }

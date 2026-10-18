import { supabaseVerifier } from './auth.ts';
import { buildApp } from './app.ts';
import { postgresDatabase } from './db.ts';
import { loadApiEnv } from './load-env.ts';
import { createStripePayments } from './payments/stripe.ts';
import { createReceiptParser } from './receipt/parser.ts';

const env = loadApiEnv();
const parser = createReceiptParser();

const { DATABASE_URL, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } = process.env;
const configured = [DATABASE_URL, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY].filter(Boolean).length;
if (configured !== 0 && configured !== 3) throw new Error('Set DATABASE_URL, SUPABASE_URL, and SUPABASE_PUBLISHABLE_KEY together.');
if (process.env.NODE_ENV === 'production' && configured !== 3) throw new Error('Production requires database and authentication configuration.');

function resolveCorsOrigin() {
  const configured = process.env.CORS_ORIGINS?.split(',').map(origin => origin.trim()).filter(Boolean) ?? [];
  const allowLocalhostDev = process.env.NODE_ENV !== 'production';
  if (configured.length === 0 && !allowLocalhostDev) return false;
  return (origin: string | undefined, cb: (err: Error | null, allow: boolean | string) => void) => {
    // Non-browser clients (curl, React Native) often omit Origin.
    if (!origin) return cb(null, true);
    if (configured.includes(origin)) return cb(null, true);
    // Expo web may use 8081, 8082, etc. — allow any localhost port in non-production.
    if (allowLocalhostDev && /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)) return cb(null, true);
    return cb(null, false);
  };
}

const apiKey = process.env.STRIPE_API_KEY?.trim();
const stripe = apiKey ? createStripePayments(apiKey, {
  cardholderId: process.env.STRIPE_CARDHOLDER_ID?.trim(),
  webhookSecret: process.env.STRIPE_WEBHOOK_SECRET?.trim(),
}) : undefined;
const app = await buildApp({
  db: DATABASE_URL ? postgresDatabase(DATABASE_URL) : undefined,
  verifyToken: SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY ? supabaseVerifier(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY) : undefined,
  origins: resolveCorsOrigin(),
  stripe,
});
if (apiKey?.startsWith('sk_')) {
  app.log.warn('STRIPE_API_KEY is a secret key. Prefer a restricted key with PaymentIntent and Issuing write access.');
}

app.log.info({
  envFile: env.path,
  envFileFound: env.found,
  geminiKeyPresent: env.geminiKeyPresent,
  receiptParser: parser.name,
}, env.geminiKeyPresent
  ? 'API ready with Gemini receipt parsing'
  : 'API ready with sample receipt fallback — set GEMINI_API_KEY in apps/api/.env and restart (or retry extract after saving the file)');

try {
  await app.listen({ host: '0.0.0.0', port: Number(process.env.PORT ?? 3001) });
} catch (error) {
  app.log.error(error);
  process.exitCode = 1;
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, async () => { await app.close(); });
}

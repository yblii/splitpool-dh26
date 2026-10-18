import { buildApp } from './app.ts';
import { loadApiEnv } from './load-env.ts';
import { createReceiptParser } from './receipt/parser.ts';

const env = loadApiEnv();
const parser = createReceiptParser();
const app = await buildApp();

app.log.info({
  envFile: env.path,
  envFileFound: env.found,
  openAiKeyPresent: env.openAiKeyPresent,
  receiptParser: parser.name,
}, env.openAiKeyPresent
  ? 'API ready with OpenAI receipt parsing'
  : 'API ready with sample receipt fallback — set OPENAI_API_KEY in apps/api/.env and restart (or retry extract after saving the file)');

try {
  await app.listen({ host: '0.0.0.0', port: Number(process.env.PORT ?? 3001) });
} catch (error) {
  app.log.error(error);
  process.exitCode = 1;
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, async () => { await app.close(); });
}

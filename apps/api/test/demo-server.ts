/** Isolated browser-test API: no database, live payment provider, or paid AI calls. */
import { buildApp } from '../src/app.ts';
import { createSampleFallbackParser } from '../src/receipt/parser.ts';
import { createFallbackTitleGenerator } from '../src/titles/generator.ts';

const app = await buildApp({
  parser: createSampleFallbackParser(), titleGenerator: createFallbackTitleGenerator(),
  origins: ['http://localhost:8091'], logger: false,
});
await app.listen({ host: '127.0.0.1', port: 3901 });
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => { void app.close(); });

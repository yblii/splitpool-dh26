import { buildApp } from './app.ts';
import { loadApiEnv } from './load-env.ts';

loadApiEnv();
const app = await buildApp();
try {
  await app.listen({ host: '0.0.0.0', port: Number(process.env.PORT ?? 3001) });
} catch (error) {
  app.log.error(error);
  process.exitCode = 1;
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, async () => { await app.close(); });
}

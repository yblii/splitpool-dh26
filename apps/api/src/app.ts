import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import Fastify from 'fastify';
import { makeDemoBill, type ExtractedReceipt } from '@splitpool/contracts';
import {
  createReceiptParser,
  parseWithFallback,
  type ReceiptParser,
} from './receipt/parser.ts';

const MAX_RECEIPT_BYTES = 8 * 1024 * 1024;

export type BuildAppOptions = {
  parser?: ReceiptParser;
};

export async function buildApp(options: BuildAppOptions = {}) {
  const app = Fastify({ logger: true });
  const parser = options.parser ?? createReceiptParser();

  // Read-only demo routes plus receipt extraction. Add authentication before exposing private data.
  await app.register(cors, { origin: true });
  await app.register(multipart, {
    limits: { files: 1, fileSize: MAX_RECEIPT_BYTES },
  });

  app.get('/api/v1/health', () => ({ status: 'ok', service: 'splitpool-api', mode: 'demo' }));
  app.get('/api/v1/demo/bill', () => makeDemoBill());

  app.post('/api/v1/demo/receipt-extractions', async (request, reply) => {
    const file = await request.file();
    if (!file) {
      return reply.code(400).send({ error: 'Expected a multipart image field named "image".' });
    }

    const mimeType = file.mimetype || 'application/octet-stream';
    if (!mimeType.startsWith('image/')) {
      return reply.code(400).send({ error: 'Receipt upload must be an image.' });
    }

    const bytes = await file.toBuffer();
    if (!bytes.length) {
      return reply.code(400).send({ error: 'Receipt image was empty.' });
    }

    const { draft, usedFallback } = await parseWithFallback(parser, {
      bytes,
      mimeType,
      filename: file.filename,
    });

    const body: { draft: ExtractedReceipt; usedFallback: boolean } = { draft, usedFallback };
    return reply.code(200).send(body);
  });

  return app;
}

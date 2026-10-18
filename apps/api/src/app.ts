import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import Fastify from 'fastify';
import { makeDemoBill, type ExtractedReceipt } from '@splitpool/contracts';
import { loadApiEnv } from './load-env.ts';
import {
  createReceiptParser,
  parseWithFallback,
  type ReceiptFallbackReason,
  type ReceiptParser,
} from './receipt/parser.ts';

const MAX_RECEIPT_BYTES = 8 * 1024 * 1024;

export type BuildAppOptions = {
  parser?: ReceiptParser;
};

function normalizeImageMimeType(mimeType: string): string {
  if (mimeType === 'image/jpg') return 'image/jpeg';
  return mimeType;
}

export async function buildApp(options: BuildAppOptions = {}) {
  const app = Fastify({ logger: true });

  // Read-only demo routes plus receipt extraction. Add authentication before exposing private data.
  await app.register(cors, { origin: true });
  await app.register(multipart, {
    limits: { files: 1, fileSize: MAX_RECEIPT_BYTES },
  });

  app.get('/api/v1/health', () => {
    const env = loadApiEnv();
    const parser = options.parser ?? createReceiptParser();
    return {
      status: 'ok',
      service: 'splitpool-api',
      mode: 'demo',
      receiptParser: parser.name,
      openAiKeyPresent: env.openAiKeyPresent,
      envFileFound: env.found,
    };
  });

  app.get('/api/v1/demo/bill', () => makeDemoBill());

  app.post('/api/v1/demo/receipt-extractions', async (request, reply) => {
    const file = await request.file();
    if (!file) {
      return reply.code(400).send({ error: 'Expected a multipart image field named "image".' });
    }

    const mimeType = normalizeImageMimeType(file.mimetype || 'application/octet-stream');
    if (!mimeType.startsWith('image/')) {
      return reply.code(400).send({ error: 'Receipt upload must be an image.' });
    }

    const bytes = await file.toBuffer();
    if (!bytes.length) {
      return reply.code(400).send({ error: 'Receipt image was empty.' });
    }

    // Reload .env each request so filling OPENAI_API_KEY after boot is picked up without a mystery state.
    const env = loadApiEnv();
    const parser = options.parser ?? createReceiptParser();
    request.log.info({
      parser: parser.name,
      openAiKeyPresent: env.openAiKeyPresent,
      envFileFound: env.found,
      mimeType,
      bytes: bytes.length,
      filename: file.filename,
    }, 'Starting receipt extraction');

    const { draft, usedFallback, reason, errorDetail } = await parseWithFallback(parser, {
      bytes,
      mimeType,
      filename: file.filename,
    }, request.log);

    const body: {
      draft: ExtractedReceipt;
      usedFallback: boolean;
      reason?: ReceiptFallbackReason;
      errorDetail?: string;
    } = { draft, usedFallback };
    if (reason) body.reason = reason;
    if (errorDetail) body.errorDetail = errorDetail;
    return reply.code(200).send(body);
  });

  return app;
}

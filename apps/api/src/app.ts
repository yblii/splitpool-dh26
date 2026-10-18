import cors, { type FastifyCorsOptions } from '@fastify/cors';
import multipart from '@fastify/multipart';
import Fastify from 'fastify';
import { makeDemoBill, type ExtractedReceipt } from '@splitpool/contracts';
import type { VerifyToken } from './auth.ts';
import type { Database } from './db.ts';
import { ApiError } from './errors.ts';
import { loadApiEnv } from './load-env.ts';
import {
  createReceiptParser,
  parseWithFallback,
  type ReceiptFallbackReason,
  type ReceiptParser,
} from './receipt/parser.ts';
import { collaborationRoutes } from './routes.ts';
import { CollaborationService } from './service.ts';

const MAX_RECEIPT_BYTES = 8 * 1024 * 1024;

export type BuildAppOptions = {
  parser?: ReceiptParser;
  db?: Database;
  verifyToken?: VerifyToken;
  /** Local directory for receipt image bytes (defaults to data/receipts). */
  receiptRoot?: string;
  /** Passed to @fastify/cors `origin`. */
  origins?: FastifyCorsOptions['origin'];
  logger?: boolean;
};

function normalizeImageMimeType(mimeType: string): string {
  if (mimeType === 'image/jpg') return 'image/jpeg';
  return mimeType;
}

export async function buildApp(options: BuildAppOptions = {}) {
  if (Boolean(options.db) !== Boolean(options.verifyToken)) {
    throw new Error('Database and authentication must be configured together.');
  }

  const app = Fastify({
    logger: options.logger === false ? false : { redact: ['req.headers.authorization', 'req.url'] },
    // Receipt images are larger than the JSON collaboration payloads.
    bodyLimit: MAX_RECEIPT_BYTES,
    ajv: { customOptions: { removeAdditional: false, coerceTypes: false } },
  });

  await app.register(cors, {
    origin: options.origins ?? false,
    // Browser (Expo web) sends a preflight for PATCH + Authorization + JSON.
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type', 'Accept'],
  });
  await app.register(multipart, {
    limits: { files: 1, fileSize: MAX_RECEIPT_BYTES },
  });

  app.setNotFoundHandler((_request, reply) => reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Route not found.' } }));
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ApiError) return reply.code(error.statusCode).send({ error: { code: error.code, message: error.message, details: error.details } });
    const failure = error as { code?: string; statusCode?: number; validation?: unknown };
    if (failure.validation || failure.statusCode === 400)
      return reply.code(400).send({ error: { code: 'INVALID_REQUEST', message: 'Request does not match the API schema.' } });
    if (failure.code === '23505') return reply.code(409).send({ error: { code: 'CONFLICT', message: 'Username, membership, or active bill already exists.' } });
    // Connection / TLS / timeout failures from pg — treat as unavailable, not opaque 500s.
    if (failure.code && [
      'ECONNREFUSED', 'ENOTFOUND', 'ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN',
      '57P01', '57P03', '08000', '08001', '08003', '08006', '08004',
    ].includes(failure.code)) {
      request.log.error({ code: failure.code, requestId: request.id }, 'Database unavailable');
      return reply.code(503).send({
        error: {
          code: 'DATABASE_UNAVAILABLE',
          message: 'Cannot reach Tiger Data PostgreSQL. Check DATABASE_URL, TLS settings, and that the database is running.',
        },
      });
    }
    if (failure.statusCode && failure.statusCode >= 400 && failure.statusCode < 500)
      return reply.code(failure.statusCode).send({ error: { code: 'INVALID_REQUEST', message: 'Request could not be accepted.' } });
    // Avoid logging SQL parameters, receipt contents, invitation tokens, or auth tokens.
    request.log.error({ code: failure.code, requestId: request.id }, 'Backend operation failed');
    return reply.code(500).send({ error: { code: 'INTERNAL_ERROR', message: 'The request could not be completed.' } });
  });

  app.get('/api/v1/health', () => {
    const env = loadApiEnv();
    const parser = options.parser ?? createReceiptParser();
    return {
      status: 'ok',
      service: 'splitpool-api',
      mode: options.db ? 'connected' : 'demo',
      receiptParser: parser.name,
      geminiKeyPresent: env.geminiKeyPresent,
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

    // Reload .env each request so filling GEMINI_API_KEY after boot is picked up without a mystery state.
    const env = loadApiEnv();
    const parser = options.parser ?? createReceiptParser();
    request.log.info({
      parser: parser.name,
      geminiKeyPresent: env.geminiKeyPresent,
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

  if (options.db && options.verifyToken) {
    const db = options.db;
    const verify = options.verifyToken;
    app.get('/api/v1/ready', async (_request, reply) => {
      try {
        const result = await db.query('SELECT version FROM schema_migrations WHERE version=2');
        if (!result.rows.length) return reply.code(503).send({ status: 'unavailable' });
        return { status: 'ok' };
      }
      catch { return reply.code(503).send({ status: 'unavailable' }); }
    });
    const parser = options.parser ?? createReceiptParser();
    await app.register(async privateApp => collaborationRoutes(
      privateApp,
      new CollaborationService(db),
      verify,
      { parser, receiptRoot: options.receiptRoot },
    ), { prefix: '/api/v1' });
    app.addHook('onClose', () => db.close());
  }

  return app;
}

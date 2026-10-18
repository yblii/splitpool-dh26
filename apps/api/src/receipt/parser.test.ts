import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '@google/genai';
import { makeSampleExtractedReceipt } from '@splitpool/contracts';
import {
  createReceiptParser,
  createSampleFallbackParser,
  formatGeminiError,
  normalizeExtractedReceipt,
  parseWithFallback,
} from './parser.ts';

describe('receipt parser adapter', () => {
  it('normalizes model output into cents-based draft JSON', () => {
    const draft = normalizeExtractedReceipt({
      merchant: 'Cafe',
      items: [{ clientId: 'a', name: 'Latte', quantity: 1, netLineTotalCents: 450, confidence: 0.9 }],
      taxCents: 40,
      tipCents: 100,
      serviceChargeCents: 0,
      discountCents: 0,
      printedTotalCents: 590,
      warnings: [],
    }, 'gemini-2.5-flash');
    expect(draft.schemaVersion).toBe(1);
    expect(draft.currency).toBe('USD');
    expect(draft.items[0].netLineTotalCents).toBe(450);
    expect(draft.warnings).toEqual([]);
  });

  it('falls back to the labeled sample when the primary parser fails and logs the error', async () => {
    const log = { warn: vi.fn(), error: vi.fn(), info: vi.fn() };
    const failing: Parameters<typeof parseWithFallback>[0] = {
      name: 'gemini-2.5-flash',
      async parseReceiptImage() {
        throw new Error('boom');
      },
    };
    const result = await parseWithFallback(failing, {
      bytes: Buffer.from('fake'),
      mimeType: 'image/jpeg',
    }, log);
    expect(result.usedFallback).toBe(true);
    expect(result.reason).toBe('parse_failed');
    expect(result.errorDetail).toContain('boom');
    expect(result.draft.source).toBe('sample-fallback');
    expect(result.draft.warnings).toContain('parse_failed');
    expect(result.draft.items).toHaveLength(makeSampleExtractedReceipt().items.length);
    expect(log.error).toHaveBeenCalled();
  });

  it('uses the sample parser when Gemini is not configured', async () => {
    expect(createReceiptParser({}).name).toBe('sample-fallback');
    expect(createReceiptParser({ GEMINI_API_KEY: '   ' }).name).toBe('sample-fallback');
    expect(createReceiptParser({ GEMINI_API_KEY: 'AIza-test' }).name).toBe('gemini-3.8-flash');

    const parser = createSampleFallbackParser();
    const draft = await parser.parseReceiptImage({
      bytes: Buffer.from('x'),
      mimeType: 'image/png',
    });
    expect(draft.source).toBe('sample-fallback');
    expect(draft.warnings).toContain('provider_unavailable');
  });

  it('formats Gemini API errors with status', () => {
    const error = new ApiError({ status: 401, message: 'API key not valid' });
    expect(formatGeminiError(error)).toContain('status=401');
    expect(formatGeminiError(error)).toContain('API key not valid');
  });
});

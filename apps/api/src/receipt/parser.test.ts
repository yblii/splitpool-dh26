import { describe, expect, it } from 'vitest';
import { makeSampleExtractedReceipt } from '@splitpool/contracts';
import {
  createSampleFallbackParser,
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
    }, 'openai-gpt-4o');
    expect(draft.schemaVersion).toBe(1);
    expect(draft.currency).toBe('USD');
    expect(draft.items[0].netLineTotalCents).toBe(450);
    expect(draft.warnings).toEqual([]);
  });

  it('falls back to the labeled sample when the primary parser fails', async () => {
    const failing: Parameters<typeof parseWithFallback>[0] = {
      name: 'openai-gpt-4o',
      async parseReceiptImage() {
        throw new Error('boom');
      },
    };
    const result = await parseWithFallback(failing, {
      bytes: Buffer.from('fake'),
      mimeType: 'image/jpeg',
    });
    expect(result.usedFallback).toBe(true);
    expect(result.draft.source).toBe('sample-fallback');
    expect(result.draft.warnings).toContain('parse_failed');
    expect(result.draft.items).toHaveLength(makeSampleExtractedReceipt().items.length);
  });

  it('uses the sample parser when OpenAI is not configured', async () => {
    const parser = createSampleFallbackParser();
    const draft = await parser.parseReceiptImage({
      bytes: Buffer.from('x'),
      mimeType: 'image/png',
    });
    expect(draft.source).toBe('sample-fallback');
    expect(draft.warnings).toContain('provider_unavailable');
  });
});

import { expect, it } from 'vitest';
import { makeSampleExtractedReceipt } from '@splitpool/contracts';
import { buildApp } from './app.ts';
import { createSampleFallbackParser } from './receipt/parser.ts';
import { createFallbackTitleGenerator } from './titles/generator.ts';

it('serves health and a read-only demo bill without exposing write operations', async () => {
  const app = await buildApp({ logger: false, parser: createSampleFallbackParser() });
  try {
    const health = await app.inject({ method: 'GET', url: '/api/v1/health' });
    expect(health.statusCode).toBe(200);
    expect(health.json()).toMatchObject({
      status: 'ok',
      mode: 'demo',
      receiptParser: 'sample-fallback',
    });
    expect(health.json()).toHaveProperty('geminiKeyPresent');
    expect(health.json()).toHaveProperty('envFileFound');
    const bill = await app.inject({ method: 'GET', url: '/api/v1/demo/bill' });
    expect(bill.json().items).toHaveLength(3);
    const groups = await app.inject({ method: 'POST', url: '/api/v1/groups' });
    expect(groups.statusCode).toBe(404);
  } finally { await app.close(); }
}, 15000);

it('extracts a draft receipt from a multipart image using the parser adapter', async () => {
  const app = await buildApp({ logger: false, parser: createSampleFallbackParser() });
  try {
    const boundary = '----splitpoolboundary';
    const payload = [
      `--${boundary}`,
      'Content-Disposition: form-data; name="image"; filename="receipt.jpg"',
      'Content-Type: image/jpeg',
      '',
      'fakereceiptbytes',
      `--${boundary}--`,
      '',
    ].join('\r\n');

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/demo/receipt-extractions',
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload,
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.usedFallback).toBe(true);
    expect(body.reason).toBe('provider_unavailable');
    expect(body.draft).toMatchObject({
      schemaVersion: 1,
      source: 'sample-fallback',
      merchant: makeSampleExtractedReceipt().merchant,
    });
    expect(body.draft.items.length).toBeGreaterThan(0);
  } finally { await app.close(); }
});

it('rejects non-image multipart uploads', async () => {
  const app = await buildApp({ logger: false, parser: createSampleFallbackParser() });
  try {
    const boundary = '----splitpoolboundary';
    const payload = [
      `--${boundary}`,
      'Content-Disposition: form-data; name="image"; filename="notes.txt"',
      'Content-Type: text/plain',
      '',
      'hello',
      `--${boundary}--`,
      '',
    ].join('\r\n');
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/demo/receipt-extractions',
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload,
    });
    expect(response.statusCode).toBe(400);
  } finally { await app.close(); }
});

it('generates positive meal titles for demo members', async () => {
  const app = await buildApp({
    logger: false,
    parser: createSampleFallbackParser(),
    titleGenerator: createFallbackTitleGenerator(),
  });
  try {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/demo/meal-titles',
      headers: { 'content-type': 'application/json' },
      payload: {
        groupName: 'Friday dinner',
        merchant: 'The Little Table',
        members: [
          { id: 'you', name: 'Jamie', items: ['House salad'] },
          { id: 'alex', name: 'Alex', items: ['Orange juice'] },
        ],
      },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.usedFallback).toBe(true);
    expect(body.titles).toEqual([
      expect.objectContaining({ id: 'you', title: 'Green Machine' }),
      expect.objectContaining({ id: 'alex', title: 'Vitamin C Warrior' }),
    ]);
  } finally { await app.close(); }
});

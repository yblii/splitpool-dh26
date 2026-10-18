import {
  makeSampleExtractedReceipt,
  type ExtractedReceipt,
  type ExtractedReceiptItem,
  type ReceiptWarning,
} from '@splitpool/contracts';
import OpenAI, { APIError } from 'openai';

export type ReceiptParseInput = {
  bytes: Buffer;
  mimeType: string;
  filename?: string;
};

export type ReceiptParser = {
  readonly name: string;
  parseReceiptImage(input: ReceiptParseInput): Promise<ExtractedReceipt>;
};

export type ReceiptFallbackReason = 'provider_unavailable' | 'parse_failed';

export type ParseWithFallbackResult = {
  draft: ExtractedReceipt;
  usedFallback: boolean;
  reason?: ReceiptFallbackReason;
  errorDetail?: string;
};

type ParseLogger = {
  warn: (obj: unknown, msg?: string) => void;
  error: (obj: unknown, msg?: string) => void;
  info: (obj: unknown, msg?: string) => void;
};

const extractedReceiptSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'merchant',
    'items',
    'taxCents',
    'tipCents',
    'serviceChargeCents',
    'discountCents',
    'printedTotalCents',
    'warnings',
  ],
  properties: {
    merchant: { type: 'string' },
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['clientId', 'name', 'quantity', 'netLineTotalCents', 'confidence'],
        properties: {
          clientId: { type: 'string' },
          name: { type: 'string' },
          quantity: { type: 'integer' },
          netLineTotalCents: { type: 'integer' },
          confidence: { type: 'number' },
        },
      },
    },
    taxCents: { type: 'integer' },
    tipCents: { type: 'integer' },
    serviceChargeCents: { type: 'integer' },
    discountCents: { type: 'integer' },
    printedTotalCents: { type: 'integer' },
    warnings: {
      type: 'array',
      items: {
        type: 'string',
        enum: ['tip_ambiguous', 'total_mismatch', 'missing_items', 'provider_unavailable', 'parse_failed'],
      },
    },
  },
} as const;

const systemPrompt = `You extract US restaurant receipt data for a bill-splitting app.
Return only structured fields. Money must be integer USD cents (e.g. $12.34 → 1234).
Each item's netLineTotalCents is the full line total including quantity.
taxCents is sales tax only. tipCents is printed gratuity/tip (0 if none).
serviceChargeCents is non-tip service charges. discountCents is absolute discount amount.
printedTotalCents is the receipt's final total.
Use warnings when tip is ambiguous, items are missing, or totals do not reconcile.
Do not invent items that are not on the receipt.`;

function nonNegativeInt(value: unknown, fallback = 0): number {
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, Math.round(number));
}

function normalizeItems(raw: unknown): ExtractedReceiptItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((entry, index) => {
    const item = entry && typeof entry === 'object' ? entry as Record<string, unknown> : {};
    const quantity = nonNegativeInt(item.quantity, 1) || 1;
    return {
      clientId: typeof item.clientId === 'string' && item.clientId.trim()
        ? item.clientId.trim()
        : `line-${index + 1}`,
      name: typeof item.name === 'string' && item.name.trim() ? item.name.trim() : `Item ${index + 1}`,
      quantity,
      netLineTotalCents: nonNegativeInt(item.netLineTotalCents),
      confidence: typeof item.confidence === 'number' ? item.confidence : undefined,
    };
  });
}

function normalizeWarnings(raw: unknown): ReceiptWarning[] {
  const allowed: ReceiptWarning[] = [
    'tip_ambiguous', 'total_mismatch', 'missing_items', 'provider_unavailable', 'parse_failed',
  ];
  if (!Array.isArray(raw)) return [];
  return raw.filter((entry): entry is ReceiptWarning =>
    typeof entry === 'string' && (allowed as string[]).includes(entry));
}

export function normalizeExtractedReceipt(
  raw: unknown,
  source: string,
  extraWarnings: ReceiptWarning[] = [],
): ExtractedReceipt {
  const data = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  const items = normalizeItems(data.items);
  const warnings = [...new Set([...normalizeWarnings(data.warnings), ...extraWarnings])];
  if (!items.length) warnings.push('missing_items');

  const draft: ExtractedReceipt = {
    schemaVersion: 1,
    source,
    merchant: typeof data.merchant === 'string' && data.merchant.trim() ? data.merchant.trim() : 'Merchant',
    currency: 'USD',
    items,
    taxCents: nonNegativeInt(data.taxCents),
    tipCents: nonNegativeInt(data.tipCents),
    serviceChargeCents: nonNegativeInt(data.serviceChargeCents),
    discountCents: nonNegativeInt(data.discountCents),
    printedTotalCents: nonNegativeInt(data.printedTotalCents),
    warnings,
  };

  const computed = draft.items.reduce((sum, item) => sum + item.netLineTotalCents, 0)
    + draft.taxCents + draft.tipCents + draft.serviceChargeCents - draft.discountCents;
  if (draft.printedTotalCents > 0 && computed !== draft.printedTotalCents
      && !draft.warnings.includes('total_mismatch')) {
    draft.warnings.push('total_mismatch');
  }
  return draft;
}

export function createSampleFallbackParser(reason: ReceiptWarning = 'provider_unavailable'): ReceiptParser {
  return {
    name: 'sample-fallback',
    async parseReceiptImage() {
      const sample = makeSampleExtractedReceipt();
      return {
        ...sample,
        warnings: [...new Set<ReceiptWarning>([...sample.warnings, reason])],
      };
    },
  };
}

export function formatOpenAIError(error: unknown): string {
  if (error instanceof APIError) {
    const code = typeof error.error === 'object' && error.error && 'code' in error.error
      ? String((error.error as { code?: unknown }).code)
      : undefined;
    const type = typeof error.error === 'object' && error.error && 'type' in error.error
      ? String((error.error as { type?: unknown }).type)
      : undefined;
    const parts = [
      error.status ? `status=${error.status}` : undefined,
      type ? `type=${type}` : undefined,
      code ? `code=${code}` : undefined,
      error.message,
    ].filter(Boolean);
    return parts.join(' | ');
  }
  if (error instanceof Error) return error.message;
  return String(error);
}

export function createOpenAIReceiptParser(apiKey: string): ReceiptParser {
  const client = new OpenAI({ apiKey });
  return {
    name: 'openai-gpt-4o',
    async parseReceiptImage(input) {
      const mimeType = input.mimeType === 'image/jpg' ? 'image/jpeg' : input.mimeType;
      const dataUrl = `data:${mimeType};base64,${input.bytes.toString('base64')}`;
      const response = await client.chat.completions.create({
        model: 'gpt-4o',
        temperature: 0,
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Extract the itemized receipt from this image.' },
              { type: 'image_url', image_url: { url: dataUrl } },
            ],
          },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'extracted_receipt',
            strict: true,
            schema: extractedReceiptSchema,
          },
        },
      });

      const content = response.choices[0]?.message?.content;
      if (!content) throw new Error('OpenAI returned an empty receipt extraction.');
      return normalizeExtractedReceipt(JSON.parse(content), 'openai-gpt-4o');
    },
  };
}

/** Prefer OpenAI when keyed; otherwise the labeled sample fixture. */
export function createReceiptParser(env: NodeJS.ProcessEnv = process.env): ReceiptParser {
  const apiKey = env.OPENAI_API_KEY?.trim();
  if (!apiKey) return createSampleFallbackParser('provider_unavailable');
  return createOpenAIReceiptParser(apiKey);
}

export async function parseWithFallback(
  parser: ReceiptParser,
  input: ReceiptParseInput,
  log?: ParseLogger,
): Promise<ParseWithFallbackResult> {
  if (parser.name === 'sample-fallback') {
    log?.warn(
      { parser: parser.name },
      'Receipt extraction using sample fallback (OPENAI_API_KEY missing/empty). Set apps/api/.env OPENAI_API_KEY and restart the API.',
    );
    return {
      draft: await parser.parseReceiptImage(input),
      usedFallback: true,
      reason: 'provider_unavailable',
    };
  }

  try {
    const draft = await parser.parseReceiptImage(input);
    log?.info({ parser: parser.name, items: draft.items.length }, 'OpenAI receipt extraction succeeded');
    return { draft, usedFallback: false };
  } catch (error) {
    const errorDetail = formatOpenAIError(error);
    log?.error(
      { parser: parser.name, err: error, errorDetail, bytes: input.bytes.length, mimeType: input.mimeType },
      'OpenAI receipt extraction failed; using sample fallback',
    );
    const fallback = createSampleFallbackParser('parse_failed');
    return {
      draft: await fallback.parseReceiptImage(input),
      usedFallback: true,
      reason: 'parse_failed',
      errorDetail,
    };
  }
}

import {
  makeSampleExtractedReceipt,
  type ExtractedReceipt,
  type ExtractedReceiptItem,
  type ReceiptWarning,
} from '@splitpool/contracts';
import { ApiError, GoogleGenAI, Type } from '@google/genai';

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

/** Multimodal model used for live receipt extraction. */
export const GEMINI_RECEIPT_MODEL = 'gemini-3.8-flash';

const extractedReceiptSchema = {
  type: Type.OBJECT,
  properties: {
    merchant: { type: Type.STRING },
    items: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          clientId: { type: Type.STRING },
          name: { type: Type.STRING },
          quantity: { type: Type.INTEGER },
          netLineTotalCents: { type: Type.INTEGER },
          confidence: { type: Type.NUMBER },
        },
        required: ['clientId', 'name', 'quantity', 'netLineTotalCents', 'confidence'],
      },
    },
    taxCents: { type: Type.INTEGER },
    tipCents: { type: Type.INTEGER },
    serviceChargeCents: { type: Type.INTEGER },
    discountCents: { type: Type.INTEGER },
    printedTotalCents: { type: Type.INTEGER },
    warnings: {
      type: Type.ARRAY,
      items: {
        type: Type.STRING,
        enum: ['tip_ambiguous', 'total_mismatch', 'missing_items', 'provider_unavailable', 'parse_failed'],
      },
    },
  },
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
};

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

export function formatGeminiError(error: unknown): string {
  if (error instanceof ApiError) {
    const parts = [
      error.status ? `status=${error.status}` : undefined,
      error.message,
    ].filter(Boolean);
    return parts.join(' | ');
  }
  if (error instanceof Error) return error.message;
  return String(error);
}

export function createGeminiReceiptParser(apiKey: string): ReceiptParser {
  const ai = new GoogleGenAI({ apiKey });
  return {
    name: 'gemini-3.8-flash',
    async parseReceiptImage(input) {
      const mimeType = input.mimeType === 'image/jpg' ? 'image/jpeg' : input.mimeType;
      const response = await ai.models.generateContent({
        model: GEMINI_RECEIPT_MODEL,
        contents: [
          {
            inlineData: {
              mimeType,
              data: input.bytes.toString('base64'),
            },
          },
          `${systemPrompt}\n\nExtract the itemized receipt from this image.`,
        ],
        config: {
          temperature: 0,
          responseMimeType: 'application/json',
          responseSchema: extractedReceiptSchema,
        },
      });

      const content = response.text?.trim();
      if (!content) throw new Error('Gemini returned an empty receipt extraction.');
      return normalizeExtractedReceipt(JSON.parse(content), GEMINI_RECEIPT_MODEL);
    },
  };
}

/** Prefer Gemini when keyed; otherwise the labeled sample fixture. */
export function createReceiptParser(env: NodeJS.ProcessEnv = process.env): ReceiptParser {
  const apiKey = env.GEMINI_API_KEY?.trim();
  if (!apiKey) return createSampleFallbackParser('provider_unavailable');
  return createGeminiReceiptParser(apiKey);
}

export async function parseWithFallback(
  parser: ReceiptParser,
  input: ReceiptParseInput,
  log?: ParseLogger,
): Promise<ParseWithFallbackResult> {
  if (parser.name === 'sample-fallback') {
    log?.warn(
      { parser: parser.name },
      'Receipt extraction using sample fallback (GEMINI_API_KEY missing/empty). Set apps/api/.env GEMINI_API_KEY and restart the API.',
    );
    return {
      draft: await parser.parseReceiptImage(input),
      usedFallback: true,
      reason: 'provider_unavailable',
    };
  }

  try {
    const draft = await parser.parseReceiptImage(input);
    log?.info({ parser: parser.name, items: draft.items.length }, 'Gemini receipt extraction succeeded');
    return { draft, usedFallback: false };
  } catch (error) {
    const errorDetail = formatGeminiError(error);
    log?.error(
      { parser: parser.name, err: error, errorDetail, bytes: input.bytes.length, mimeType: input.mimeType },
      'Gemini receipt extraction failed; using sample fallback',
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

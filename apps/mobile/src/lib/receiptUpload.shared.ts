import type { ExtractedReceipt } from '@splitpool/contracts';

export type ReceiptImageUpload = {
  uri: string;
  mimeType?: string;
  fileName?: string;
};

export type ReceiptExtractionResponse = {
  draft: ExtractedReceipt;
  usedFallback: boolean;
  reason?: 'provider_unavailable' | 'parse_failed';
  errorDetail?: string;
};

export function receiptFileMeta(image: ReceiptImageUpload): { name: string; type: string } {
  const type = image.mimeType?.trim() || 'image/jpeg';
  const extension = type.includes('png') ? 'png'
    : type.includes('webp') ? 'webp'
      : type.includes('heic') ? 'heic'
        : 'jpg';
  const name = image.fileName?.trim() || `receipt.${extension}`;
  return { name, type };
}

export type ReceiptUploadOptions = {
  signal?: AbortSignal;
  /** Absolute API path including /api/v1 prefix. */
  path?: string;
  headers?: Record<string, string>;
};

export function parseExtractionBody(body: string, status: number): ReceiptExtractionResponse {
  if (status < 200 || status >= 300) {
    let message = body || `Receipt parse failed (${status}).`;
    try {
      const parsed: unknown = JSON.parse(body);
      if (parsed && typeof parsed === 'object' && 'error' in parsed) {
        const failure = parsed as { error?: { message?: string; code?: string } };
        if (failure.error?.message) {
          message = failure.error.code
            ? `${failure.error.message} (${failure.error.code})`
            : failure.error.message;
        }
      }
    } catch {
      // Keep raw body / status message.
    }
    throw new Error(message);
  }
  let data: unknown;
  try {
    data = JSON.parse(body) as unknown;
  } catch {
    throw new Error('Unexpected receipt extraction response.');
  }
  if (!data || typeof data !== 'object' || !('draft' in data)) {
    throw new Error('Unexpected receipt extraction response.');
  }
  return data as ReceiptExtractionResponse;
}

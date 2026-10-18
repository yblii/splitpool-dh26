import type { ExtractedReceipt } from '@splitpool/contracts';

export type ReceiptImageUpload = {
  uri: string;
  mimeType?: string;
  fileName?: string;
};

export type ReceiptExtractionResponse = {
  draft: ExtractedReceipt;
  usedFallback: boolean;
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

export function parseExtractionBody(body: string, status: number): ReceiptExtractionResponse {
  if (status < 200 || status >= 300) {
    throw new Error(body || `Receipt parse failed (${status}).`);
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

import type { ExtractedReceipt } from '@splitpool/contracts';

export const apiUrl = process.env.EXPO_PUBLIC_API_URL?.trim().replace(/\/$/, '');

export async function checkApi({ signal }: { signal?: AbortSignal } = {}) {
  if (!apiUrl) throw new Error('Set EXPO_PUBLIC_API_URL in apps/mobile/.env first.');
  const response = await fetch(`${apiUrl}/api/v1/health`, { signal });
  if (!response.ok) throw new Error(`API returned ${response.status}.`);
  const data: unknown = await response.json();
  if (!data || typeof data !== 'object' || !('status' in data) || data.status !== 'ok') {
    throw new Error('Unexpected health response. Check the API URL.');
  }
  return 'API connected';
}

export type ReceiptExtractionResponse = {
  draft: ExtractedReceipt;
  usedFallback: boolean;
};

async function imagePart(uri: string, mimeType = 'image/jpeg'): Promise<Blob | { uri: string; name: string; type: string }> {
  if (uri.startsWith('blob:') || uri.startsWith('http://') || uri.startsWith('https://') || uri.startsWith('data:')) {
    const response = await fetch(uri);
    return response.blob();
  }
  // React Native FormData file shape for local camera / library URIs.
  return { uri, name: 'receipt.jpg', type: mimeType };
}

/** Upload a receipt image to the demo extract route and return draft JSON. */
export async function extractReceiptFromImage(
  uri: string,
  { signal, mimeType = 'image/jpeg' }: { signal?: AbortSignal; mimeType?: string } = {},
): Promise<ReceiptExtractionResponse> {
  if (!apiUrl) throw new Error('Set EXPO_PUBLIC_API_URL in apps/mobile/.env to parse receipts.');

  const form = new FormData();
  const part = await imagePart(uri, mimeType);
  if (part instanceof Blob) form.append('image', part, 'receipt.jpg');
  else form.append('image', part as unknown as Blob);

  const response = await fetch(`${apiUrl}/api/v1/demo/receipt-extractions`, {
    method: 'POST',
    body: form,
    signal,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(text || `Receipt parse failed (${response.status}).`);
  }

  const data: unknown = await response.json();
  if (!data || typeof data !== 'object' || !('draft' in data)) {
    throw new Error('Unexpected receipt extraction response.');
  }
  return data as ReceiptExtractionResponse;
}

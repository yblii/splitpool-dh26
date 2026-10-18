import { Platform } from 'react-native';
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

export type ReceiptImageUpload = {
  uri: string;
  mimeType?: string;
  fileName?: string;
};

/** React Native multipart file part — must not be a web Blob/File. */
type ReactNativeFilePart = {
  uri: string;
  name: string;
  type: string;
};

function receiptFileMeta(image: ReceiptImageUpload): { name: string; type: string } {
  const type = image.mimeType?.trim() || 'image/jpeg';
  const extension = type.includes('png') ? 'png'
    : type.includes('webp') ? 'webp'
      : type.includes('heic') ? 'heic'
        : 'jpg';
  const name = image.fileName?.trim() || `receipt.${extension}`;
  return { name, type };
}

async function appendReceiptImage(form: FormData, image: ReceiptImageUpload): Promise<void> {
  const { name, type } = receiptFileMeta(image);

  if (Platform.OS === 'web') {
    // Browser FormData expects Blob/File parts.
    const response = await fetch(image.uri);
    const blob = await response.blob();
    form.append('image', blob, name);
    return;
  }

  // Physical devices / Expo Go: RN fetch only accepts { uri, name, type }.
  const file: ReactNativeFilePart = {
    uri: image.uri,
    name,
    type,
  };
  form.append('image', file as unknown as Blob);
}

/** Upload a receipt image to the demo extract route and return draft JSON. */
export async function extractReceiptFromImage(
  image: string | ReceiptImageUpload,
  { signal }: { signal?: AbortSignal } = {},
): Promise<ReceiptExtractionResponse> {
  if (!apiUrl) throw new Error('Set EXPO_PUBLIC_API_URL in apps/mobile/.env to parse receipts.');

  const upload = typeof image === 'string' ? { uri: image } : image;
  if (!upload.uri) throw new Error('Receipt image URI is missing.');

  const form = new FormData();
  await appendReceiptImage(form, upload);

  const response = await fetch(`${apiUrl}/api/v1/demo/receipt-extractions`, {
    method: 'POST',
    body: form,
    signal,
    // Let fetch set multipart boundary; do not set Content-Type manually.
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

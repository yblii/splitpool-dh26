import {
  parseExtractionBody,
  receiptFileMeta,
  type ReceiptExtractionResponse,
  type ReceiptImageUpload,
} from './receiptUpload.shared';

/** Web upload uses standard Blob FormData (browser fetch). */
export async function uploadReceiptImage(
  apiBaseUrl: string,
  image: ReceiptImageUpload,
  { signal }: { signal?: AbortSignal } = {},
): Promise<ReceiptExtractionResponse> {
  const { name } = receiptFileMeta(image);
  const response = await fetch(image.uri, { signal });
  const blob = await response.blob();
  const form = new FormData();
  form.append('image', blob, name);

  const upload = await fetch(`${apiBaseUrl}/api/v1/demo/receipt-extractions`, {
    method: 'POST',
    body: form,
    signal,
  });
  const text = await upload.text().catch(() => '');
  return parseExtractionBody(text, upload.status);
}

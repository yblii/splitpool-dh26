import {
  parseExtractionBody,
  receiptFileMeta,
  type ReceiptExtractionResponse,
  type ReceiptImageUpload,
  type ReceiptUploadOptions,
} from './receiptUpload.shared';

/** Web upload uses standard Blob FormData (browser fetch). */
export async function uploadReceiptImage(
  apiBaseUrl: string,
  image: ReceiptImageUpload,
  options: ReceiptUploadOptions = {},
): Promise<ReceiptExtractionResponse> {
  const { name } = receiptFileMeta(image);
  const path = options.path ?? '/api/v1/demo/receipt-extractions';
  const response = await fetch(image.uri, { signal: options.signal });
  const blob = await response.blob();
  const form = new FormData();
  form.append('image', blob, name);

  const upload = await fetch(`${apiBaseUrl}${path}`, {
    method: 'POST',
    body: form,
    signal: options.signal,
    headers: options.headers,
  });
  const text = await upload.text().catch(() => '');
  return parseExtractionBody(text, upload.status);
}

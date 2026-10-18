import { File, UploadType } from 'expo-file-system';
import {
  parseExtractionBody,
  receiptFileMeta,
  type ReceiptExtractionResponse,
  type ReceiptImageUpload,
  type ReceiptUploadOptions,
} from './receiptUpload.shared';

/**
 * Native upload uses expo-file-system multipart networking.
 * Do not construct FormData here — Expo SDK 57 fetch rejects RN `{uri,name,type}` parts.
 */
export async function uploadReceiptImage(
  apiBaseUrl: string,
  image: ReceiptImageUpload,
  options: ReceiptUploadOptions = {},
): Promise<ReceiptExtractionResponse> {
  const { type } = receiptFileMeta(image);
  const path = options.path ?? '/api/v1/demo/receipt-extractions';
  const file = new File(image.uri);
  const result = await file.upload(`${apiBaseUrl}${path}`, {
    httpMethod: 'POST',
    uploadType: UploadType.MULTIPART,
    fieldName: 'image',
    mimeType: type,
    signal: options.signal,
    headers: options.headers,
  });
  return parseExtractionBody(result.body, result.status);
}

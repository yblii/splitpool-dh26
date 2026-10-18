import { File, UploadType } from 'expo-file-system';
import {
  parseExtractionBody,
  receiptFileMeta,
  type ReceiptExtractionResponse,
  type ReceiptImageUpload,
} from './receiptUpload.shared';

/**
 * Native upload uses expo-file-system multipart networking.
 * Do not construct FormData here — Expo SDK 57 fetch rejects RN `{uri,name,type}` parts.
 */
export async function uploadReceiptImage(
  apiBaseUrl: string,
  image: ReceiptImageUpload,
  { signal }: { signal?: AbortSignal } = {},
): Promise<ReceiptExtractionResponse> {
  const { type } = receiptFileMeta(image);
  const file = new File(image.uri);
  const result = await file.upload(`${apiBaseUrl}/api/v1/demo/receipt-extractions`, {
    httpMethod: 'POST',
    uploadType: UploadType.MULTIPART,
    fieldName: 'image',
    mimeType: type,
    signal,
  });
  return parseExtractionBody(result.body, result.status);
}

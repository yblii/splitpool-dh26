import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

const DEFAULT_ROOT = resolve(process.cwd(), 'data', 'receipts');

export function receiptStorageRoot(override?: string) {
  return override ? resolve(override) : DEFAULT_ROOT;
}

function extensionForMime(mimeType: string): string {
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/webp') return 'webp';
  if (mimeType === 'image/heic' || mimeType === 'image/heif') return 'heic';
  return 'jpg';
}

/** Persist receipt bytes under data/receipts/{billId}/{uuid}.ext; return relative image_key. */
export async function writeReceiptImage(
  billId: string,
  bytes: Buffer,
  mimeType: string,
  root = receiptStorageRoot(),
): Promise<string> {
  const extension = extensionForMime(mimeType);
  const relativeKey = `${billId}/${randomUUID()}.${extension}`;
  const absolutePath = join(root, relativeKey);
  await mkdir(join(root, billId), { recursive: true });
  await writeFile(absolutePath, bytes);
  return relativeKey;
}

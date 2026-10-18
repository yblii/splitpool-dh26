/**
 * TypeScript / default entry. Metro replaces this with:
 * - receiptUpload.native.ts on iOS/Android
 * - receiptUpload.web.ts on web
 */
export { uploadReceiptImage } from './receiptUpload.web';

import type {
  ApiFailure,
  BillResponse,
  Fraction,
  Group,
  GroupDetail,
  Profile,
  SaveItemsRequest,
  UpdateSettingsRequest,
  VerifiedReceipt,
} from '@splitpool/contracts';
import { apiUrl } from './api';
import { uploadReceiptImage } from './receiptUpload';
import type { ReceiptExtractionResponse, ReceiptImageUpload } from './receiptUpload.shared';
import { getSupabase } from './supabase';

export class ApiClientError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: Record<string, unknown>;

  constructor(status: number, code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function isApiClientError(error: unknown): error is ApiClientError {
  return error instanceof ApiClientError
    || (typeof error === 'object' && error !== null && (error as { name?: string }).name === 'ApiClientError');
}

export function formatApiError(error: unknown): string {
  if (isApiClientError(error)) {
    const err = error as ApiClientError;
    return err.status ? `${err.message} (${err.code}, HTTP ${err.status})` : err.message;
  }
  if (error instanceof Error && error.message) return error.message;
  return 'Something went wrong. Try again.';
}

export function isApiConfigured() {
  return Boolean(apiUrl);
}

async function getAccessToken() {
  const client = getSupabase();
  if (!client) return null;
  const { data, error } = await client.auth.getSession();
  if (error) return null;
  return data.session?.access_token ?? null;
}

async function parseFailure(response: Response): Promise<ApiClientError> {
  let code = 'REQUEST_FAILED';
  let message = `API returned ${response.status}.`;
  let details: Record<string, unknown> | undefined;
  try {
    const body: unknown = await response.json();
    if (body && typeof body === 'object' && 'error' in body) {
      const failure = body as ApiFailure;
      if (failure.error?.code) code = failure.error.code;
      if (failure.error?.message) message = failure.error.message;
      details = failure.error?.details;
    }
  } catch {
    // Non-JSON error bodies still surface status.
  }
  return new ApiClientError(response.status, code, message, details);
}

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
};

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  if (!apiUrl) {
    throw new ApiClientError(
      503,
      'API_NOT_CONFIGURED',
      'Set EXPO_PUBLIC_API_URL in apps/mobile/.env to your API (LAN IP on a phone), then restart Expo.',
    );
  }

  const token = await getAccessToken();
  if (!token) {
    throw new ApiClientError(401, 'AUTH_REQUIRED', 'Sign in again to continue.');
  }

  const url = `${apiUrl}/api/v1${path}`;
  let response: Response;
  try {
    response = await fetch(url, {
      method: options.method ?? 'GET',
      signal: options.signal,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Network request failed';
    throw new ApiClientError(
      503,
      'NETWORK_ERROR',
      `Could not reach ${url} (${detail}). curl on the PC is not enough — open that health URL in the phone’s browser. If it fails, allow inbound TCP 3001 on the PC firewall or use the same Wi‑Fi without client isolation.`,
    );
  }

  if (!response.ok) throw await parseFailure(response);
  if (response.status === 204) return undefined as T;
  try {
    return await response.json() as T;
  } catch {
    throw new ApiClientError(
      response.status,
      'INVALID_RESPONSE',
      `API returned a non-JSON body from ${url}. Check that EXPO_PUBLIC_API_URL points at the Fastify API (for laptop web use http://localhost:3001).`,
    );
  }
}

export async function getMe({ signal }: { signal?: AbortSignal } = {}) {
  const data = await apiRequest<{ profile: Profile | null }>('/me', { signal });
  return data.profile;
}

export async function saveAppProfile(
  input: { username?: string; displayName?: string },
  { signal }: { signal?: AbortSignal } = {},
) {
  const data = await apiRequest<{ profile: Profile }>('/me', {
    method: 'PATCH',
    body: input,
    signal,
  });
  return data.profile;
}

export async function listGroups({ signal }: { signal?: AbortSignal } = {}) {
  const data = await apiRequest<{ groups: Group[] }>('/groups', { signal });
  return data.groups;
}

export async function createGroup(name: string, { signal }: { signal?: AbortSignal } = {}) {
  return apiRequest<Group>('/groups', {
    method: 'POST',
    body: { name },
    signal,
  });
}

export async function getGroup(groupId: string, { signal }: { signal?: AbortSignal } = {}) {
  return apiRequest<GroupDetail>(`/groups/${groupId}`, { signal });
}

export async function createBill(
  groupId: string,
  participantIds: string[],
  { signal }: { signal?: AbortSignal } = {},
) {
  return apiRequest<BillResponse>(`/groups/${groupId}/bills`, {
    method: 'POST',
    body: { participantIds },
    signal,
  });
}

export async function getBill(billId: string, { signal }: { signal?: AbortSignal } = {}) {
  return apiRequest<BillResponse>(`/bills/${billId}`, { signal });
}

/** Host OCR upload for a bill; persists image_key + draft on the API. */
export async function extractBillReceipt(
  billId: string,
  image: ReceiptImageUpload,
  { signal }: { signal?: AbortSignal } = {},
): Promise<ReceiptExtractionResponse> {
  if (!apiUrl) {
    throw new ApiClientError(
      503,
      'API_NOT_CONFIGURED',
      'Set EXPO_PUBLIC_API_URL in apps/mobile/.env to parse receipts.',
    );
  }
  const token = await getAccessToken();
  if (!token) {
    throw new ApiClientError(401, 'AUTH_REQUIRED', 'Sign in again to continue.');
  }
  try {
    return await uploadReceiptImage(apiUrl, image, {
      signal,
      path: `/api/v1/bills/${billId}/receipt-extractions`,
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });
  } catch (error) {
    if (error instanceof ApiClientError) throw error;
    const message = error instanceof Error ? error.message : 'Could not parse receipt.';
    throw new ApiClientError(503, 'RECEIPT_EXTRACT_FAILED', message);
  }
}

/** Map host-verified OCR draft → SaveItemsRequest (omit non-UUID item ids; fold tip into service). */
export function saveItemsFromVerifiedReceipt(
  verified: VerifiedReceipt,
  expectedVersion: number,
): SaveItemsRequest {
  return {
    expectedVersion,
    merchant: verified.merchant,
    items: verified.items.map((item) => ({
      name: item.name,
      quantity: item.quantity,
      netLineTotalCents: item.netLineTotalCents,
    })),
    taxCents: verified.taxCents,
    serviceChargeCents: verified.tipCents + verified.serviceChargeCents,
    printedTotalCents: verified.printedTotalCents,
  };
}

export async function saveBillItems(
  billId: string,
  body: SaveItemsRequest,
  { signal }: { signal?: AbortSignal } = {},
) {
  return apiRequest<BillResponse>(`/bills/${billId}/items`, {
    method: 'PUT',
    body,
    signal,
  });
}

export async function setItemClaim(
  billId: string,
  itemId: string,
  input: { expectedVersion: number; fraction: Fraction },
  { signal }: { signal?: AbortSignal } = {},
) {
  return apiRequest<BillResponse>(`/bills/${billId}/items/${itemId}/claim`, {
    method: 'PUT',
    body: input,
    signal,
  });
}

export async function setBillTip(
  billId: string,
  input: { expectedVersion: number; tipCents: number },
  { signal }: { signal?: AbortSignal } = {},
) {
  return apiRequest<BillResponse>(`/bills/${billId}/tip`, {
    method: 'PUT',
    body: input,
    signal,
  });
}

export async function updateBillSettings(
  billId: string,
  input: UpdateSettingsRequest,
  { signal }: { signal?: AbortSignal } = {},
) {
  return apiRequest<BillResponse>(`/bills/${billId}/settings`, {
    method: 'PATCH',
    body: input,
    signal,
  });
}

export async function createInvite(
  groupId: string,
  username?: string,
  { signal }: { signal?: AbortSignal } = {},
) {
  return apiRequest<{ token: string; expiresAt: string; groupId: string }>(`/groups/${groupId}/invites`, {
    method: 'POST',
    body: username ? { username } : {},
    signal,
  });
}

export async function acceptInvite(token: string, { signal }: { signal?: AbortSignal } = {}) {
  return apiRequest<{ groupId: string }>(`/invites/${token}/accept`, {
    method: 'POST',
    signal,
  });
}

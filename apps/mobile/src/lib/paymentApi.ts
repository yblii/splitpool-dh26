import type { BillProjection, ReviewDraft, SessionProjection } from '@splitpool/contracts';
import { apiUrl } from './api';
import { ApiClientError } from './apiClient';
import { getSupabase } from './supabase';

async function actorHeaders(userId: string, extra: Record<string, string> = {}) {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'x-user-id': userId,
    ...extra,
  };
  const client = getSupabase();
  if (client) {
    const { data } = await client.auth.getSession();
    const token = data.session?.access_token;
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

async function paymentRequest<T>(
  path: string,
  userId: string,
  options: {
    method?: 'GET' | 'POST';
    body?: unknown;
    idempotencyKey?: string;
    signal?: AbortSignal;
  } = {},
): Promise<T> {
  if (!apiUrl) {
    throw new ApiClientError(503, 'API_NOT_CONFIGURED', 'Set EXPO_PUBLIC_API_URL to use payments.');
  }
  const headers = await actorHeaders(userId, options.idempotencyKey
    ? { 'idempotency-key': options.idempotencyKey }
    : {});
  const url = `${apiUrl}/api/v1${path}`;
  let response: Response;
  try {
    response = await fetch(url, {
      method: options.method ?? 'GET',
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: options.signal,
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Network request failed';
    throw new ApiClientError(503, 'NETWORK_ERROR', `Could not reach payment API (${detail}).`);
  }

  if (!response.ok) {
    let message = `Payment API returned ${response.status}.`;
    try {
      const body: unknown = await response.json();
      if (body && typeof body === 'object' && 'error' in body) {
        const failure = body as { error?: string | { message?: string; code?: string } };
        if (typeof failure.error === 'string') message = failure.error;
        else if (failure.error?.message) message = failure.error.message;
      }
    } catch {
      // keep status message
    }
    throw new ApiClientError(response.status, 'PAYMENT_FAILED', message);
  }

  if (response.status === 204) return undefined as T;
  return await response.json() as T;
}

export async function reviewBillPayment(billId: string, userId: string, draft: ReviewDraft) {
  return paymentRequest<BillProjection>(`/bills/${billId}/review`, userId, {
    method: 'POST',
    body: draft,
  });
}

export async function reopenBillPayment(billId: string, userId: string) {
  return paymentRequest<BillProjection>(`/bills/${billId}/reopen`, userId, { method: 'POST' });
}

export async function acceptBillShare(billId: string, userId: string) {
  return paymentRequest<BillProjection>(`/bills/${billId}/acceptances`, userId, { method: 'POST' });
}

export async function confirmBillCollection(billId: string, userId: string, idempotencyKey: string) {
  return paymentRequest<SessionProjection>(`/bills/${billId}/confirm`, userId, {
    method: 'POST',
    idempotencyKey,
  });
}

export async function getPaymentSession(sessionId: string, userId: string) {
  return paymentRequest<SessionProjection>(`/payment-sessions/${sessionId}`, userId);
}

export async function authorizeMyContribution(sessionId: string, userId: string, idempotencyKey: string) {
  return paymentRequest<SessionProjection>(`/payment-sessions/${sessionId}/contributions/me`, userId, {
    method: 'POST',
    idempotencyKey,
  });
}

export async function retryMyContribution(sessionId: string, userId: string, idempotencyKey: string) {
  return paymentRequest<SessionProjection>(`/payment-sessions/${sessionId}/contributions/me/retry`, userId, {
    method: 'POST',
    idempotencyKey,
  });
}

export async function openPaymentCheckout(sessionId: string, userId: string, idempotencyKey: string) {
  return paymentRequest<SessionProjection>(`/payment-sessions/${sessionId}/checkout`, userId, {
    method: 'POST',
    idempotencyKey,
  });
}

export async function getPaymentCard(sessionId: string, userId: string) {
  return paymentRequest<{ last4: string | null; status: string; budgetCents: number }>(
    `/payment-sessions/${sessionId}/card`,
    userId,
  );
}

export async function cancelPaymentSession(sessionId: string, userId: string, idempotencyKey: string) {
  return paymentRequest<SessionProjection>(`/payment-sessions/${sessionId}/cancel`, userId, {
    method: 'POST',
    idempotencyKey,
  });
}

export async function simulateMerchantCharge(
  sessionId: string,
  userId: string,
  scenario: 'exact' | 'under' | 'incremental' | 'wrong_merchant' | 'reverse' | 'late_capture',
  idempotencyKey: string,
) {
  return paymentRequest<SessionProjection>(`/simulation/payment-sessions/${sessionId}/merchant-events`, userId, {
    method: 'POST',
    body: { scenario },
    idempotencyKey,
  });
}

export async function getBillPayment(billId: string, userId: string) {
  return paymentRequest<BillProjection | null>(`/bills/${billId}/payment`, userId);
}

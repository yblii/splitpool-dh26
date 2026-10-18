import type { ApiFailure, Profile } from '@splitpool/contracts';
import { apiUrl } from './api';
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

  const response = await fetch(`${apiUrl}/api/v1${path}`, {
    method: options.method ?? 'GET',
    signal: options.signal,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  if (!response.ok) throw await parseFailure(response);
  if (response.status === 204) return undefined as T;
  return await response.json() as T;
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

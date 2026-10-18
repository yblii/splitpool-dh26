import { createClient } from '@supabase/supabase-js';
import { ApiError } from './errors.ts';

export type VerifyToken = (token: string) => Promise<string>;

export function supabaseVerifier(url: string, key: string): VerifyToken {
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(10000) }) },
  });
  return async (token) => {
    const { data, error } = await client.auth.getUser(token);
    if (error) {
      if (error.status === 400 || error.status === 401 || error.status === 403)
        throw new ApiError(401, 'INVALID_TOKEN', 'Sign in again.');
      throw new ApiError(503, 'AUTH_UNAVAILABLE', 'Authentication is temporarily unavailable.');
    }
    if (!data.user) throw new ApiError(401, 'INVALID_TOKEN', 'Sign in again.');
    return data.user.id;
  };
}

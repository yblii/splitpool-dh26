import 'react-native-url-polyfill/auto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

function trimEnv(value: string | undefined) {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function maskSecret(value: string | undefined) {
  if (!value) return '(missing)';
  if (value.length <= 8) return `${value[0]}…(${value.length} chars)`;
  return `${value.slice(0, 6)}…${value.slice(-4)} (${value.length} chars)`;
}

function maskUrl(value: string | undefined) {
  if (!value) return '(missing)';
  try {
    const parsed = new URL(value);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return `(invalid URL, ${value.length} chars)`;
  }
}

/**
 * Expo only inlines EXPO_PUBLIC_* into the client bundle.
 * SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY without that prefix are invisible here.
 */
const url = trimEnv(process.env.EXPO_PUBLIC_SUPABASE_URL);
const publishableKey = trimEnv(process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
const anonKey = trimEnv(process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY);
const key = publishableKey ?? anonKey;

export const supabaseConfigured = Boolean(url && key);

export type SupabaseEnvStatus = {
  configured: boolean;
  hasUrl: boolean;
  hasKey: boolean;
  keySource: 'publishable' | 'anon' | 'none';
  urlPreview: string;
  keyPreview: string;
};

export function getSupabaseEnvStatus(): SupabaseEnvStatus {
  return {
    configured: supabaseConfigured,
    hasUrl: Boolean(url),
    hasKey: Boolean(key),
    keySource: publishableKey ? 'publishable' : anonKey ? 'anon' : 'none',
    urlPreview: maskUrl(url),
    keyPreview: maskSecret(key),
  };
}

export function logSupabaseEnvStatus(prefix = '[SplitPool] Supabase env') {
  const status = getSupabaseEnvStatus();
  const lines = [
    `${prefix}: configured=${status.configured}`,
    `  EXPO_PUBLIC_SUPABASE_URL=${status.urlPreview}`,
    `  key=${status.keyPreview} (source=${status.keySource})`,
    status.configured
      ? '  Sign-up/sign-in controls should be enabled.'
      : [
        '  Missing vars. Expo only exposes EXPO_PUBLIC_* to the app.',
        '  Use apps/mobile/.env with:',
        '    EXPO_PUBLIC_SUPABASE_URL=...',
        '    EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...  (or EXPO_PUBLIC_SUPABASE_ANON_KEY)',
        '  Names like SUPABASE_URL without EXPO_PUBLIC_ will not work.',
        '  Then fully restart Expo (stop Metro, then npm start).',
      ].join('\n'),
  ];
  if (status.configured) console.log(lines.join('\n'));
  else console.warn(lines.join('\n'));
  return status;
}

// Log once when the module loads (Metro / app startup).
logSupabaseEnvStatus();

let client: SupabaseClient | undefined;

export function getSupabase() {
  if (!url || !key) return null;
  client ??= createClient(url, key, {
    auth: {
      ...(Platform.OS !== 'web' ? { storage: {
        getItem: (name: string) => SecureStore.getItemAsync(name),
        setItem: (name: string, value: string) => SecureStore.setItemAsync(name, value),
        removeItem: (name: string) => SecureStore.deleteItemAsync(name),
      } } : {}),
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  });
  return client;
}

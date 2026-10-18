import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const KEY = 'splitpool.meal-titles.v1';
export type SavedTitle = { title: string; source: string; usedFallback: boolean };
export type SavedTitles = Record<string, SavedTitle>;

export async function readTitles(): Promise<SavedTitles> {
  try {
    const raw = Platform.OS === 'web' ? globalThis.localStorage?.getItem(KEY) : await SecureStore.getItemAsync(KEY);
    if (!raw) return {};
    const data: unknown = JSON.parse(raw);
    if (!data || typeof data !== 'object' || Array.isArray(data)) return {};
    return Object.fromEntries(Object.entries(data).filter(([id, row]) =>
      ['you', 'alex', 'sam', 'riley', 'morgan'].includes(id)
      && row && typeof row.title === 'string' && row.title.length <= 48
      && typeof row.source === 'string' && row.source.length < 80 && typeof row.usedFallback === 'boolean'));
  } catch { return {}; }
}

/** Only five demo identities, each with a short title and provenance, are retained. */
export async function writeTitles(titles: SavedTitles): Promise<void> {
  const value = JSON.stringify(titles);
  if (Platform.OS === 'web') globalThis.localStorage.setItem(KEY, value);
  else await SecureStore.setItemAsync(KEY, value);
}

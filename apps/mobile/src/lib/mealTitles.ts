import type { MealTitlesRequest, MealTitlesResponse } from '@splitpool/contracts';
import { apiUrl } from './api';

/** A visibly labeled, deterministic fallback; never presented as generated AI. */
export function localFallbackTitles(request: MealTitlesRequest): MealTitlesResponse {
  const used = new Set<string>();
  return {
    usedFallback: true,
    source: 'local-fallback',
    titles: request.members.map((member, index) => {
      const food = member.items.join(' ').toLowerCase();
      const candidates: [RegExp, string][] = [
        [/rice|risotto|biryani/, 'Rice Royalty'],
        [/pizza|margherita/, 'Pizza Diplomat'],
        [/pasta|noodle|ramen/, 'Noodle Knight'],
        [/salad|spinach|kale/, 'Salad Sidekick'],
        [/mushroom/, 'Mushroom Maven'],
        [/ice cream|cake|cookie/, 'Sweet Finisher'],
      ];
      const title = candidates.find(([pattern, name]) => pattern.test(food) && !used.has(name))?.[1]
        ?? `Flavor Explorer ${index + 1}`;
      used.add(title);
      return { ...member, title };
    }),
  };
}

export function validTitleResponse(data: unknown, request: MealTitlesRequest): data is MealTitlesResponse {
  if (!data || typeof data !== 'object') return false;
  const result = data as Partial<MealTitlesResponse>;
  if (!Array.isArray(result.titles) || result.titles.length !== request.members.length
    || typeof result.source !== 'string' || typeof result.usedFallback !== 'boolean') return false;
  const ids = new Set<string>();
  return result.titles.every(row => {
    if (!row || typeof row.id !== 'string' || typeof row.title !== 'string'
      || !request.members.some(member => member.id === row.id) || ids.has(row.id)
      || row.title.length > 48 || !/^[A-Za-z][A-Za-z0-9 '\-]+$/.test(row.title)) return false;
    ids.add(row.id);
    return true;
  });
}

export async function generateMealTitles(request: MealTitlesRequest, signal?: AbortSignal): Promise<MealTitlesResponse> {
  if (!apiUrl) return localFallbackTitles(request);
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) controller.abort();
  const timer = setTimeout(abort, 12000);
  try {
    const response = await fetch(`${apiUrl}/api/v1/demo/meal-titles`, {
      method: 'POST', signal: controller.signal,
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });
    const data: unknown = response.ok ? await response.json() : null;
    return validTitleResponse(data, request) ? data : localFallbackTitles(request);
  } catch {
    return localFallbackTitles(request);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}

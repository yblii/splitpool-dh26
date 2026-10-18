import type { MealHistoryEntry, MealTitlesRequest, MealTitlesResponse } from '@splitpool/contracts';
import { apiUrl } from './api';

/** Local keyword fallback when the API or Gemini is unavailable. */
export function localFallbackTitles(request: MealTitlesRequest): MealTitlesResponse {
  const used = new Set<string>();
  const titles = request.members.map((member) => {
    const items = member.items.map((item) => item.trim()).filter(Boolean);
    const blob = items.join(' ').toLowerCase();
    const pick = (title: string) => {
      if (used.has(title)) return null;
      used.add(title);
      return title;
    };
    let title =
      (/\b(salad|kale|spinach|greens?|broccoli|avocado)\b/.test(blob) && pick('Green Machine'))
      || (/\b(orange|lemon|lime|citrus|grapefruit|kiwi)\b/.test(blob) && pick('Vitamin C Warrior'))
      || (/\b(berry|berries|blueberry|strawberry|smoothie)\b/.test(blob) && pick('Antioxidant Ace'))
      || (/\b(salmon|tuna|fish|shrimp|seafood)\b/.test(blob) && pick('Omega Champion'))
      || (/\b(steak|chicken|beef|pork|protein|egg|tofu)\b/.test(blob) && pick('Protein Pro'))
      || (/\b(pizza|margherita)\b/.test(blob) && pick('Crust Virtuoso'))
      || (/\b(pasta|noodle|ramen|spaghetti)\b/.test(blob) && pick('Pasta Virtuoso'))
      || (/\b(sushi|roll|sashimi)\b/.test(blob) && pick('Sushi Star'))
      || (/\b(taco|burrito|salsa|chili|spicy)\b/.test(blob) && pick('Spice Scout'))
      || (/\b(dessert|cake|ice cream|cookie|brownie)\b/.test(blob) && pick('Sweet Finisher'))
      || (items.length === 0 && pick('Table Cheer'))
      || pick('Flavor Explorer')
      || pick('Plate Poet')
      || pick(`Food Fan ${used.size + 1}`)
      || 'Dining Dynamo';
    return { id: member.id, name: member.name, title, items };
  });
  return { titles, source: 'local-fallback', usedFallback: true };
}

export async function generateMealTitles(
  request: MealTitlesRequest,
  { signal }: { signal?: AbortSignal } = {},
): Promise<MealTitlesResponse> {
  if (!request.members.length) {
    return { titles: [], source: 'local-fallback', usedFallback: true };
  }
  if (!apiUrl) return localFallbackTitles(request);

  try {
    const response = await fetch(`${apiUrl}/api/v1/demo/meal-titles`, {
      method: 'POST',
      signal,
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });
    if (!response.ok) return localFallbackTitles(request);
    const data: unknown = await response.json();
    if (!data || typeof data !== 'object' || !('titles' in data) || !Array.isArray((data as MealTitlesResponse).titles)) {
      return localFallbackTitles(request);
    }
    return data as MealTitlesResponse;
  } catch {
    return localFallbackTitles(request);
  }
}

export function makeHistoryEntry(input: {
  groupName: string;
  merchant: string;
  titles: MealTitlesResponse['titles'];
  source: string;
}): MealHistoryEntry {
  return {
    id: `meal-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    groupName: input.groupName,
    merchant: input.merchant,
    settledAt: new Date().toISOString(),
    titles: input.titles,
    source: input.source,
  };
}

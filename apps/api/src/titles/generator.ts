import { GoogleGenAI, Type } from '@google/genai';
import type {
  MealTitleAssignment,
  MealTitleMemberInput,
  MealTitlesRequest,
  MealTitlesResponse,
} from '@splitpool/contracts';
import { formatGeminiError } from '../receipt/parser.ts';

/** Same multimodal model family as receipt extraction. */
export const GEMINI_TITLE_MODEL = 'gemini-3.8-flash';

const NEGATIVE_TITLE_PATTERN =
  /\b(fat|fatty|greasy|guilty|pig|binge|chubby|obese|unhealthy|gross|disgusting|slob|lazy|junkie|weak|pathetic|loser|ugly|shame|shameful|overweight|bloated|stuffed|glutton)\b/i;

const titleSchema = {
  type: Type.OBJECT,
  properties: {
    titles: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          title: { type: Type.STRING },
        },
        required: ['id', 'title'],
      },
    },
  },
  required: ['titles'],
};

const systemPrompt = `You invent fun, positive food-themed titles for diners in a bill-splitting app.
Each title is based only on the food items that person ate.
Infer nutrition in an upbeat way (greens, vitamin C, protein, comfort classics, spice, freshness, etc.).

Hard rules:
- Titles must be complimentary, playful, and kind. Never hurtful or teasing.
- Never body-shame. Never mention weight, calories as guilt, overeating, diet failure, or inferiority.
- Never use negative food shame words (fatty, greasy, guilty, junk, pig, binge, etc.).
- Prefer 2–4 word titles like "Green Machine", "Vitamin C Warrior", "Protein Pro", "Pasta Virtuoso".
- Make titles unique across the group when possible.
- If someone ordered nothing, use a warm table-spirit title like "Table Cheer".
Return JSON only matching the schema.`;

export type TitleGenerator = {
  readonly name: string;
  generate(input: MealTitlesRequest): Promise<MealTitlesResponse>;
};

type TitleLogger = {
  warn: (obj: unknown, msg?: string) => void;
  error: (obj: unknown, msg?: string) => void;
  info: (obj: unknown, msg?: string) => void;
};

function sanitizeTitle(raw: string, fallback: string): string {
  const cleaned = raw.replace(/\s+/g, ' ').trim().replace(/^["']|["']$/g, '');
  if (!cleaned || cleaned.length > 48 || NEGATIVE_TITLE_PATTERN.test(cleaned)) return fallback;
  return cleaned;
}

function keywordTitle(items: string[], used: Set<string>): string {
  const blob = items.join(' ').toLowerCase();
  const candidates: Array<{ test: RegExp; title: string }> = [
    { test: /\b(salad|kale|spinach|greens?|broccoli|avocado)\b/, title: 'Green Machine' },
    { test: /\b(orange|lemon|lime|citrus|grapefruit|kiwi)\b/, title: 'Vitamin C Warrior' },
    { test: /\b(berry|berries|blueberry|strawberry|smoothie)\b/, title: 'Antioxidant Ace' },
    { test: /\b(salmon|tuna|fish|shrimp|seafood)\b/, title: 'Omega Champion' },
    { test: /\b(steak|chicken|beef|pork|protein|egg|tofu)\b/, title: 'Protein Pro' },
    { test: /\b(yogurt|milk|cheese|latte|cappuccino)\b/, title: 'Calcium Captain' },
    { test: /\b(pizza|margherita)\b/, title: 'Crust Virtuoso' },
    { test: /\b(pasta|noodle|ramen|spaghetti)\b/, title: 'Pasta Virtuoso' },
    { test: /\b(sushi|roll|sashimi)\b/, title: 'Sushi Star' },
    { test: /\b(taco|burrito|salsa|chili|spicy)\b/, title: 'Spice Scout' },
    { test: /\b(soup|broth|pho)\b/, title: 'Comfort Cup' },
    { test: /\b(fries|potato|burger)\b/, title: 'Comfort Classic' },
    { test: /\b(dessert|cake|ice cream|cookie|brownie)\b/, title: 'Sweet Finisher' },
    { test: /\b(tea|matcha|herbal)\b/, title: 'Calm Cup' },
    { test: /\b(coffee|espresso)\b/, title: 'Roast Ranger' },
    { test: /\b(water|sparkling)\b/, title: 'Hydration Hero' },
  ];

  for (const candidate of candidates) {
    if (candidate.test.test(blob) && !used.has(candidate.title)) {
      used.add(candidate.title);
      return candidate.title;
    }
  }

  const generics = [
    'Flavor Explorer',
    'Plate Poet',
    'Bite Bard',
    'Menu Maestro',
    'Table Treasure',
    'Dining Dynamo',
  ];
  for (const title of generics) {
    if (!used.has(title)) {
      used.add(title);
      return title;
    }
  }
  const unique = `Food Fan ${used.size + 1}`;
  used.add(unique);
  return unique;
}

export function buildFallbackTitles(members: MealTitleMemberInput[]): MealTitleAssignment[] {
  const used = new Set<string>();
  return members.map((member) => {
    const items = member.items.map((item) => item.trim()).filter(Boolean);
    const title = items.length === 0
      ? (() => {
        const cheer = used.has('Table Cheer') ? 'Good Company' : 'Table Cheer';
        used.add(cheer);
        return cheer;
      })()
      : keywordTitle(items, used);
    return {
      id: member.id,
      name: member.name,
      title,
      items,
    };
  });
}

function normalizeMembers(raw: unknown): MealTitleMemberInput[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry, index) => {
    if (!entry || typeof entry !== 'object') return [];
    const member = entry as Record<string, unknown>;
    const id = typeof member.id === 'string' && member.id.trim()
      ? member.id.trim()
      : `member-${index + 1}`;
    const name = typeof member.name === 'string' && member.name.trim()
      ? member.name.trim()
      : `Guest ${index + 1}`;
    const items = Array.isArray(member.items)
      ? member.items.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
        .map((item) => item.trim().slice(0, 120))
      : [];
    return [{ id: id.slice(0, 80), name: name.slice(0, 80), items: items.slice(0, 40) }];
  }).slice(0, 20);
}

export function normalizeMealTitlesRequest(body: unknown): MealTitlesRequest {
  const data = body && typeof body === 'object' ? body as Record<string, unknown> : {};
  const members = normalizeMembers(data.members);
  return {
    groupName: typeof data.groupName === 'string' ? data.groupName.trim().slice(0, 100) : undefined,
    merchant: typeof data.merchant === 'string' ? data.merchant.trim().slice(0, 120) : undefined,
    members,
  };
}

function mergeModelTitles(
  members: MealTitleMemberInput[],
  rawTitles: unknown,
): MealTitleAssignment[] {
  const fallback = buildFallbackTitles(members);
  const byId = new Map<string, string>();
  if (Array.isArray(rawTitles)) {
    for (const entry of rawTitles) {
      if (!entry || typeof entry !== 'object') continue;
      const row = entry as Record<string, unknown>;
      if (typeof row.id !== 'string' || typeof row.title !== 'string') continue;
      byId.set(row.id, row.title);
    }
  }
  const used = new Set<string>();
  return fallback.map((entry) => {
    const proposed = byId.get(entry.id);
    const title = proposed ? sanitizeTitle(proposed, entry.title) : entry.title;
    const unique = used.has(title.toLowerCase())
      ? sanitizeTitle(`${title} Plus`, entry.title)
      : title;
    used.add(unique.toLowerCase());
    return { ...entry, title: unique };
  });
}

export function createFallbackTitleGenerator(): TitleGenerator {
  return {
    name: 'sample-fallback',
    async generate(input) {
      const members = normalizeMembers(input.members);
      return {
        titles: buildFallbackTitles(members),
        source: 'sample-fallback',
        usedFallback: true,
      };
    },
  };
}

export function createGeminiTitleGenerator(apiKey: string): TitleGenerator {
  const ai = new GoogleGenAI({ apiKey });
  return {
    name: GEMINI_TITLE_MODEL,
    async generate(input) {
      const members = normalizeMembers(input.members);
      if (!members.length) {
        return { titles: [], source: GEMINI_TITLE_MODEL, usedFallback: false };
      }

      const roster = members.map((member) => ({
        id: member.id,
        name: member.name,
        items: member.items.length ? member.items : ['(no food claimed)'],
      }));

      const response = await ai.models.generateContent({
        model: GEMINI_TITLE_MODEL,
        contents: [
          `${systemPrompt}

Group: ${input.groupName?.trim() || 'Dinner'}
Merchant: ${input.merchant?.trim() || 'Restaurant'}
Members JSON:
${JSON.stringify(roster, null, 2)}

Return a title for every member id.`,
        ],
        config: {
          temperature: 0.8,
          responseMimeType: 'application/json',
          responseSchema: titleSchema,
        },
      });

      const content = response.text?.trim();
      if (!content) throw new Error('Gemini returned empty meal titles.');
      const parsed = JSON.parse(content) as { titles?: unknown };
      return {
        titles: mergeModelTitles(members, parsed.titles),
        source: GEMINI_TITLE_MODEL,
        usedFallback: false,
      };
    },
  };
}

export function createTitleGenerator(env: NodeJS.ProcessEnv = process.env): TitleGenerator {
  const apiKey = env.GEMINI_API_KEY?.trim();
  if (!apiKey) return createFallbackTitleGenerator();
  return createGeminiTitleGenerator(apiKey);
}

export async function generateMealTitlesWithFallback(
  generator: TitleGenerator,
  input: MealTitlesRequest,
  log?: TitleLogger,
): Promise<MealTitlesResponse> {
  const members = normalizeMembers(input.members);
  const request: MealTitlesRequest = { ...input, members };

  if (generator.name === 'sample-fallback') {
    log?.warn({ generator: generator.name }, 'Meal titles using sample fallback (GEMINI_API_KEY missing).');
    return generator.generate(request);
  }

  try {
    const result = await generator.generate(request);
    log?.info({ generator: generator.name, count: result.titles.length }, 'Gemini meal titles succeeded');
    return result;
  } catch (error) {
    const errorDetail = formatGeminiError(error);
    log?.error(
      { generator: generator.name, err: error, errorDetail },
      'Gemini meal titles failed; using keyword fallback',
    );
    return {
      titles: buildFallbackTitles(members),
      source: 'sample-fallback',
      usedFallback: true,
    };
  }
}

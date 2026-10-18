import { describe, expect, it, vi } from 'vitest';
import {
  buildFallbackTitles,
  createTitleGenerator,
  generateMealTitlesWithFallback,
  normalizeMealTitlesRequest,
  normalizeGeneratedTitles,
  createGeminiTitleGenerator,
} from './generator.ts';

const { generateContent } = vi.hoisted(() => ({ generateContent: vi.fn() }));
vi.mock('@google/genai', async () => {
  const actual = await vi.importActual<typeof import('@google/genai')>('@google/genai');
  return { ...actual, GoogleGenAI: class { models = { generateContent }; } };
});

describe('meal title generator', () => {
  it('sends only opaque diner ids and food to Gemini and maps titles back correctly', async () => {
    generateContent.mockResolvedValueOnce({ text: JSON.stringify({ titles: [{ id: 'diner-1', title: 'Rice Royalty' }] }) });
    const result = await createGeminiTitleGenerator('test-key').generate({
      groupName: 'Private Friends', merchant: 'Private Restaurant',
      members: [{ id: 'private-user-id', name: 'Private Name', items: ['Rice (50% share)'] }],
    });
    expect(result.usedFallback).toBe(false);
    expect(result.titles[0]).toMatchObject({ id: 'private-user-id', title: 'Rice Royalty' });
    const call = generateContent.mock.calls.at(-1)?.[0];
    expect(JSON.stringify(call.contents)).not.toContain('Private');
    expect(JSON.stringify(call.contents)).not.toContain('private-user-id');
    expect(call.config.systemInstruction).toContain('untrusted food data');
  });
  it('replaces health judgments and instruction-like text and labels fallback use', () => {
    const members = [{ id: 'a', name: 'A', items: ['Salad'] }];
    for (const title of ['Healthiest Eater', 'Fat Loser', '<script>bad</script>', 'Vitamin Queen']) {
      const result = normalizeGeneratedTitles(members, [{ id: 'a', title }]);
      expect(result.usedFallback).toBe(true);
      expect(result.titles[0].title).toBe('Green Machine');
    }
  });

  it('rejects unknown or duplicate provider ids instead of assigning another diner a title', () => {
    const members = [{ id: 'a', name: 'A', items: ['Pizza'] }, { id: 'b', name: 'B', items: ['Rice'] }];
    expect(() => normalizeGeneratedTitles(members, [{ id: 'a', title: 'Pizza Diplomat' }, { id: 'a', title: 'Rice Royalty' }])).toThrow();
    expect(() => normalizeGeneratedTitles(members, [{ id: 'outside', title: 'Pizza Diplomat' }])).toThrow();
  });
  it('builds positive keyword titles from food items', () => {
    const titles = buildFallbackTitles([
      { id: 'you', name: 'Jamie', items: ['House salad', 'Sparkling water'] },
      { id: 'alex', name: 'Alex', items: ['Orange juice', 'Toast'] },
      { id: 'sam', name: 'Sam', items: ['Mushroom pasta'] },
    ]);
    expect(titles.map((entry) => entry.title)).toEqual([
      'Green Machine',
      'Citrus Sidekick',
      'Pasta Virtuoso',
    ]);
  });

  it('avoids duplicate fallback titles across members', () => {
    const titles = buildFallbackTitles([
      { id: 'a', name: 'A', items: ['Kale salad'] },
      { id: 'b', name: 'B', items: ['Spinach salad'] },
    ]);
    expect(new Set(titles.map((entry) => entry.title)).size).toBe(2);
  });

  it('normalizes request members and caps sizes', () => {
    const request = normalizeMealTitlesRequest({
      groupName: '  Friday dinner  ',
      members: [
        { id: 'you', name: 'Jamie', items: ['Pizza', '', 12] },
        { name: 'Nameless', items: ['Soup'] },
      ],
    });
    expect(request.groupName).toBe('Friday dinner');
    expect(request.members).toHaveLength(2);
    expect(request.members[0].items).toEqual(['Pizza']);
    expect(request.members[1].id).toBe('member-2');
  });

  it('uses sample fallback when Gemini is not configured', async () => {
    expect(createTitleGenerator({}).name).toBe('sample-fallback');
    const result = await createTitleGenerator({}).generate({
      members: [{ id: 'you', name: 'Jamie', items: ['House salad'] }],
    });
    expect(result.usedFallback).toBe(true);
    expect(result.titles[0].title).toBe('Green Machine');
  });

  it('falls back when the primary generator throws', async () => {
    const log = { warn: vi.fn(), error: vi.fn(), info: vi.fn() };
    const result = await generateMealTitlesWithFallback({
      name: 'gemini-3.8-flash',
      async generate() {
        throw new Error('quota');
      },
    }, {
      members: [{ id: 'you', name: 'Jamie', items: ['House salad'] }],
    }, log);
    expect(result.usedFallback).toBe(true);
    expect(result.titles[0].title).toBe('Green Machine');
    expect(log.error).toHaveBeenCalled();
  });
});

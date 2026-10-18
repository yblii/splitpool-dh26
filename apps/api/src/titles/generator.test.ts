import { describe, expect, it, vi } from 'vitest';
import {
  buildFallbackTitles,
  createTitleGenerator,
  generateMealTitlesWithFallback,
  normalizeMealTitlesRequest,
} from './generator.ts';

describe('meal title generator', () => {
  it('builds positive keyword titles from food items', () => {
    const titles = buildFallbackTitles([
      { id: 'you', name: 'Jamie', items: ['House salad', 'Sparkling water'] },
      { id: 'alex', name: 'Alex', items: ['Orange juice', 'Toast'] },
      { id: 'sam', name: 'Sam', items: ['Mushroom pasta'] },
    ]);
    expect(titles.map((entry) => entry.title)).toEqual([
      'Green Machine',
      'Vitamin C Warrior',
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

import { describe, expect, it, vi } from 'vitest';
import { buildApp } from '../app.ts';
import { createFallbackTitleGenerator } from './generator.ts';

describe('demo title endpoint', () => {
  it('returns labeled food-based fallback titles and disables caching', async () => {
    const app = await buildApp({ titleGenerator: createFallbackTitleGenerator(), logger: false });
    try {
      const response = await app.inject({ method: 'POST', url: '/api/v1/demo/meal-titles', payload: {
        members: [{ id: 'diner-1', name: 'Diner 1', items: ['Rice (100% share)'] }],
      } });
      expect(response.statusCode).toBe(200);
      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.json()).toMatchObject({ usedFallback: true, titles: [{ id: 'diner-1', title: 'Rice Royalty' }] });
    } finally { await app.close(); }
  });

  it('rejects malformed, duplicated, and oversized requests before calling AI', async () => {
    const generate = vi.fn();
    const app = await buildApp({ titleGenerator: { name: 'injected', generate }, logger: false });
    try {
      for (const payload of [
        { members: [] },
        { members: [{ id: 'a', name: 'A', items: [42] }] },
        { members: [{ id: 'a', name: 'A', items: [] }, { id: 'a', name: 'A', items: [] }] },
        { members: Array.from({ length: 21 }, (_, i) => ({ id: String(i), name: 'A', items: [] })) },
        { members: [{ id: 'a', name: 'A', items: [] }], cardNumber: 'never-send-this' },
      ]) {
        const response = await app.inject({ method: 'POST', url: '/api/v1/demo/meal-titles', payload });
        expect(response.statusCode).toBe(400);
      }
      expect(generate).not.toHaveBeenCalled();
    } finally { await app.close(); }
  });
});

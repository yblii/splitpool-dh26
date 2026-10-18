import { describe, expect, it } from 'vitest';
import { allocateCents, makeDemoBill, summarizeBill } from './index';

describe('demo bill accounting', () => {
  it('keeps unclaimed money separate from participant shares', () => {
    const summary = summarizeBill(makeDemoBill(), 'proportional');
    expect(summary.complete).toBe(false);
    expect(summary.shares.reduce((sum, share) => sum + share.items, 0)).toBe(4600);
    expect(summary.shares.every((share) => share.tax === 0 && share.tip === 0)).toBe(true);
  });

  it.each(['equal', 'proportional'] as const)('conserves the bill total in %s mode', (mode) => {
    const bill = makeDemoBill();
    bill.items[2].halves.you = 2;
    const summary = summarizeBill(bill, mode);
    expect(summary.complete).toBe(true);
    expect(summary.shares.reduce((sum, share) => sum + share.total, 0)).toBe(summary.total);
  });

  it('distributes indivisible cents without creating or losing money', () => {
    expect(allocateCents(100, [1, 1, 1])).toEqual([34, 33, 33]);
    expect(allocateCents(1, [1, 1, 1])).toEqual([1, 0, 0]);
    expect(allocateCents(0, [0, 0])).toEqual([0, 0]);
    expect(() => allocateCents(100, [0, 0])).toThrow();
  });

  it('rejects an overclaimed bill', () => {
    const bill = makeDemoBill();
    bill.items[0].halves.you = 2;
    expect(() => summarizeBill(bill, 'equal')).toThrow('overclaimed');
  });
});

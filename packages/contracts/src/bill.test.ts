import { describe, expect, it } from 'vitest';
import { allocateCents, defaultTipChoices, makeDemoBill, personItemLines, summarizeBill, type TipChoices, type TipPercent } from './index';

function percents(you: TipPercent, alex: TipPercent, sam: TipPercent): TipChoices {
  return {
    you: { kind: 'percent', percent: you },
    alex: { kind: 'percent', percent: alex },
    sam: { kind: 'percent', percent: sam },
  };
}

function claimedBill() {
  const bill = makeDemoBill();
  bill.items[2].halves.you = 2;
  return bill;
}

describe('demo bill accounting', () => {
  it('keeps unclaimed money separate from participant shares', () => {
    const summary = summarizeBill(makeDemoBill(), defaultTipChoices());
    expect(summary.complete).toBe(false);
    expect(summary.shares.reduce((sum, share) => sum + share.items, 0)).toBe(4600);
    expect(summary.shares.every((share) => share.tax === 0 && share.tip === 0)).toBe(true);
    expect(summary.total).toBe(7308);
  });

  it('prices an 18% tip from each person’s items and conserves the total', () => {
    const summary = summarizeBill(claimedBill(), defaultTipChoices());
    expect(summary.complete).toBe(true);
    expect(summary.shares.map((share) => share.tip)).toEqual([432, 216, 396]);
    expect(summary.shares.map((share) => share.tax)).toEqual([192, 96, 176]);
    expect(summary.tip).toBe(1044);
    expect(summary.shares.reduce((sum, share) => sum + share.total, 0)).toBe(summary.total);
    expect(summary.total).toBe(7308);
  });

  it('keeps different tip rates exact', () => {
    const summary = summarizeBill(claimedBill(), percents(15, 20, 25));
    expect(summary.shares.map((share) => share.tip)).toEqual([360, 240, 550]);
    expect(summary.tip).toBe(1150);
    expect(summary.total).toBe(summary.subtotal + summary.tax + summary.tip);
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
    expect(() => summarizeBill(bill, defaultTipChoices())).toThrow('overclaimed');
  });

  it('uses a custom tip amount and lists each person’s item dollars', () => {
    const choices = defaultTipChoices();
    choices.you = { kind: 'custom', cents: 500 };
    const bill = claimedBill();
    const summary = summarizeBill(bill, choices);
    expect(summary.shares.map((share) => share.tip)).toEqual([500, 216, 396]);
    expect(summary.shares.reduce((sum, share) => sum + share.total, 0)).toBe(summary.total);
    expect(personItemLines(bill, 'you').map((line) => line.cents)).toEqual([1200, 1200]);
    expect(personItemLines(bill, 'alex').map((line) => line.cents)).toEqual([1200]);
    expect(personItemLines(bill, 'sam').map((line) => line.cents)).toEqual([2200]);
  });
});

import { describe, expect, it } from 'vitest';
import { everyShareAuthorized, moneyInputToCents, summarizeWithPersonalTips, titleRequestForBill } from './demoWorkflow';

const bill = {
  items: [{ id: 'pizza', name: 'Pizza', cents: 2400, quantity: 1, shares: [
    { personId: 'private-user-id', mode: 'auto' as const }, { personId: 'other-private-id', mode: 'auto' as const },
  ] }],
  taxCents: 192, tipCents: 0, printedTotalCents: 2592,
};
const roster = ['private-user-id', 'other-private-id'];

describe('recording workflow', () => {
  it('adds an optional tip only to its payer without breaking printed-receipt reconciliation', () => {
    const summary = summarizeWithPersonalTips(bill, roster, 'proportional', { 'private-user-id': 315 });
    expect(summary.readyToFinalize).toBe(true);
    expect(summary.printedTotalCents).toBe(2592);
    expect(summary.computedTotalCents).toBe(2907);
    expect(summary.people.map(person => person.totalCents)).toEqual([1611, 1296]);
    expect(summary.people.reduce((sum, person) => sum + person.totalCents, 0)).toBe(summary.computedTotalCents);
  });

  it('does not make an incomplete bill ready by adding a personal tip', () => {
    const summary = summarizeWithPersonalTips({ ...bill, items: [{ ...bill.items[0], shares: [] }] }, roster, 'equal', { 'private-user-id': 100 });
    expect(summary.readyToFinalize).toBe(false);
    expect(everyShareAuthorized(summary, roster)).toBe(false);
  });

  it('requires every positive share before funding can be confirmed', () => {
    const summary = summarizeWithPersonalTips(bill, roster, 'proportional', {});
    expect(everyShareAuthorized(summary, [roster[0]])).toBe(false);
    expect(everyShareAuthorized(summary, roster)).toBe(true);
  });

  it('sends only opaque labels and claimed food portions to the title service', () => {
    const summary = summarizeWithPersonalTips(bill, roster, 'proportional', {});
    const request = titleRequestForBill(bill.items, summary, roster);
    expect(request.members[0]).toEqual({ id: 'diner-1', name: 'Diner 1', items: ['Pizza (50% share)'] });
    expect(JSON.stringify(request)).not.toContain('private');
    expect(JSON.stringify(request)).not.toContain('2400');
  });

  it('parses tips as exact cents and rejects signs, exponents, and excess precision', () => {
    expect(moneyInputToCents('3.15')).toBe(315);
    expect(moneyInputToCents('0')).toBe(0);
    for (const value of ['-1', '1e2', '1.001', '1000000.01', 'abc']) expect(moneyInputToCents(value)).toBeNull();
  });
});

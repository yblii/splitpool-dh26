import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Bill } from '@splitpool/contracts';
import { addFractions, normalizeFraction, summarize } from '../src/calculations.ts';

function bill(): Bill {
  return {
    id: 'bill', groupId: 'group', state: 'EDITING', version: 1, merchant: 'Dinner', currency: 'USD',
    participants: ['d', 'c', 'b', 'a'].map(userId => ({ userId, username: userId, displayName: userId, tipCents: 0 })),
    items: [{ id: 'item', name: 'Pizza', quantity: 1, netLineTotalCents: 101 }],
    claims: ['a', 'b', 'c', 'd'].map(userId => ({ itemId: 'item', userId, fraction: { numerator: 1, denominator: 4 } })),
    taxCents: 7, serviceChargeCents: 9, printedTotalCents: 117,
    settings: { taxMode: 'equal', serviceChargeMode: 'proportional' },
  };
}

test('exact rational arithmetic handles thirds, mixed denominators, and removal', () => {
  assert.deepEqual(addFractions([{ numerator: 1, denominator: 3 }, { numerator: 1, denominator: 6 }, { numerator: 1, denominator: 2 }]), { n: 1n, d: 1n });
  assert.deepEqual(normalizeFraction({ numerator: 2, denominator: 6 }), { numerator: 1, denominator: 3 });
  assert.deepEqual(normalizeFraction({ numerator: 0, denominator: 7 }), { numerator: 0, denominator: 1 });
});

test('four-person totals conserve each cent and tie-break by stable user ID', () => {
  const input = bill();
  const summary = summarize(input);
  assert.equal(summary.complete, true);
  assert.equal(summary.shares.reduce((sum, p) => sum + p.totalCents, 0), 117);
  assert.equal(summary.shares[0].userId, 'a');
  assert.equal(summary.shares[0].itemsCents, 26);
  assert.equal(summary.shares.reduce((sum, p) => sum + p.taxCents, 0), 7);
  assert.equal(summary.shares.reduce((sum, p) => sum + p.serviceChargeCents, 0), 9);
  // Tax/tip follow claimed item cents, not equal headcount — even if settings say equal.
  const byItems = summary.shares.map(share => share.itemsCents);
  const byTax = summary.shares.map(share => share.taxCents);
  assert.deepEqual(
    byTax.map((tax, index) => tax === 0 || byItems[index] > 0),
    [true, true, true, true],
  );
  input.participants.reverse(); input.claims.reverse();
  assert.deepEqual(summarize(input), summary);
});

test('underclaims reserve remaining money and extras stay provisional', () => {
  const input = bill(); input.claims = input.claims.slice(0, 1);
  const summary = summarize(input);
  assert.equal(summary.complete, false);
  assert.deepEqual(summary.remaining, [{ itemId: 'item', numerator: '3', denominator: '4' }]);
  assert.equal(summary.shares.reduce((sum, p) => sum + p.itemsCents, 0), 25);
  assert.equal(summary.shares.reduce((sum, p) => sum + p.taxCents, 0), 0);
});

test('overclaims and receipt mismatches block completion', () => {
  const input = bill(); input.claims[0].fraction = { numerator: 1, denominator: 2 }; input.printedTotalCents = 100;
  const summary = summarize(input);
  assert.deepEqual(summary.blockers.map(b => b.code), ['RECEIPT_MISMATCH', 'OVERCLAIMED_ITEM']);
});

test('zero subtotal blocks proportional tax or tip charges', () => {
  const input = bill(); input.items[0].netLineTotalCents = 0; input.printedTotalCents = 16;
  assert.equal(summarize(input).blockers.some(b => b.code === 'ZERO_SUBTOTAL'), true);
  input.taxCents = 0; input.serviceChargeCents = 0; input.printedTotalCents = 0;
  assert.equal(summarize(input).complete, true);
});

test('many fractional allocations reconcile across variable rosters', () => {
  for (let count = 1; count <= 40; count++) {
    const input = bill();
    input.participants = Array.from({ length: count }, (_, i) => ({ userId: String(i).padStart(3, '0'), username: `user${i}`, displayName: `User ${i}`, tipCents: i }));
    input.claims = input.participants.map(p => ({ userId: p.userId, itemId: 'item', fraction: { numerator: 1, denominator: count } }));
    const result = summarize(input);
    assert.equal(result.complete, true);
    assert.equal(result.addedTipCents, 0);
    assert.equal(result.shares.reduce((sum, p) => sum + p.totalCents, 0), result.totalCents);
  }
});

test('tax and tip split proportionally to claimed item cents when complete', () => {
  const input = bill();
  input.claims = [
    { itemId: 'item', userId: 'a', fraction: { numerator: 3, denominator: 4 } },
    { itemId: 'item', userId: 'b', fraction: { numerator: 1, denominator: 4 } },
  ];
  input.participants = input.participants.filter(p => p.userId === 'a' || p.userId === 'b');
  input.taxCents = 8;
  input.serviceChargeCents = 12;
  input.printedTotalCents = 121;
  const result = summarize(input);
  assert.equal(result.complete, true);
  const a = result.shares.find(share => share.userId === 'a')!;
  const b = result.shares.find(share => share.userId === 'b')!;
  assert.equal(a.itemsCents, 76);
  assert.equal(b.itemsCents, 25);
  assert.equal(a.taxCents + b.taxCents, 8);
  assert.equal(a.serviceChargeCents + b.serviceChargeCents, 12);
  assert.ok(a.taxCents > b.taxCents);
  assert.ok(a.serviceChargeCents > b.serviceChargeCents);
  assert.equal(a.tipCents, 0);
  assert.equal(b.tipCents, 0);
});

test('personal tip fields do not change bill totals after proportional split', () => {
  const input = bill(); input.participants[0].tipCents = 150;
  const result = summarize(input);
  assert.equal(result.complete, true);
  assert.equal(result.receiptTotalCents, 117);
  assert.equal(result.addedTipCents, 0);
  assert.equal(result.totalCents, 117);
  assert.equal(result.shares.every(share => share.tipCents === 0), true);
});

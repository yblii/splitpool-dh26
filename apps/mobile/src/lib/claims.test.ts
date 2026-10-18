import { describe, expect, it } from 'vitest';
import type { BillResponse } from '@splitpool/contracts';
import {
  basisPointsToFraction,
  billItemToSplitLine,
  claimJoinFraction,
  claimMinePlusRemaining,
  customizeClaimFraction,
  equalPayerShare,
  formatFraction,
  fractionLessOrEqual,
  fractionToBasisPoints,
  fractionsEqual,
  remainingAsFraction,
} from './claims';

function billFixture(overrides: Partial<BillResponse> = {}): BillResponse {
  return {
    id: 'bill',
    groupId: 'group',
    state: 'EDITING',
    version: 1,
    merchant: 'Cafe',
    currency: 'USD',
    participants: [
      { userId: 'you', username: 'you', displayName: 'You', tipCents: 0 },
      { userId: 'alex', username: 'alex', displayName: 'Alex', tipCents: 0 },
    ],
    items: [{ id: 'pizza', name: 'Pizza', quantity: 1, netLineTotalCents: 2000 }],
    claims: [],
    taxCents: 0,
    serviceChargeCents: 0,
    printedTotalCents: 2000,
    settings: { taxMode: 'proportional', serviceChargeMode: 'proportional' },
    summary: {
      subtotalCents: 2000,
      receiptTotalCents: 2000,
      addedTipCents: 0,
      totalCents: 2000,
      complete: false,
      blockers: [{ code: 'UNCLAIMED_ITEM', itemId: 'pizza' }],
      remaining: [{ itemId: 'pizza', numerator: '1', denominator: '1' }],
      shares: [
        { userId: 'you', itemsCents: 0, taxCents: 0, serviceChargeCents: 0, tipCents: 0, totalCents: 0 },
        { userId: 'alex', itemsCents: 0, taxCents: 0, serviceChargeCents: 0, tipCents: 0, totalCents: 0 },
      ],
    },
    ...overrides,
  };
}

describe('claim helpers', () => {
  it('formats and compares fractions', () => {
    expect(formatFraction({ numerator: 1, denominator: 3 })).toBe('1/3');
    expect(fractionsEqual({ numerator: 1, denominator: 2 }, { numerator: 2, denominator: 4 })).toBe(true);
    expect(equalPayerShare(4)).toEqual({ numerator: 1, denominator: 4 });
    expect(fractionLessOrEqual({ numerator: 1, denominator: 3 }, { numerator: 1, denominator: 2 })).toBe(true);
  });

  it('adds remaining onto an existing claim for take-rest', () => {
    expect(remainingAsFraction({ numerator: '1', denominator: '2' })).toEqual({
      numerator: 1,
      denominator: 2,
    });
    expect(claimMinePlusRemaining({ numerator: 1, denominator: 4 }, { numerator: '1', denominator: '4' }))
      .toEqual({ numerator: 1, denominator: 2 });
    expect(claimMinePlusRemaining(undefined, { numerator: '0', denominator: '1' }))
      .toEqual({ numerator: 0, denominator: 1 });
  });

  it('converts fractions to basis points and back', () => {
    expect(fractionToBasisPoints({ numerator: 1, denominator: 2 })).toBe(5000);
    expect(fractionToBasisPoints({ numerator: 1, denominator: 3 })).toBe(3333);
    expect(basisPointsToFraction(5000)).toEqual({ numerator: 1, denominator: 2 });
    expect(basisPointsToFraction(2500)).toEqual({ numerator: 1, denominator: 4 });
  });

  it('projects bill claims into split lines for the slider UI', () => {
    const bill = billFixture({
      claims: [{ itemId: 'pizza', userId: 'you', fraction: { numerator: 1, denominator: 2 } }],
      summary: {
        ...billFixture().summary,
        remaining: [{ itemId: 'pizza', numerator: '1', denominator: '2' }],
      },
    });
    expect(billItemToSplitLine(bill, bill.items[0]!)).toEqual({
      id: 'pizza',
      name: 'Pizza',
      cents: 2000,
      quantity: 1,
      shares: [{ personId: 'you', mode: 'custom', basisPoints: 5000 }],
    });
  });

  it('joins with an equal share when room remains', () => {
    const empty = billFixture();
    expect(claimJoinFraction(empty, 'pizza', 'you')).toEqual({ numerator: 1, denominator: 1 });

    const half = billFixture({
      claims: [{ itemId: 'pizza', userId: 'alex', fraction: { numerator: 1, denominator: 2 } }],
      summary: {
        ...billFixture().summary,
        remaining: [{ itemId: 'pizza', numerator: '1', denominator: '2' }],
      },
    });
    expect(claimJoinFraction(half, 'pizza', 'you')).toEqual({ numerator: 1, denominator: 2 });
  });

  it('refuses a join when the item is fully claimed', () => {
    const full = billFixture({
      claims: [{ itemId: 'pizza', userId: 'alex', fraction: { numerator: 1, denominator: 1 } }],
      summary: {
        ...billFixture().summary,
        remaining: [{ itemId: 'pizza', numerator: '0', denominator: '1' }],
        blockers: [],
      },
    });
    expect(claimJoinFraction(full, 'pizza', 'you')).toEqual({ error: 'This item is fully claimed.' });
  });

  it('validates custom percentages against open room', () => {
    const bill = billFixture({
      claims: [{ itemId: 'pizza', userId: 'alex', fraction: { numerator: 1, denominator: 2 } }],
      summary: {
        ...billFixture().summary,
        remaining: [{ itemId: 'pizza', numerator: '1', denominator: '2' }],
      },
    });
    expect(customizeClaimFraction(bill, bill.items[0]!, 'you', 5000)).toEqual({
      numerator: 1,
      denominator: 2,
    });
    expect(customizeClaimFraction(bill, bill.items[0]!, 'you', 6000)).toEqual({
      error: '50% is still open after the other custom shares.',
    });
  });
});

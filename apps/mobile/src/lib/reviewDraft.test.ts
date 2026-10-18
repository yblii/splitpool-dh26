import { describe, expect, it } from 'vitest';
import type { BillResponse } from '@splitpool/contracts';
import { reviewDraftFromBill } from './reviewDraft';

function sampleBill(): BillResponse {
  const host = '11111111-1111-4111-8111-111111111111';
  const friend = '22222222-2222-4222-8222-222222222222';
  return {
    id: '33333333-3333-4333-8333-333333333333',
    groupId: '44444444-4444-4444-8444-444444444444',
    state: 'EDITING',
    version: 2,
    merchant: 'The Little Table',
    currency: 'USD',
    participants: [
      { userId: host, username: 'host', displayName: 'Host', tipCents: 0 },
      { userId: friend, username: 'friend', displayName: 'Friend', tipCents: 0 },
    ],
    items: [
      { id: '55555555-5555-4555-8555-555555555555', name: 'Pizza', quantity: 1, netLineTotalCents: 1000 },
    ],
    claims: [
      {
        itemId: '55555555-5555-4555-8555-555555555555',
        userId: host,
        fraction: { numerator: 1, denominator: 2 },
      },
      {
        itemId: '55555555-5555-4555-8555-555555555555',
        userId: friend,
        fraction: { numerator: 1, denominator: 2 },
      },
    ],
    taxCents: 100,
    serviceChargeCents: 200,
    printedTotalCents: 1300,
    settings: { taxMode: 'proportional', serviceChargeMode: 'proportional' },
    summary: {
      subtotalCents: 1000,
      receiptTotalCents: 1300,
      addedTipCents: 0,
      totalCents: 1300,
      complete: true,
      blockers: [],
      remaining: [],
      shares: [
        {
          userId: host,
          itemsCents: 500,
          taxCents: 50,
          serviceChargeCents: 100,
          tipCents: 0,
          totalCents: 650,
        },
        {
          userId: friend,
          itemsCents: 500,
          taxCents: 50,
          serviceChargeCents: 100,
          tipCents: 0,
          totalCents: 650,
        },
      ],
    },
  };
}

describe('reviewDraftFromBill', () => {
  it('builds seats and item shares that conserve cents', () => {
    const draft = reviewDraftFromBill(sampleBill(), '11111111-1111-4111-8111-111111111111');
    expect(draft.merchantId).toBe('the-little-table');
    expect(draft.merchantTotalCents).toBe(1300);
    expect(draft.itemSubtotalCents).toBe(1000);
    expect(draft.seats.reduce((sum, seat) => sum + seat.merchantShareCents, 0)).toBe(1300);
    expect(draft.seats.every((seat) => seat.merchantShareCents === 650)).toBe(true);
    expect(draft.itemShares.reduce((sum, share) => sum + share.cents, 0)).toBe(1000);
    expect(draft.spenderUserId).toBe('11111111-1111-4111-8111-111111111111');
  });
});

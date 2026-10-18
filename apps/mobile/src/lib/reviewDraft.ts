import {
  allocateCents,
  type BillResponse,
  type ReviewDraft,
} from '@splitpool/contracts';

function merchantSlug(merchant: string): string {
  return merchant.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'merchant';
}

/** Convert an authoritative collaboration bill into a payment ReviewDraft. */
export function reviewDraftFromBill(
  bill: BillResponse,
  spenderUserId: string,
  feeScheduleVersion = 'demo-0',
): ReviewDraft {
  const seats = bill.summary.shares
    .filter((share) => share.totalCents > 0)
    .map((share) => ({
      seatId: share.userId,
      userId: share.userId,
      merchantShareCents: share.totalCents,
    }));

  if (!seats.some((seat) => seat.userId === spenderUserId)) {
    throw new Error('Spender must have a nonzero share on this bill.');
  }

  const itemShares = bill.items.flatMap((item) => {
    const claims = bill.claims.filter((claim) => claim.itemId === item.id);
    if (!claims.length) return [];
    const weights = claims.map((claim) => {
      // Scale fractions into integer weights for largest-remainder allocation.
      const scale = 1_000_000;
      return Math.max(0, Math.round((claim.fraction.numerator / claim.fraction.denominator) * scale));
    });
    const amounts = allocateCents(item.netLineTotalCents, weights);
    return claims.flatMap((claim, index) => (
      amounts[index] > 0
        ? [{ itemId: item.id, userId: claim.userId, cents: amounts[index] }]
        : []
    ));
  });

  return {
    spenderUserId,
    merchantId: merchantSlug(bill.merchant),
    merchantTotalCents: bill.summary.totalCents,
    itemSubtotalCents: bill.summary.subtotalCents,
    feeScheduleVersion,
    seats,
    itemShares,
  };
}

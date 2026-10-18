import {
  FULL_SPLIT_BASIS_POINTS,
  resolveItemSplit,
  setCustomShare,
  type BillItem,
  type BillResponse,
  type Fraction,
  type ItemClaim,
  type ItemResolution,
  type SplitLine,
} from '@splitpool/contracts';

function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y) {
    const next = x % y;
    x = y;
    y = next;
  }
  return x || 1;
}

export function normalizeFraction(fraction: Fraction): Fraction {
  if (fraction.numerator === 0) return { numerator: 0, denominator: 1 };
  const divisor = gcd(fraction.numerator, fraction.denominator);
  return {
    numerator: fraction.numerator / divisor,
    denominator: fraction.denominator / divisor,
  };
}

export function formatFraction(fraction: Fraction): string {
  const normalized = normalizeFraction(fraction);
  return `${normalized.numerator}/${normalized.denominator}`;
}

export function claimForUser(claims: ItemClaim[], itemId: string, userId: string): ItemClaim | undefined {
  return claims.find((claim) => claim.itemId === itemId && claim.userId === userId);
}

export function remainingForItem(bill: BillResponse, itemId: string) {
  return bill.summary.remaining.find((entry) => entry.itemId === itemId)
    ?? { itemId, numerator: '0', denominator: '1' };
}

/** Equal share among current payers (1/n). */
export function equalPayerShare(payerCount: number): Fraction {
  const denominator = Math.max(1, payerCount);
  return { numerator: 1, denominator };
}

export function isZeroFraction(fraction: Fraction) {
  return fraction.numerator === 0;
}

export function fractionsEqual(a: Fraction, b: Fraction) {
  const left = normalizeFraction(a);
  const right = normalizeFraction(b);
  return left.numerator === right.numerator && left.denominator === right.denominator;
}

/** Compare a/b <= c/d without floating point. */
export function fractionLessOrEqual(a: Fraction, b: Fraction) {
  return BigInt(a.numerator) * BigInt(b.denominator) <= BigInt(b.numerator) * BigInt(a.denominator);
}

/** Parse remaining strings into a claimable Fraction when they fit JS safe integers. */
export function remainingAsFraction(remaining: { numerator: string; denominator: string }): Fraction | null {
  const numerator = Number(remaining.numerator);
  const denominator = Number(remaining.denominator);
  if (!Number.isSafeInteger(numerator) || !Number.isSafeInteger(denominator) || denominator < 1) return null;
  if (numerator <= 0) return { numerator: 0, denominator: 1 };
  return { numerator, denominator };
}

/**
 * Claim "everything left for me": my current claim + remaining unclaimed.
 * Falls back to null when remaining is too large for Number.
 */
export function claimMinePlusRemaining(
  mine: Fraction | undefined,
  remaining: { numerator: string; denominator: string },
): Fraction | null {
  const rest = remainingAsFraction(remaining);
  if (!rest) return null;
  if (!mine || mine.numerator === 0) return rest.numerator === 0 ? { numerator: 0, denominator: 1 } : rest;
  // a/b + c/d = (ad+bc)/(bd)
  const numerator = mine.numerator * rest.denominator + rest.numerator * mine.denominator;
  const denominator = mine.denominator * rest.denominator;
  if (!Number.isSafeInteger(numerator) || !Number.isSafeInteger(denominator) || denominator > 1_000_000) {
    return null;
  }
  return normalizeFraction({ numerator, denominator });
}

/** Map a stored fraction onto the demo slider's 10_000 basis-point scale. */
export function fractionToBasisPoints(fraction: Fraction): number {
  const normalized = normalizeFraction(fraction);
  if (normalized.numerator === 0) return 0;
  return Math.round((normalized.numerator * FULL_SPLIT_BASIS_POINTS) / normalized.denominator);
}

/** Map slider basis points back to an API fraction. */
export function basisPointsToFraction(basisPoints: number): Fraction {
  return normalizeFraction({ numerator: basisPoints, denominator: FULL_SPLIT_BASIS_POINTS });
}

/**
 * Project live bill claims into a SplitLine so ReceiptItemCard / resolveItemSplit work.
 * Every stored claim becomes a custom share so displayed % matches the server.
 */
export function billItemToSplitLine(bill: BillResponse, item: BillItem): SplitLine {
  const claims = bill.claims.filter((claim) => claim.itemId === item.id && claim.fraction.numerator > 0);
  return {
    id: item.id,
    name: item.name,
    cents: item.netLineTotalCents,
    quantity: item.quantity,
    shares: claims.map((claim) => ({
      personId: claim.userId,
      mode: 'custom' as const,
      basisPoints: fractionToBasisPoints(claim.fraction),
    })),
  };
}

export function resolveBillItem(bill: BillResponse, item: BillItem): ItemResolution {
  const roster = bill.participants.map((participant) => participant.userId);
  return resolveItemSplit(billItemToSplitLine(bill, item), roster);
}

/**
 * Tap-to-claim: prefer an equal share among current claimants + you when it fits
 * in what you can still take; otherwise take the remaining open portion.
 */
export function claimJoinFraction(
  bill: BillResponse,
  itemId: string,
  userId: string,
): Fraction | { error: string } {
  const mine = claimForUser(bill.claims, itemId, userId)?.fraction;
  const available = claimMinePlusRemaining(mine, remainingForItem(bill, itemId));
  if (!available || available.numerator === 0) {
    return { error: 'This item is fully claimed.' };
  }
  const others = bill.claims.filter(
    (claim) => claim.itemId === itemId && claim.userId !== userId && claim.fraction.numerator > 0,
  ).length;
  const equal = normalizeFraction({ numerator: 1, denominator: others + 1 });
  if (fractionLessOrEqual(equal, available)) return equal;
  return available;
}

/**
 * Validate a custom % against other claims on the line, then return the API fraction.
 */
export function customizeClaimFraction(
  bill: BillResponse,
  item: BillItem,
  userId: string,
  basisPoints: number,
): Fraction | { error: string } {
  const line = billItemToSplitLine(bill, item);
  const result = setCustomShare(line, userId, basisPoints);
  if (result.error) return { error: result.error };
  const fraction = basisPointsToFraction(basisPoints);
  const mine = claimForUser(bill.claims, item.id, userId)?.fraction;
  const available = claimMinePlusRemaining(mine, remainingForItem(bill, item.id));
  if (!available) return { error: 'Could not read the open share for this item.' };
  if (!fractionLessOrEqual(fraction, available)) {
    return { error: 'That percentage is more than what is still open on this item.' };
  }
  return fraction;
}

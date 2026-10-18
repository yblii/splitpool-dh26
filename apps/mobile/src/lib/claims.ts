import type { BillResponse, Fraction, ItemClaim } from '@splitpool/contracts';

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
  return a.numerator === b.numerator && a.denominator === b.denominator;
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

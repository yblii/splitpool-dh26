import type { Bill, BillSummary, Fraction } from '@splitpool/contracts';

type Rational = { n: bigint; d: bigint };
const gcd = (a: bigint, b: bigint): bigint => b === 0n ? a : gcd(b, a % b);
function rational(n: bigint, d: bigint): Rational {
  const divisor = gcd(n < 0n ? -n : n, d);
  return { n: n / divisor, d: d / divisor };
}
export function addFractions(values: Fraction[]): Rational {
  return values.reduce((a, b) => rational(a.n * BigInt(b.denominator) + BigInt(b.numerator) * a.d,
    a.d * BigInt(b.denominator)), { n: 0n, d: 1n });
}
export function normalizeFraction(fraction: Fraction): Fraction {
  const f = rational(BigInt(fraction.numerator), BigInt(fraction.denominator));
  return { numerator: Number(f.n), denominator: Number(f.d) };
}

// Allocates exact rational weights; IDs provide stable tie-breaking independent of request order.
function allocate(total: number, entries: { id: string; weight: Rational }[]): Map<string, number> {
  const sum = entries.reduce((a, b) => rational(a.n * b.weight.d + b.weight.n * a.d, a.d * b.weight.d), { n: 0n, d: 1n });
  if (sum.n === 0n) return new Map(entries.map(({ id }) => [id, 0]));
  const rows = entries.map(({ id, weight }) => {
    const n = BigInt(total) * weight.n * sum.d;
    const d = weight.d * sum.n;
    return { id, cents: Number(n / d), remainder: n % d, denominator: d };
  });
  let left = total - rows.reduce((sum, row) => sum + row.cents, 0);
  rows.sort((a, b) => {
    const comparison = a.remainder * b.denominator - b.remainder * a.denominator;
    return comparison === 0n ? (a.id < b.id ? -1 : a.id > b.id ? 1 : 0) : comparison > 0n ? -1 : 1;
  });
  for (const row of rows) if (left-- > 0) row.cents++;
  return new Map(rows.map(({ id, cents }) => [id, cents]));
}

export function summarize(bill: Bill): BillSummary {
  const blockers: BillSummary['blockers'] = [];
  const remaining: BillSummary['remaining'] = [];
  const ids = bill.participants.map(p => p.userId).sort();
  const itemShares = new Map(ids.map(id => [id, 0]));
  const subtotalCents = bill.items.reduce((sum, item) => sum + item.netLineTotalCents, 0);
  const receiptTotalCents = subtotalCents + bill.taxCents + bill.serviceChargeCents;
  if (!ids.length) blockers.push({ code: 'NO_PAYERS' });
  if (!bill.items.length) blockers.push({ code: 'NO_ITEMS' });
  if (bill.printedTotalCents === null) blockers.push({ code: 'RECEIPT_TOTAL_MISSING' });
  else if (receiptTotalCents !== bill.printedTotalCents) blockers.push({ code: 'RECEIPT_MISMATCH' });

  for (const item of bill.items) {
    const claims = bill.claims.filter(c => c.itemId === item.id);
    const sum = addFractions(claims.map(c => c.fraction));
    if (sum.n > sum.d) { blockers.push({ code: 'OVERCLAIMED_ITEM', itemId: item.id }); continue; }
    const rest = rational(sum.d - sum.n, sum.d);
    remaining.push({ itemId: item.id, numerator: String(rest.n), denominator: String(rest.d) });
    if (rest.n > 0n) blockers.push({ code: 'UNCLAIMED_ITEM', itemId: item.id });
    const entries = claims.map(c => ({ id: c.userId, weight: { n: BigInt(c.fraction.numerator), d: BigInt(c.fraction.denominator) } }));
    // Reserve unclaimed cents rather than distributing them among existing claimants.
    if (rest.n > 0n) entries.push({ id: '~unclaimed', weight: rest });
    const amounts = allocate(item.netLineTotalCents, entries);
    for (const id of ids) itemShares.set(id, itemShares.get(id)! + (amounts.get(id) ?? 0));
  }
  // Tax and receipt tip/service are always split by claimed item cents once the bill is complete.
  // Personal per-payer tips are not part of the bill total.
  const extras = [bill.taxCents, bill.serviceChargeCents];
  if (subtotalCents === 0 && extras.some(amount => amount > 0)) blockers.push({ code: 'ZERO_SUBTOTAL' });
  const complete = blockers.length === 0;
  const [tax, service] = extras.map(amount => allocate(complete ? amount : 0, ids.map(id => ({
    id, weight: { n: BigInt(itemShares.get(id)!), d: 1n },
  }))));
  return {
    subtotalCents, receiptTotalCents, addedTipCents: 0, totalCents: receiptTotalCents,
    complete, blockers, remaining,
    shares: ids.map(userId => ({
      userId,
      itemsCents: itemShares.get(userId)!,
      taxCents: tax.get(userId) ?? 0,
      serviceChargeCents: service.get(userId) ?? 0,
      tipCents: 0,
      totalCents: itemShares.get(userId)! + (tax.get(userId) ?? 0) + (service.get(userId) ?? 0),
    })),
  };
}

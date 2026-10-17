export type PersonId = 'you' | 'alex' | 'sam';
export type SplitMode = 'proportional' | 'equal';

// Starter demo supports whole and half claims. General rational claims are a future API feature.
export type DemoItem = {
  id: string;
  name: string;
  cents: number;
  halves: Record<PersonId, number>;
};
export type DemoBill = {
  groupName: string;
  merchant: string;
  items: DemoItem[];
  taxCents: number;
  tipCents: number;
};
export const people: { id: PersonId; name: string; initial: string }[] = [
  { id: 'you', name: 'You', initial: 'Y' },
  { id: 'alex', name: 'Alex', initial: 'A' },
  { id: 'sam', name: 'Sam', initial: 'S' },
];

export function makeDemoBill(): DemoBill {
  return {
    groupName: 'Friday dinner',
    merchant: 'The Little Table',
    items: [
      { id: 'pizza', name: 'Margherita pizza', cents: 2400, halves: { you: 1, alex: 1, sam: 0 } },
      { id: 'pasta', name: 'Mushroom pasta', cents: 2200, halves: { you: 0, alex: 0, sam: 2 } },
      { id: 'salad', name: 'House salad', cents: 1200, halves: { you: 0, alex: 0, sam: 0 } },
    ],
    taxCents: 464,
    tipCents: 1044,
  };
}

export function formatMoney(cents: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}

export function claimedHalves(item: DemoItem): number {
  return people.reduce((sum, person) => sum + item.halves[person.id], 0);
}

// Largest-remainder allocation conserves every cent and resolves ties in roster order.
export function allocateCents(total: number, weights: number[]): number[] {
  if (!Number.isSafeInteger(total) || total < 0 || weights.length === 0 ||
      weights.some((weight) => !Number.isSafeInteger(weight) || weight < 0)) {
    throw new Error('Expected nonnegative integer cents and weights.');
  }
  const sum = weights.reduce((a, b) => a + b, 0);
  if (!sum) {
    if (total === 0) return weights.map(() => 0);
    throw new Error('Cannot allocate money without any shares.');
  }
  const exact = weights.map((weight) => BigInt(total) * BigInt(weight));
  const denominator = BigInt(sum);
  const allocated = exact.map((amount) => Number(amount / denominator));
  const order = exact.map((amount, index) => ({ index, remainder: amount % denominator }))
    .sort((a, b) => a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1);
  const remaining = total - allocated.reduce((a, b) => a + b, 0);
  for (let i = 0; i < remaining; i++) allocated[order[i].index] += 1;
  return allocated;
}

export function summarizeBill(bill: DemoBill, mode: SplitMode) {
  const subtotal = bill.items.reduce((sum, item) => sum + item.cents, 0);
  const itemShares = people.map(() => 0);
  for (const item of bill.items) {
    if (claimedHalves(item) > 2) throw new Error('Item is overclaimed.');
    // Include an unclaimed bucket so provisional shares never absorb unclaimed amounts.
    const weights = [...people.map((person) => item.halves[person.id]), 2 - claimedHalves(item)];
    const amounts = allocateCents(item.cents, weights);
    people.forEach((_, index) => { itemShares[index] += amounts[index]; });
  }
  const complete = bill.items.length > 0 && bill.items.every((item) => claimedHalves(item) === 2);
  // Extras stay provisional until every item has been allocated.
  const weights = mode === 'equal' ? people.map(() => 1) : itemShares;
  const tax = complete ? allocateCents(bill.taxCents, weights) : people.map(() => 0);
  const tip = complete ? allocateCents(bill.tipCents, weights) : people.map(() => 0);
  return {
    subtotal,
    total: subtotal + bill.taxCents + bill.tipCents,
    complete,
    unclaimed: bill.items.filter((item) => claimedHalves(item) !== 2).length,
    shares: people.map((person, index) => ({
      ...person,
      items: itemShares[index], tax: tax[index], tip: tip[index],
      total: itemShares[index] + tax[index] + tip[index],
    })),
  };
}

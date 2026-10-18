import { allocateCents } from './allocate';

export type PersonId = 'you' | 'alex' | 'sam';
export const tipPercents = [15, 18, 20, 25] as const;
export type TipPercent = (typeof tipPercents)[number];
export type TipChoice = { kind: 'percent'; percent: TipPercent } | { kind: 'custom'; cents: number };
export type TipChoices = Record<PersonId, TipChoice>;

export function defaultTipChoices(): TipChoices {
  return {
    you: { kind: 'percent', percent: 18 },
    alex: { kind: 'percent', percent: 18 },
    sam: { kind: 'percent', percent: 18 },
  };
}

export function personItemLines(bill: DemoBill, personId: PersonId) {
  const index = people.findIndex((entry) => entry.id === personId);
  return bill.items.flatMap((item) => {
    const weights = [...people.map((entry) => item.halves[entry.id]), 2 - claimedHalves(item)];
    const cents = allocateCents(item.cents, weights)[index];
    return cents > 0 ? [{ id: item.id, name: item.name, cents }] : [];
  });
}

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

export const demoMethods = [
  { id: 'apple-pay', label: 'Apple Pay', last4: null },
  { id: 'google-pay', label: 'Google Pay', last4: null },
  { id: 'link', label: 'Link', last4: null },
  { id: 'visa', label: 'Visa', last4: '4242' },
  { id: 'visa-debit', label: 'Visa Debit', last4: '5556' },
  { id: 'mastercard', label: 'Mastercard', last4: '4444' },
] as const;
export type DemoMethodId = (typeof demoMethods)[number]['id'];

export function isCardWallet(id: DemoMethodId) {
  return demoMethods.find((entry) => entry.id === id)?.last4 == null;
}

export function demoMethodLabel(id: DemoMethodId) {
  const method = demoMethods.find((entry) => entry.id === id);
  if (!method) throw new Error('Unknown demo payment method.');
  if (!method.last4) return method.label;
  return `Demo ${method.label} ···· ${method.last4}`;
}

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

function tipForItems(items: number, choice: TipChoice): number {
  if (choice.kind === 'percent') return Math.round(items * choice.percent / 100);
  if (!Number.isSafeInteger(choice.cents) || choice.cents < 0) throw new Error('Custom tip must be nonnegative cents.');
  return choice.cents;
}

export function claimedHalves(item: DemoItem): number {
  return people.reduce((sum, person) => sum + item.halves[person.id], 0);
}

export { allocateCents } from './allocate';

export function summarizeBill(bill: DemoBill, choices: TipChoices) {
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
  // Tax follows item shares. Tip is each person's percent of their own pretax items.
  const tax = complete ? allocateCents(bill.taxCents, itemShares) : people.map(() => 0);
  const tip = complete
    ? people.map((person, index) => tipForItems(itemShares[index], choices[person.id]))
    : people.map(() => 0);
  const tipTotal = tip.reduce((sum, cents) => sum + cents, 0);
  return {
    subtotal,
    tax: bill.taxCents,
    tip: complete ? tipTotal : bill.tipCents,
    total: subtotal + bill.taxCents + (complete ? tipTotal : bill.tipCents),
    complete,
    unclaimed: bill.items.filter((item) => claimedHalves(item) !== 2).length,
    shares: people.map((person, index) => ({
      ...person,
      items: itemShares[index], tax: tax[index], tip: tip[index],
      total: itemShares[index] + tax[index] + tip[index],
    })),
  };
}

export * from './payment';
export * from './ledger';

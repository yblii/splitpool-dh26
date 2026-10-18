import { allocateCents } from './allocate';

export type * from './api.ts';
export { allocateCents };

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

export type ReceiptWarning =
  | 'tip_ambiguous'
  | 'total_mismatch'
  | 'missing_items'
  | 'provider_unavailable'
  | 'parse_failed';

export type ExtractedReceiptItem = {
  clientId: string;
  name: string;
  quantity: number;
  netLineTotalCents: number;
  confidence?: number;
};

/** Draft OCR / vision output. Always host-reviewed before use. */
export type ExtractedReceipt = {
  schemaVersion: 1;
  source: string;
  merchant: string;
  currency: 'USD';
  items: ExtractedReceiptItem[];
  taxCents: number;
  tipCents: number;
  serviceChargeCents: number;
  discountCents: number;
  printedTotalCents: number;
  warnings: ReceiptWarning[];
};

export type VerifiedReceiptItem = {
  id: string;
  name: string;
  quantity: number;
  netLineTotalCents: number;
};

/** Host-confirmed receipt used to populate the local demo bill. */
export type VerifiedReceipt = {
  schemaVersion: 1;
  status: 'verified';
  merchant: string;
  currency: 'USD';
  items: VerifiedReceiptItem[];
  taxCents: number;
  tipCents: number;
  serviceChargeCents: number;
  discountCents: number;
  printedTotalCents: number;
  reconciliation: {
    itemsSubtotalCents: number;
    computedTotalCents: number;
    matchesPrintedTotal: boolean;
  };
};

export type ReceiptDraftInput = {
  merchant: string;
  items: { id?: string; name: string; quantity: number; netLineTotalCents: number }[];
  taxCents: number;
  tipCents: number;
  serviceChargeCents?: number;
  discountCents?: number;
  printedTotalCents: number;
};

function emptyHalves(): Record<PersonId, number> {
  return Object.fromEntries(people.map((person) => [person.id, 0])) as Record<PersonId, number>;
}

export function itemsSubtotalCents(items: { netLineTotalCents: number }[]): number {
  return items.reduce((sum, item) => sum + item.netLineTotalCents, 0);
}

export function computedReceiptTotalCents(input: {
  items: { netLineTotalCents: number }[];
  taxCents: number;
  tipCents: number;
  serviceChargeCents?: number;
  discountCents?: number;
}): number {
  return itemsSubtotalCents(input.items)
    + input.taxCents
    + input.tipCents
    + (input.serviceChargeCents ?? 0)
    - (input.discountCents ?? 0);
}

export function reconcileReceipt(input: ReceiptDraftInput): VerifiedReceipt['reconciliation'] {
  const itemsSubtotal = itemsSubtotalCents(input.items);
  const computedTotalCents = computedReceiptTotalCents(input);
  return {
    itemsSubtotalCents: itemsSubtotal,
    computedTotalCents,
    matchesPrintedTotal: computedTotalCents === input.printedTotalCents,
  };
}

export function makeSampleExtractedReceipt(): ExtractedReceipt {
  const bill = makeDemoBill();
  const itemsSubtotal = bill.items.reduce((sum, item) => sum + item.cents, 0);
  return {
    schemaVersion: 1,
    source: 'sample-fallback',
    merchant: bill.merchant,
    currency: 'USD',
    items: bill.items.map((item) => ({
      clientId: item.id,
      name: item.name,
      quantity: 1,
      netLineTotalCents: item.cents,
      confidence: 1,
    })),
    taxCents: bill.taxCents,
    tipCents: bill.tipCents,
    serviceChargeCents: 0,
    discountCents: 0,
    printedTotalCents: itemsSubtotal + bill.taxCents + bill.tipCents,
    warnings: ['provider_unavailable'],
  };
}

export function extractedToEditable(draft: ExtractedReceipt): ReceiptDraftInput {
  return {
    merchant: draft.merchant,
    items: draft.items.map((item) => ({
      id: item.clientId,
      name: item.name,
      quantity: item.quantity,
      netLineTotalCents: item.netLineTotalCents,
    })),
    taxCents: draft.taxCents,
    tipCents: draft.tipCents,
    serviceChargeCents: draft.serviceChargeCents,
    discountCents: draft.discountCents,
    printedTotalCents: draft.printedTotalCents,
  };
}

export function verifyReceipt(input: ReceiptDraftInput): VerifiedReceipt {
  const reconciliation = reconcileReceipt(input);
  return {
    schemaVersion: 1,
    status: 'verified',
    merchant: input.merchant.trim() || 'Merchant',
    currency: 'USD',
    items: input.items.map((item, index) => ({
      id: (item.id?.trim() || `item-${index + 1}`).replace(/\s+/g, '-').toLowerCase(),
      name: item.name.trim() || `Item ${index + 1}`,
      quantity: Number.isSafeInteger(item.quantity) && item.quantity > 0 ? item.quantity : 1,
      netLineTotalCents: Math.max(0, Math.round(item.netLineTotalCents)),
    })),
    taxCents: Math.max(0, Math.round(input.taxCents)),
    tipCents: Math.max(0, Math.round(input.tipCents)),
    serviceChargeCents: Math.max(0, Math.round(input.serviceChargeCents ?? 0)),
    discountCents: Math.max(0, Math.round(input.discountCents ?? 0)),
    printedTotalCents: Math.max(0, Math.round(input.printedTotalCents)),
    reconciliation,
  };
}

/** Map a verified receipt into the in-memory demo bill (claims reset). */
export function demoBillFromVerifiedReceipt(
  receipt: VerifiedReceipt,
  groupName = 'Friday dinner',
): DemoBill {
  const items: DemoItem[] = receipt.items.map((item, index) => ({
    id: item.id || `item-${index + 1}`,
    name: item.name,
    cents: item.netLineTotalCents,
    halves: emptyHalves(),
  }));
  return {
    groupName,
    merchant: receipt.merchant,
    items,
    taxCents: receipt.taxCents,
    tipCents: receipt.tipCents,
  };
}

export * from './payment';
export * from './ledger';

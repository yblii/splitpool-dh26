import { makeDemoBill, people, type DemoBill, type DemoItem, type PersonId } from './bill.js';

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

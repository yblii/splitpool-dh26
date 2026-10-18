import { describe, expect, it } from 'vitest';
import {
  demoBillFromVerifiedReceipt,
  makeSampleExtractedReceipt,
  reconcileReceipt,
  verifyReceipt,
} from './index';

describe('receipt contracts', () => {
  it('builds a sample draft that reconciles to the demo bill totals', () => {
    const draft = makeSampleExtractedReceipt();
    expect(draft.items).toHaveLength(3);
    const verified = verifyReceipt({
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
    });
    expect(verified.reconciliation.matchesPrintedTotal).toBe(true);
    // Demo items 2400+2200+1200 + tax 464 + tip 1044
    expect(verified.reconciliation.computedTotalCents).toBe(7308);
  });

  it('flags total mismatches and maps verified receipts into a claimable demo bill', () => {
    const reconciliation = reconcileReceipt({
      merchant: 'Cafe',
      items: [{ name: 'Coffee', quantity: 1, netLineTotalCents: 500 }],
      taxCents: 40,
      tipCents: 0,
      printedTotalCents: 999,
    });
    expect(reconciliation.matchesPrintedTotal).toBe(false);

    const verified = verifyReceipt({
      merchant: 'Cafe',
      items: [{ id: 'coffee', name: 'Coffee', quantity: 2, netLineTotalCents: 500 }],
      taxCents: 40,
      tipCents: 60,
      printedTotalCents: 600,
    });
    const bill = demoBillFromVerifiedReceipt(verified, 'Brunch');
    expect(bill.groupName).toBe('Brunch');
    expect(bill.items[0]).toMatchObject({
      id: 'coffee',
      name: 'Coffee',
      cents: 500,
      halves: { you: 0, alex: 0, sam: 0 },
    });
    expect(bill.taxCents).toBe(40);
    expect(bill.tipCents).toBe(60);
  });
});

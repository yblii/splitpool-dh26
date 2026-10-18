import { describe, expect, it } from 'vitest';
import {
  formatBasisPoints,
  joinSplit,
  leaveSplit,
  makeSampleSplitItems,
  makeSplitDemoReceipt,
  percentInputToBasisPoints,
  resetSplitToEqual,
  resolveItemSplit,
  setCustomShare,
  splitBasisPoints,
  splitLinesFromVerified,
  summarizeSplitBill,
  verifyReceipt,
  type SplitLine,
} from './index';

const roster = ['you', 'alex', 'sam'] as const;

function pizza(shares: SplitLine['shares'] = []): SplitLine {
  return { id: 'pizza', name: 'Pizza', cents: 3000, quantity: 1, shares };
}

function claimAll(line: SplitLine, people: readonly string[]) {
  return people.reduce((current, personId) => joinSplit(current, personId), line);
}

describe('percentage splits', () => {
  it('formats basis points and parses percentage input exactly', () => {
    expect(formatBasisPoints(10_000)).toBe('100%');
    expect(formatBasisPoints(5_000)).toBe('50%');
    expect(formatBasisPoints(3_333)).toBe('33.33%');
    expect(formatBasisPoints(3_334)).toBe('33.34%');
    expect(percentInputToBasisPoints('33.33')).toEqual({ basisPoints: 3333 });
    expect(percentInputToBasisPoints('50')).toEqual({ basisPoints: 5000 });
    expect(percentInputToBasisPoints('100.01').error).toBeTruthy();
    expect(splitBasisPoints(10_000, 3)).toEqual([3333, 3333, 3334]);
    expect(splitBasisPoints(10_000, 4)).toEqual([2500, 2500, 2500, 2500]);
  });

  it('gives the first person the whole item and splits evenly as more people join', () => {
    const alone = resolveItemSplit(claimAll(pizza(), ['you']), roster);
    expect(alone.portions).toEqual([{ personId: 'you', mode: 'auto', basisPoints: 10_000, cents: 3000 }]);

    const pair = resolveItemSplit(claimAll(pizza(), ['you', 'alex']), roster);
    expect(pair.portions.map((portion) => portion.cents)).toEqual([1500, 1500]);
    expect(pair.portions.map((portion) => portion.basisPoints)).toEqual([5000, 5000]);

    const trio = resolveItemSplit(claimAll(pizza(), roster), roster);
    expect(trio.status).toBe('complete');
    expect(trio.portions.map((portion) => portion.basisPoints)).toEqual([3333, 3333, 3334]);
    expect(trio.portions.map((portion) => portion.cents)).toEqual([1000, 1000, 1000]);

    const four = resolveItemSplit(claimAll(pizza(), ['you', 'alex', 'sam', 'riley']), ['you', 'alex', 'sam', 'riley']);
    expect(four.portions.map((portion) => portion.basisPoints)).toEqual([2500, 2500, 2500, 2500]);
    expect(four.portions.map((portion) => portion.cents)).toEqual([750, 750, 750, 750]);
  });

  it('keeps custom percentages fixed and splits the remainder across automatic shares', () => {
    let line = claimAll(pizza(), roster);
    line = setCustomShare(line, 'you', 5_000).line;
    let resolution = resolveItemSplit(line, roster);
    expect(resolution.portions.map((portion) => [portion.personId, portion.mode, portion.basisPoints, portion.cents])).toEqual([
      ['you', 'custom', 5000, 1500],
      ['alex', 'auto', 2500, 750],
      ['sam', 'auto', 2500, 750],
    ]);

    line = setCustomShare(line, 'alex', 3_000).line;
    resolution = resolveItemSplit(line, roster);
    expect(resolution.portions.map((portion) => [portion.basisPoints, portion.cents])).toEqual([
      [5000, 1500],
      [3000, 900],
      [2000, 600],
    ]);
    expect(resolution.portions[2]?.mode).toBe('auto');
  });

  it('preserves custom shares when someone new joins and when someone leaves', () => {
    let line = setCustomShare(setCustomShare(claimAll(pizza(), ['you', 'alex']), 'you', 5_000).line, 'alex', 3_000).line;
    expect(resolveItemSplit(line, roster).status).toBe('incomplete');

    line = joinSplit(line, 'sam');
    const withSam = resolveItemSplit(line, roster);
    expect(withSam.status).toBe('complete');
    expect(withSam.portions.map((portion) => [portion.personId, portion.mode, portion.cents])).toEqual([
      ['you', 'custom', 1500],
      ['alex', 'custom', 900],
      ['sam', 'auto', 600],
    ]);

    const withoutSam = resolveItemSplit(leaveSplit(line, 'sam'), roster);
    expect(withoutSam.status).toBe('incomplete');
    expect(withoutSam.remainderBasisPoints).toBe(2000);
    expect(withoutSam.unallocatedCents).toBe(600);

    const equalAgain = resolveItemSplit(resetSplitToEqual(claimAll(pizza(), roster)), roster);
    expect(equalAgain.portions.every((portion) => portion.mode === 'auto')).toBe(true);
    expect(equalAgain.portions.reduce((sum, portion) => sum + portion.cents, 0)).toBe(3000);
  });

  it('refuses custom shares that exceed 100% together and leaves the line unchanged', () => {
    const line = setCustomShare(setCustomShare(claimAll(pizza(), roster), 'you', 5_000).line, 'alex', 3_000).line;
    const rejected = setCustomShare(line, 'sam', 3_000);
    expect(rejected.error).toMatch(/20%/);
    expect(rejected.line).toBe(line);
    expect(resolveItemSplit(line, roster).status).toBe('complete');
  });

  it('conserves cents for an awkward price and for the sample bill', () => {
    const awkward = resolveItemSplit(
      claimAll({ id: 'soda', name: 'Soda', cents: 1000, quantity: 1, shares: [] }, roster),
      roster,
    );
    expect(awkward.portions.map((portion) => portion.cents)).toEqual([333, 333, 334]);
    expect(awkward.portions.reduce((sum, portion) => sum + portion.cents, 0)).toBe(1000);

    const items = makeSampleSplitItems().map((item) => claimAll(item, roster));
    const summary = summarizeSplitBill({
      items,
      taxCents: 600,
      tipCents: 1350,
      printedTotalCents: 9450,
    }, roster, 'proportional');
    expect(summary.readyToFinalize).toBe(true);
    expect(summary.people.reduce((sum, person) => sum + person.totalCents, 0)).toBe(9450);
    expect(summary.people.map((person) => person.totalCents)).toEqual([3150, 3150, 3150]);

    items[0] = setCustomShare(items[0]!, 'you', 5_000).line;
    const uneven = summarizeSplitBill({
      items,
      taxCents: 601,
      tipCents: 1350,
      serviceChargeCents: 50,
      printedTotalCents: 9501,
    }, roster, 'equal');
    expect(uneven.people.reduce((sum, person) => sum + person.itemsCents, 0)).toBe(7500);
    expect(uneven.people.reduce((sum, person) => sum + person.totalCents, 0)).toBe(9501);
    expect(uneven.blockers).toEqual([]);
  });

  it('blocks finalizing while an item is open or the printed total disagrees', () => {
    const items = makeSampleSplitItems();
    items[0] = claimAll(items[0]!, ['you']);
    const summary = summarizeSplitBill({
      items,
      taxCents: 600,
      tipCents: 1350,
      printedTotalCents: 9000,
    }, roster, 'proportional');
    expect(summary.readyToFinalize).toBe(false);
    expect(summary.blockers.map((blocker) => blocker.kind)).toEqual([
      'unclaimed', 'unclaimed', 'unclaimed', 'total_mismatch',
    ]);
    expect(summary.people.every((person) => person.taxCents === 0)).toBe(true);
  });

  it('builds the labeled sample receipt and blank split lines', () => {
    const draft = makeSplitDemoReceipt();
    expect(draft.source).toBe('sample-demo');
    expect(draft.items.map((item) => [item.name, item.netLineTotalCents])).toEqual([
      ['Pizza', 3000],
      ['Ice Cream', 1500],
      ['Drinks', 1200],
      ['Shared Appetizer', 1800],
    ]);
    expect(draft.printedTotalCents).toBe(9450);
    const lines = splitLinesFromVerified(verifyReceipt({
      merchant: draft.merchant,
      items: draft.items.map((item) => ({
        id: item.clientId,
        name: item.name,
        quantity: item.quantity,
        netLineTotalCents: item.netLineTotalCents,
      })),
      taxCents: draft.taxCents,
      tipCents: draft.tipCents,
      printedTotalCents: draft.printedTotalCents,
    }));
    expect(lines.every((line) => line.shares.length === 0)).toBe(true);
    expect(lines[2]).toMatchObject({ id: 'drinks', quantity: 2, cents: 1200 });
  });
});

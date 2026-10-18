export type PersonId = 'you' | 'alex' | 'sam';
export type SplitMode = 'proportional' | 'equal';

// The original demo bill still uses whole and half claims. Percentage splits are defined below.
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

/** 100% expressed as basis points so splits stay in integers. */
export const FULL_SPLIT_BASIS_POINTS = 10_000;

export type ShareMode = 'auto' | 'custom';

export type SplitShare = {
  personId: string;
  mode: ShareMode;
  /** Set only for custom shares. 10_000 is 100%. */
  basisPoints?: number;
};

export type SplitLine = {
  id: string;
  name: string;
  cents: number;
  quantity: number;
  shares: SplitShare[];
};

export type ResolvedPortion = {
  personId: string;
  mode: ShareMode;
  basisPoints: number;
  cents: number;
};

export type ItemSplitStatus = 'unclaimed' | 'complete' | 'incomplete' | 'overallocated';

export type ItemResolution = {
  portions: ResolvedPortion[];
  allocatedBasisPoints: number;
  remainderBasisPoints: number;
  unallocatedCents: number;
  status: ItemSplitStatus;
  message?: string;
};

export type ItemVisualState = 'unclaimed' | 'single' | 'equal' | 'custom' | 'incomplete' | 'error';

export type SplitBillInput = {
  items: SplitLine[];
  taxCents: number;
  tipCents: number;
  serviceChargeCents?: number;
  discountCents?: number;
  printedTotalCents?: number;
};

export type SplitPersonTotal = {
  id: string;
  itemsCents: number;
  taxCents: number;
  tipCents: number;
  serviceCents: number;
  discountCents: number;
  totalCents: number;
};

export type SplitBlocker =
  | { kind: 'unclaimed'; itemId: string; itemName: string }
  | { kind: 'incomplete'; itemId: string; itemName: string; remainderBasisPoints: number }
  | { kind: 'overallocated'; itemId: string; itemName: string; message: string }
  | { kind: 'total_mismatch'; computedCents: number; printedCents: number };

export type SplitSummary = {
  subtotalCents: number;
  taxCents: number;
  tipCents: number;
  serviceCents: number;
  discountCents: number;
  computedTotalCents: number;
  printedTotalCents: number;
  totalsMatch: boolean;
  fullyAllocated: number;
  itemCount: number;
  itemsComplete: boolean;
  readyToFinalize: boolean;
  unallocatedCents: number;
  blockers: SplitBlocker[];
  people: SplitPersonTotal[];
  resolutions: { itemId: string; resolution: ItemResolution }[];
};

export type CustomShareResult = {
  line: SplitLine;
  error?: string;
};

const rosterOrder = (roster: readonly string[]) => new Map(roster.map((id, index) => [id, index]));

export function formatBasisPoints(basisPoints: number): string {
  const sign = basisPoints < 0 ? '-' : '';
  const absolute = Math.abs(Math.trunc(basisPoints));
  const whole = Math.floor(absolute / 100);
  const fraction = absolute % 100;
  if (fraction === 0) return `${sign}${whole}%`;
  return `${sign}${whole}.${String(fraction).padStart(2, '0')}%`;
}

/** Parse a percentage field without binary floating point. */
export function percentInputToBasisPoints(value: string): { basisPoints: number } | { error: string } {
  const trimmed = value.trim().replace(/%$/, '').trim();
  if (!trimmed) return { error: 'Enter a percentage.' };
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(trimmed)) {
    return { error: 'Use a number from 0 to 100, with up to two decimals.' };
  }
  const [wholeText, fractionText = ''] = trimmed.split('.');
  const basisPoints = Number(wholeText) * 100 + Number((fractionText + '00').slice(0, 2));
  if (basisPoints > FULL_SPLIT_BASIS_POINTS) return { error: 'Enter a percentage from 0 to 100.' };
  return { basisPoints };
}

/** Split basis points across `count` people. Leftover points go to the last seats. */
export function splitBasisPoints(total: number, count: number): number[] {
  if (!Number.isInteger(total) || total < 0 || !Number.isInteger(count) || count < 0) {
    throw new Error('Expected a nonnegative total and count.');
  }
  if (count === 0) return [];
  const base = Math.floor(total / count);
  const extra = total - base * count;
  return Array.from({ length: count }, (_, index) => base + (index >= count - extra ? 1 : 0));
}

export function resolveItemSplit(line: SplitLine, roster: readonly string[]): ItemResolution {
  const order = rosterOrder(roster);
  const claims = line.shares
    .filter((share) => order.has(share.personId))
    .sort((a, b) => order.get(a.personId)! - order.get(b.personId)!);

  if (claims.length === 0) {
    return {
      portions: [],
      allocatedBasisPoints: 0,
      remainderBasisPoints: FULL_SPLIT_BASIS_POINTS,
      unallocatedCents: line.cents,
      status: 'unclaimed',
      message: 'Unclaimed',
    };
  }

  const customSum = claims.reduce((sum, share) => (
    sum + (share.mode === 'custom' ? Math.max(0, share.basisPoints ?? 0) : 0)
  ), 0);

  if (customSum > FULL_SPLIT_BASIS_POINTS) {
    return {
      portions: claims.map((share) => ({
        personId: share.personId,
        mode: share.mode,
        basisPoints: share.mode === 'custom' ? share.basisPoints ?? 0 : 0,
        cents: 0,
      })),
      allocatedBasisPoints: customSum,
      remainderBasisPoints: FULL_SPLIT_BASIS_POINTS - customSum,
      unallocatedCents: line.cents,
      status: 'overallocated',
      message: 'Custom percentages add up to more than 100%.',
    };
  }

  const autos = claims.filter((share) => share.mode !== 'custom');
  const autoPoints = splitBasisPoints(FULL_SPLIT_BASIS_POINTS - customSum, autos.length);
  let autoIndex = 0;
  const resolved = claims.map((share) => {
    if (share.mode === 'custom') {
      return { personId: share.personId, mode: 'custom' as const, basisPoints: share.basisPoints ?? 0 };
    }
    return { personId: share.personId, mode: 'auto' as const, basisPoints: autoPoints[autoIndex++] ?? 0 };
  });

  const weights = resolved.map((portion) => portion.basisPoints);
  const weightSum = weights.reduce((sum, weight) => sum + weight, 0);
  let cents: number[] = weights.map(() => 0);
  let unallocatedCents = line.cents;

  if (weightSum > 0 && weightSum < FULL_SPLIT_BASIS_POINTS) {
    const amounts = allocateCents(line.cents, [...weights, FULL_SPLIT_BASIS_POINTS - weightSum]);
    cents = amounts.slice(0, weights.length);
    unallocatedCents = amounts[amounts.length - 1] ?? 0;
  } else if (weightSum >= FULL_SPLIT_BASIS_POINTS) {
    cents = allocateCents(line.cents, weights);
    unallocatedCents = 0;
  }

  const portions = resolved.map((portion, index) => ({ ...portion, cents: cents[index] ?? 0 }));
  const allocatedBasisPoints = portions.reduce((sum, portion) => sum + portion.basisPoints, 0);
  const status: ItemSplitStatus = allocatedBasisPoints === FULL_SPLIT_BASIS_POINTS ? 'complete' : 'incomplete';
  const idle = portions.filter((portion) => portion.basisPoints === 0);

  let message: string | undefined;
  if (status === 'incomplete') {
    message = `${formatBasisPoints(FULL_SPLIT_BASIS_POINTS - allocatedBasisPoints)} still needs an owner.`;
  } else if (idle.length > 0) {
    message = 'Custom shares already use the full item, so someone on it is at 0%.';
  }

  return {
    portions,
    allocatedBasisPoints,
    remainderBasisPoints: FULL_SPLIT_BASIS_POINTS - allocatedBasisPoints,
    unallocatedCents,
    status,
    message,
  };
}

export function itemVisualState(resolution: ItemResolution): ItemVisualState {
  if (resolution.status === 'unclaimed') return 'unclaimed';
  if (resolution.status === 'overallocated') return 'error';
  if (resolution.status === 'incomplete') return 'incomplete';
  if (resolution.portions.length <= 1) return 'single';
  if (resolution.portions.some((portion) => portion.mode === 'custom')) return 'custom';
  return 'equal';
}

export function joinSplit(line: SplitLine, personId: string): SplitLine {
  if (line.shares.some((share) => share.personId === personId)) return line;
  return { ...line, shares: [...line.shares, { personId, mode: 'auto' }] };
}

export function leaveSplit(line: SplitLine, personId: string): SplitLine {
  return { ...line, shares: line.shares.filter((share) => share.personId !== personId) };
}

export function resetSplitToEqual(line: SplitLine): SplitLine {
  return {
    ...line,
    shares: line.shares.map((share) => ({ personId: share.personId, mode: 'auto' as const })),
  };
}

export function setCustomShare(line: SplitLine, personId: string, basisPoints: number): CustomShareResult {
  if (!Number.isInteger(basisPoints) || basisPoints < 0 || basisPoints > FULL_SPLIT_BASIS_POINTS) {
    return { line, error: 'Enter a percentage from 0 to 100.' };
  }
  const otherCustom = line.shares
    .filter((share) => share.personId !== personId && share.mode === 'custom')
    .reduce((sum, share) => sum + (share.basisPoints ?? 0), 0);
  if (otherCustom + basisPoints > FULL_SPLIT_BASIS_POINTS) {
    return {
      line,
      error: `${formatBasisPoints(FULL_SPLIT_BASIS_POINTS - otherCustom)} is still open after the other custom shares.`,
    };
  }
  const nextShare: SplitShare = { personId, mode: 'custom', basisPoints };
  const exists = line.shares.some((share) => share.personId === personId);
  return {
    line: {
      ...line,
      shares: exists
        ? line.shares.map((share) => share.personId === personId ? nextShare : share)
        : [...line.shares, nextShare],
    },
  };
}

function emptyTotals(roster: readonly string[]): Record<string, number> {
  return Object.fromEntries(roster.map((id) => [id, 0]));
}

function allocateExtra(
  amount: number,
  roster: readonly string[],
  payerIds: readonly string[],
  weights: readonly number[],
): Record<string, number> {
  const result = emptyTotals(roster);
  if (amount === 0 || payerIds.length === 0) return result;
  const parts = allocateCents(Math.abs(amount), [...weights]);
  const sign = amount < 0 ? -1 : 1;
  payerIds.forEach((id, index) => { result[id] = sign * (parts[index] ?? 0); });
  return result;
}

export function summarizeSplitBill(
  bill: SplitBillInput,
  roster: readonly string[],
  mode: 'proportional' | 'equal',
): SplitSummary {
  const resolutions = bill.items.map((item) => ({
    itemId: item.id,
    resolution: resolveItemSplit(item, roster),
  }));
  const itemCents = emptyTotals(roster);
  let unallocatedCents = 0;
  const blockers: SplitBlocker[] = [];

  bill.items.forEach((item, index) => {
    const resolution = resolutions[index]?.resolution;
    if (!resolution) return;
    unallocatedCents += resolution.unallocatedCents;
    for (const portion of resolution.portions) itemCents[portion.personId] += portion.cents;
    if (resolution.status === 'unclaimed') {
      blockers.push({ kind: 'unclaimed', itemId: item.id, itemName: item.name });
    } else if (resolution.status === 'incomplete') {
      blockers.push({
        kind: 'incomplete',
        itemId: item.id,
        itemName: item.name,
        remainderBasisPoints: resolution.remainderBasisPoints,
      });
    } else if (resolution.status === 'overallocated') {
      blockers.push({
        kind: 'overallocated',
        itemId: item.id,
        itemName: item.name,
        message: resolution.message ?? 'Custom percentages add up to more than 100%.',
      });
    }
  });

  const subtotalCents = bill.items.reduce((sum, item) => sum + item.cents, 0);
  const serviceCents = bill.serviceChargeCents ?? 0;
  const discountCents = bill.discountCents ?? 0;
  const computedTotalCents = subtotalCents + bill.taxCents + bill.tipCents + serviceCents - discountCents;
  const printedTotalCents = bill.printedTotalCents ?? computedTotalCents;
  const totalsMatch = computedTotalCents === printedTotalCents;
  if (!totalsMatch) {
    blockers.push({ kind: 'total_mismatch', computedCents: computedTotalCents, printedCents: printedTotalCents });
  }

  const fullyAllocated = resolutions.filter((entry) => entry.resolution.status === 'complete').length;
  const itemsComplete = bill.items.length > 0 && fullyAllocated === bill.items.length;
  const payerIds = roster.filter((id) => (itemCents[id] ?? 0) > 0);
  const weights = mode === 'equal' ? payerIds.map(() => 1) : payerIds.map((id) => itemCents[id] ?? 0);
  const canShareExtras = itemsComplete && payerIds.length > 0;
  const taxByPerson = canShareExtras ? allocateExtra(bill.taxCents, roster, payerIds, weights) : emptyTotals(roster);
  const tipByPerson = canShareExtras ? allocateExtra(bill.tipCents, roster, payerIds, weights) : emptyTotals(roster);
  const serviceByPerson = canShareExtras ? allocateExtra(serviceCents, roster, payerIds, weights) : emptyTotals(roster);
  const discountByPerson = canShareExtras ? allocateExtra(discountCents, roster, payerIds, weights) : emptyTotals(roster);

  return {
    subtotalCents,
    taxCents: bill.taxCents,
    tipCents: bill.tipCents,
    serviceCents,
    discountCents,
    computedTotalCents,
    printedTotalCents,
    totalsMatch,
    fullyAllocated,
    itemCount: bill.items.length,
    itemsComplete,
    readyToFinalize: itemsComplete && totalsMatch,
    unallocatedCents,
    blockers,
    resolutions,
    people: roster.map((id) => ({
      id,
      itemsCents: itemCents[id] ?? 0,
      taxCents: taxByPerson[id] ?? 0,
      tipCents: tipByPerson[id] ?? 0,
      serviceCents: serviceByPerson[id] ?? 0,
      discountCents: discountByPerson[id] ?? 0,
      totalCents: (itemCents[id] ?? 0) + (taxByPerson[id] ?? 0) + (tipByPerson[id] ?? 0)
        + (serviceByPerson[id] ?? 0) - (discountByPerson[id] ?? 0),
    })),
  };
}

export function makeSampleSplitItems(): SplitLine[] {
  return [
    { id: 'pizza', name: 'Pizza', cents: 3000, quantity: 1, shares: [] },
    { id: 'ice-cream', name: 'Ice Cream', cents: 1500, quantity: 1, shares: [] },
    { id: 'drinks', name: 'Drinks', cents: 1200, quantity: 2, shares: [] },
    { id: 'appetizer', name: 'Shared Appetizer', cents: 1800, quantity: 1, shares: [] },
  ];
}

/** Labeled sample used by the mobile demo. These items are not OCR output. */
export function makeSplitDemoReceipt(): ExtractedReceipt {
  const items = makeSampleSplitItems();
  const taxCents = 600;
  const tipCents = 1350;
  const subtotal = items.reduce((sum, item) => sum + item.cents, 0);
  return {
    schemaVersion: 1,
    source: 'sample-demo',
    merchant: 'The Little Table',
    currency: 'USD',
    items: items.map((item) => ({
      clientId: item.id,
      name: item.name,
      quantity: item.quantity,
      netLineTotalCents: item.cents,
      confidence: 1,
    })),
    taxCents,
    tipCents,
    serviceChargeCents: 0,
    discountCents: 0,
    printedTotalCents: subtotal + taxCents + tipCents,
    warnings: ['provider_unavailable'],
  };
}

export function splitLinesFromVerified(receipt: VerifiedReceipt): SplitLine[] {
  const seen = new Set<string>();
  return receipt.items.map((item, index) => {
    let id = item.id || `item-${index + 1}`;
    if (seen.has(id)) id = `${id}-${index + 1}`;
    seen.add(id);
    return {
      id,
      name: item.name,
      cents: item.netLineTotalCents,
      quantity: item.quantity,
      shares: [],
    };
  });
}

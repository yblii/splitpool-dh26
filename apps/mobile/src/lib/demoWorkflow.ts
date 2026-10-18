import { formatBasisPoints, summarizeSplitBill, type MealTitlesRequest, type SplitBillInput, type SplitSummary } from '@splitpool/contracts';

/** Optional personal tips do not change reconciliation with the printed receipt. */
export function summarizeWithPersonalTips(
  bill: SplitBillInput, roster: string[], mode: 'equal' | 'proportional', tips: Record<string, number>,
): SplitSummary {
  const base = summarizeSplitBill(bill, roster, mode);
  let optionalTotal = 0;
  const people = base.people.map(person => {
    const tip = tips[person.id] ?? 0;
    if (!Number.isSafeInteger(tip) || tip < 0 || tip > 100000000) throw new Error('Invalid personal tip.');
    optionalTotal += tip;
    return { ...person, tipCents: person.tipCents + tip, totalCents: person.totalCents + tip };
  });
  return { ...base, people, computedTotalCents: base.computedTotalCents + optionalTotal };
}

/** Names, merchant, group name, prices, and payment details stay out of title requests. */
export function titleRequestForBill(
  items: { id: string; name: string }[], summary: SplitSummary, roster: string[],
): MealTitlesRequest {
  return { members: roster.map((id, index) => ({
    id: `diner-${index + 1}`,
    name: `Diner ${index + 1}`,
    items: items.flatMap(item => {
      const portion = summary.resolutions.find(row => row.itemId === item.id)?.resolution.portions
        .find(row => row.personId === id && row.basisPoints > 0);
      return portion ? [`${item.name.slice(0, 95)} (${formatBasisPoints(portion.basisPoints)} share)`] : [];
    }).slice(0, 40),
  })) };
}

export function moneyInputToCents(text: string): number | null {
  if (!/^\d{1,7}(\.\d{0,2})?$/.test(text.trim())) return null;
  const [whole, fraction = ''] = text.trim().split('.');
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return cents <= 100000000 ? cents : null;
}

export function everyShareAuthorized(summary: SplitSummary, authorizedIds: string[]): boolean {
  return summary.readyToFinalize && summary.people.filter(person => person.totalCents > 0)
    .every(person => authorizedIds.includes(person.id));
}

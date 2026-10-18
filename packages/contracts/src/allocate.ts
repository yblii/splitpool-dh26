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

import { describe, expect, it } from 'vitest';
import {
  claimMinePlusRemaining,
  equalPayerShare,
  formatFraction,
  fractionsEqual,
  remainingAsFraction,
} from './claims';

describe('claim helpers', () => {
  it('formats and compares fractions', () => {
    expect(formatFraction({ numerator: 1, denominator: 3 })).toBe('1/3');
    expect(fractionsEqual({ numerator: 1, denominator: 2 }, { numerator: 1, denominator: 2 })).toBe(true);
    expect(equalPayerShare(4)).toEqual({ numerator: 1, denominator: 4 });
  });

  it('adds remaining onto an existing claim for take-rest', () => {
    expect(remainingAsFraction({ numerator: '1', denominator: '2' })).toEqual({
      numerator: 1,
      denominator: 2,
    });
    expect(claimMinePlusRemaining({ numerator: 1, denominator: 4 }, { numerator: '1', denominator: '4' }))
      .toEqual({ numerator: 1, denominator: 2 });
    expect(claimMinePlusRemaining(undefined, { numerator: '0', denominator: '1' }))
      .toEqual({ numerator: 0, denominator: 1 });
  });
});

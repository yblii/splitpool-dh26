import { describe, expect, it } from 'vitest';
import { collaborationStateFromPayment } from './billState.ts';

describe('collaborationStateFromPayment', () => {
  it('marks paid and canceled bills closed', () => {
    expect(collaborationStateFromPayment({ phase: 'paid', hasSnapshot: true })).toBe('PAID');
    expect(collaborationStateFromPayment({ phase: 'canceled', hasSnapshot: true })).toBe('CANCELLED');
    expect(collaborationStateFromPayment({ phase: 'canceling', hasSnapshot: true })).toBe('CANCELLED');
  });

  it('tracks collection progress before close', () => {
    expect(collaborationStateFromPayment({ phase: 'collecting', hasSnapshot: true })).toBe('COLLECTING');
    expect(collaborationStateFromPayment({ phase: 'funding_pending', hasSnapshot: true })).toBe('READY_TO_PAY');
    expect(collaborationStateFromPayment({ phase: 'ready_to_pay', hasSnapshot: true })).toBe('READY_TO_PAY');
    expect(collaborationStateFromPayment({ phase: 'payment_pending', hasSnapshot: true })).toBe('PAYMENT_PENDING');
  });

  it('uses REVIEW while frozen and EDITING when reopened', () => {
    expect(collaborationStateFromPayment({ phase: null, hasSnapshot: true })).toBe('REVIEW');
    expect(collaborationStateFromPayment({ phase: undefined, hasSnapshot: false })).toBe('EDITING');
  });
});

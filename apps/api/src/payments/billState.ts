import type { Bill, PaymentPhase } from '@splitpool/contracts';

export type CollaborationBillState = Bill['state'];

/** Map ledger payment progress onto the collaboration bill row. */
export function collaborationStateFromPayment(input: {
  phase: PaymentPhase | null | undefined;
  hasSnapshot: boolean;
}): CollaborationBillState {
  switch (input.phase) {
    case 'paid':
      return 'PAID';
    case 'canceled':
    case 'canceling':
      return 'CANCELLED';
    case 'payment_pending':
      return 'PAYMENT_PENDING';
    case 'ready_to_pay':
    case 'funding_pending':
      return 'READY_TO_PAY';
    case 'collecting':
      return 'COLLECTING';
    default:
      return input.hasSnapshot ? 'REVIEW' : 'EDITING';
  }
}

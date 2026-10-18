export type UserId = string;
export type AllocationMode = 'equal' | 'proportional';
export type Fraction = { numerator: number; denominator: number };
export type Profile = { userId: UserId; username: string; displayName: string };
export type BillState =
  | 'EDITING'
  | 'REVIEW'
  | 'COLLECTING'
  | 'READY_TO_PAY'
  | 'PAYMENT_PENDING'
  | 'PAID'
  | 'CANCELLED';
export type Group = { id: string; name: string; hostId: UserId; activeBillId: string | null };
/** Lightweight bill row for group history (groups preserve closed bills). */
export type GroupBillSummary = {
  id: string;
  merchant: string;
  state: BillState;
  createdAt: string;
  totalCents: number;
  yourShareCents: number;
};
export type GroupDetail = Group & { members: Profile[]; bills: GroupBillSummary[] };
export type GroupListItem = Group & { members: Profile[]; recentMerchant: string | null };
export type BillItem = { id: string; name: string; quantity: number; netLineTotalCents: number };
export type ItemClaim = { itemId: string; userId: UserId; fraction: Fraction };
export type BillSettings = {
  taxMode: AllocationMode;
  serviceChargeMode: AllocationMode;
};
export type Bill = {
  id: string; groupId: string; state: BillState;
  version: number; merchant: string; currency: 'USD'; participants: (Profile & { tipCents: number })[];
  items: BillItem[]; claims: ItemClaim[];
  taxCents: number; serviceChargeCents: number; printedTotalCents: number | null;
  settings: BillSettings;
};
export type BillBlocker = { code: 'NO_ITEMS' | 'NO_PAYERS' | 'UNCLAIMED_ITEM' | 'OVERCLAIMED_ITEM' | 'RECEIPT_TOTAL_MISSING' | 'RECEIPT_MISMATCH' | 'ZERO_SUBTOTAL'; itemId?: string };
export type BillSummary = {
  subtotalCents: number; receiptTotalCents: number; addedTipCents: number; totalCents: number;
  complete: boolean; blockers: BillBlocker[];
  remaining: { itemId: string; numerator: string; denominator: string }[];
  shares: { userId: UserId; itemsCents: number; taxCents: number; serviceChargeCents: number; tipCents: number; totalCents: number }[];
};
export type BillResponse = Bill & { summary: BillSummary };
export type Versioned = { expectedVersion: number };
export type SaveItemsRequest = Versioned & {
  merchant: string;
  items: (Omit<BillItem, 'id'> & { id?: string })[];
  taxCents: number; serviceChargeCents: number; printedTotalCents: number;
};
export type UpdateSettingsRequest = Versioned & Partial<BillSettings> & { participantIds?: UserId[] };
export type SetClaimRequest = Versioned & { fraction: Fraction };
export type SetTipRequest = Versioned & { tipCents: number };
export type ApiFailure = { error: { code: string; message: string; details?: Record<string, unknown> } };

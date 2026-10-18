import { createContext, useContext, useMemo, useState, type PropsWithChildren } from 'react';
import { Alert } from 'react-native';
import {
  extractedToEditable,
  joinSplit,
  leaveSplit,
  makeSplitDemoReceipt,
  resetSplitToEqual,
  setCustomShare,
  splitLinesFromVerified,
  summarizeSplitBill,
  verifyReceipt,
  type ExtractedReceipt,
  type SplitLine,
  type SplitMode,
  type SplitSummary,
  type VerifiedReceipt,
} from '@splitpool/contracts';

export type DemoPerson = {
  id: string;
  name: string;
  username: string;
  initial: string;
  color: string;
};

export type DemoGroup = {
  id: string;
  name: string;
  memberIds: string[];
};

export type PastBill = {
  id: string;
  groupId: string;
  merchant: string;
  dateLabel: string;
  totalCents: number;
  yourShareCents: number;
  status: 'paid';
};

export type BillPhase =
  | 'editing'
  | 'review'
  | 'collecting'
  | 'failed'
  | 'ready'
  | 'merchant_pending'
  | 'paid';

export type ActiveBill = {
  id: string;
  groupId: string;
  merchant: string;
  items: SplitLine[];
  taxCents: number;
  tipCents: number;
  serviceChargeCents: number;
  discountCents: number;
  printedTotalCents: number;
  phase: BillPhase;
  approvals: Record<string, boolean>;
  failedPersonId: string | null;
  splitMode: SplitMode;
};

export type DemoCard = { id: string; brand: string; last4: string };

export const DEMO_CARDS: DemoCard[] = [
  { id: 'visa', brand: 'Demo Visa', last4: '4242' },
  { id: 'mastercard', brand: 'Demo Mastercard', last4: '4444' },
];

const DIRECTORY: DemoPerson[] = [
  { id: 'alex', name: 'Alex', username: 'alex', initial: 'A', color: '#C4622D' },
  { id: 'sam', name: 'Sam', username: 'sam', initial: 'S', color: '#2F7D6D' },
  { id: 'riley', name: 'Riley', username: 'riley', initial: 'R', color: '#6D5BD0' },
  { id: 'morgan', name: 'Morgan', username: 'morgan', initial: 'M', color: '#B4536A' },
];

const YOU_COLOR = '#1F4E72';
const HOST_ID = 'you';

function seedGroups(): DemoGroup[] {
  return [
    { id: 'fam', name: 'Fam', memberIds: ['you', 'alex', 'sam'] },
    { id: 'roommates', name: 'Roommates', memberIds: ['you', 'sam'] },
  ];
}

function seedPastBills(): PastBill[] {
  return [
    { id: 'pb-luigi', groupId: 'fam', merchant: "Luigi's", dateLabel: 'Oct 4', totalCents: 8620, yourShareCents: 2840, status: 'paid' },
    { id: 'pb-luna', groupId: 'fam', merchant: 'Cafe Luna', dateLabel: 'Sep 18', totalCents: 4200, yourShareCents: 1400, status: 'paid' },
    { id: 'pb-deli', groupId: 'roommates', merchant: 'Corner Deli', dateLabel: 'Oct 11', totalCents: 2860, yourShareCents: 1430, status: 'paid' },
  ];
}

function billFromReceipt(groupId: string, receipt: ExtractedReceipt, id: string): ActiveBill {
  const verified = verifyReceipt(extractedToEditable(receipt));
  return {
    id,
    groupId,
    merchant: verified.merchant,
    items: splitLinesFromVerified(verified),
    taxCents: verified.taxCents,
    tipCents: verified.tipCents,
    serviceChargeCents: verified.serviceChargeCents,
    discountCents: verified.discountCents,
    printedTotalCents: verified.printedTotalCents,
    phase: 'editing',
    approvals: {},
    failedPersonId: null,
    splitMode: 'proportional',
  };
}

function seedBills(): Record<string, ActiveBill> {
  return { fam: billFromReceipt('fam', makeSplitDemoReceipt(), 'bill-fam') };
}

type DemoContextValue = {
  profileName: string;
  username: string;
  friends: DemoPerson[];
  groups: DemoGroup[];
  pastBills: PastBill[];
  personId: string;
  you: DemoPerson;
  viewingGroupId: string;
  viewingGroup: DemoGroup;
  members: DemoPerson[];
  currentBill: ActiveBill | null;
  summary: SplitSummary | null;
  selectedCard: DemoCard | null;
  linked: boolean;
  pendingReceipt: ExtractedReceipt | null;
  receiptGroupId: string;
  setProfileName: (name: string) => void;
  setUsername: (name: string) => void;
  setPerson: (id: string) => void;
  selectGroup: (id: string) => void;
  selectReceiptGroup: (id: string) => void;
  setLinked: (linked: boolean) => void;
  selectCard: (id: string | null) => void;
  setPendingReceipt: (draft: ExtractedReceipt | null) => void;
  lookup: (id: string) => DemoPerson;
  activityLabel: (groupId: string) => string | undefined;
  billFor: (groupId: string) => ActiveBill | null;
  createGroup: (name: string, memberIds: string[]) => { id: string } | { error: string };
  renameGroup: (groupId: string, name: string) => string | null;
  addGroupMember: (groupId: string, memberId: string) => string | null;
  removeGroupMember: (groupId: string, memberId: string) => string | null;
  addFriend: (username: string) => { ok: true; person: DemoPerson } | { ok: false; message: string };
  claimItem: (itemId: string) => void;
  unclaimItem: (itemId: string) => void;
  customizeItem: (itemId: string, basisPoints: number) => string | null;
  resetItem: (itemId: string) => void;
  setSplitMode: (mode: SplitMode) => void;
  applyVerifiedReceipt: (receipt: VerifiedReceipt) => void;
  startReview: () => string | null;
  reopenReview: () => string | null;
  approveShare: () => string | null;
  confirmCollect: () => string | null;
  simulateCollectionSuccess: () => void;
  simulateCollectionFailure: () => void;
  retryFailed: () => void;
  simulateMerchant: () => void;
  completeMerchant: () => void;
  cancelCollection: () => void;
  reset: () => void;
};

const DemoContext = createContext<DemoContextValue | null>(null);

function toInput(bill: ActiveBill) {
  return {
    items: bill.items,
    taxCents: bill.taxCents,
    tipCents: bill.tipCents,
    serviceChargeCents: bill.serviceChargeCents,
    discountCents: bill.discountCents,
    printedTotalCents: bill.printedTotalCents,
  };
}

export function DemoProvider({ children }: PropsWithChildren) {
  const [profileName, setProfileName] = useState('Jamie');
  const [username, setUsername] = useState('jamie');
  const [friends, setFriends] = useState<DemoPerson[]>(() => DIRECTORY.filter((person) => person.id === 'alex' || person.id === 'sam'));
  const [groups, setGroups] = useState<DemoGroup[]>(seedGroups);
  const [pastBills, setPastBills] = useState<PastBill[]>(seedPastBills);
  const [bills, setBills] = useState<Record<string, ActiveBill>>(seedBills);
  const [personId, setPersonId] = useState(HOST_ID);
  const [viewingGroupId, setViewingGroupId] = useState('fam');
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [pendingReceipt, setPendingReceipt] = useState<ExtractedReceipt | null>(null);
  const [receiptGroupId, setReceiptGroupId] = useState('fam');

  const you = useMemo<DemoPerson>(() => ({
    id: HOST_ID,
    name: 'You',
    username: username.trim().replace(/^@/, '') || 'jamie',
    initial: (profileName.trim().charAt(0) || 'Y').toUpperCase(),
    color: YOU_COLOR,
  }), [profileName, username]);

  const lookup = useMemo(() => {
    const all = new Map<string, DemoPerson>([[you.id, you], ...DIRECTORY.map((person) => [person.id, person] as const)]);
    return (id: string): DemoPerson => all.get(id) ?? {
      id, name: 'Guest', username: id, initial: '?', color: colorsFallback,
    };
  }, [you]);

  const viewingGroup = groups.find((group) => group.id === viewingGroupId) ?? groups[0]!;
  const currentBill = bills[viewingGroup.id] ?? null;
  const summary = useMemo(
    () => currentBill ? summarizeSplitBill(toInput(currentBill), viewingGroup.memberIds, currentBill.splitMode) : null,
    [currentBill, viewingGroup],
  );
  const members = viewingGroup.memberIds.map((id) => lookup(id));
  const selectedCard = DEMO_CARDS.find((card) => card.id === selectedCardId) ?? null;
  const activePersonId = viewingGroup.memberIds.includes(personId) ? personId : HOST_ID;

  function updateEditing(groupId: string, recipe: (bill: ActiveBill) => ActiveBill) {
    setBills((current) => {
      const bill = current[groupId];
      if (!bill || bill.phase !== 'editing') return current;
      return { ...current, [groupId]: recipe(bill) };
    });
  }

  function activityLabel(groupId: string) {
    const bill = bills[groupId];
    if (bill && bill.phase !== 'paid') return `In progress · ${bill.merchant}`;
    const past = pastBills.find((entry) => entry.groupId === groupId);
    if (past) return `${past.merchant} · ${past.dateLabel}`;
    if (bill?.phase === 'paid') return `${bill.merchant} · Paid in this demo`;
    return undefined;
  }

  function createGroup(name: string, memberIds: string[]) {
    const trimmed = name.trim();
    if (!trimmed) return { error: 'Enter a group name.' };
    const unique = [HOST_ID, ...memberIds.filter((id, index, list) => id !== HOST_ID && friends.some((friend) => friend.id === id) && list.indexOf(id) === index)];
    if (unique.length < 2) return { error: 'Choose at least one friend.' };
    const id = `group-${Date.now().toString(36)}`;
    setGroups((current) => [...current, { id, name: trimmed.slice(0, 40), memberIds: unique }]);
    setViewingGroupId(id);
    return { id };
  }

  function membershipLocked(groupId: string) {
    const phase = bills[groupId]?.phase;
    return phase === 'review' || phase === 'collecting' || phase === 'failed' || phase === 'ready' || phase === 'merchant_pending';
  }

  function renameGroup(groupId: string, name: string) {
    const trimmed = name.trim();
    if (!trimmed) return 'Enter a group name.';
    if (membershipLocked(groupId)) return 'The group name is locked while a payment demo is running.';
    setGroups((current) => current.map((group) => group.id === groupId ? { ...group, name: trimmed.slice(0, 40) } : group));
    return null;
  }

  function addGroupMember(groupId: string, memberId: string) {
    if (!friends.some((friend) => friend.id === memberId)) return 'Add them as a friend first.';
    if (membershipLocked(groupId)) return 'Members are locked while this bill is in review or payment.';
    setGroups((current) => current.map((group) => group.id === groupId && !group.memberIds.includes(memberId)
      ? { ...group, memberIds: [...group.memberIds, memberId] }
      : group));
    return null;
  }

  function removeGroupMember(groupId: string, memberId: string) {
    if (memberId === HOST_ID) return 'You stay in the group.';
    if (membershipLocked(groupId)) return 'Members are locked while this bill is in review or payment.';
    setGroups((current) => current.map((group) => group.id === groupId
      ? { ...group, memberIds: group.memberIds.filter((id) => id !== memberId) }
      : group));
    updateEditing(groupId, (bill) => ({
      ...bill,
      items: bill.items.map((item) => leaveSplit(item, memberId)),
      failedPersonId: bill.failedPersonId === memberId ? null : bill.failedPersonId,
    }));
    if (personId === memberId) setPersonId(HOST_ID);
    return null;
  }

  function addFriend(raw: string): { ok: true; person: DemoPerson } | { ok: false; message: string } {
    const handle = raw.trim().replace(/^@/, '').toLowerCase();
    if (!handle) return { ok: false, message: 'Enter a username.' };
    if (handle === you.username.toLowerCase()) return { ok: false, message: 'That’s you.' };
    const match = DIRECTORY.find((person) => person.username === handle);
    if (!match) return { ok: false, message: `No demo user @${handle}. Try @riley or @morgan.` };
    if (friends.some((friend) => friend.id === match.id)) return { ok: false, message: `${match.name} is already a friend.` };
    setFriends((current) => [...current, match]);
    return { ok: true, person: match };
  }

  function claimItem(itemId: string) {
    if (!currentBill || currentBill.phase !== 'editing') return;
    if (!viewingGroup.memberIds.includes(activePersonId)) return;
    updateEditing(currentBill.groupId, (bill) => ({
      ...bill,
      items: bill.items.map((item) => item.id === itemId ? joinSplit(item, activePersonId) : item),
    }));
  }

  function unclaimItem(itemId: string) {
    if (!currentBill) return;
    updateEditing(currentBill.groupId, (bill) => ({
      ...bill,
      items: bill.items.map((item) => item.id === itemId ? leaveSplit(item, activePersonId) : item),
    }));
  }

  function customizeItem(itemId: string, basisPoints: number) {
    if (!currentBill || currentBill.phase !== 'editing') return 'This bill is locked.';
    const item = currentBill.items.find((entry) => entry.id === itemId);
    if (!item) return 'That item is no longer on the bill.';
    const result = setCustomShare(item, activePersonId, basisPoints);
    if (result.error) return result.error;
    const groupId = currentBill.groupId;
    updateEditing(groupId, (bill) => ({
      ...bill,
      items: bill.items.map((entry) => {
        if (entry.id !== itemId) return entry;
        const next = setCustomShare(entry, activePersonId, basisPoints);
        return next.error ? entry : next.line;
      }),
    }));
    return null;
  }

  function resetItem(itemId: string) {
    if (!currentBill) return;
    updateEditing(currentBill.groupId, (bill) => ({
      ...bill,
      items: bill.items.map((item) => item.id === itemId ? resetSplitToEqual(item) : item),
    }));
  }

  function setSplitMode(mode: SplitMode) {
    if (!currentBill) return;
    updateEditing(currentBill.groupId, (bill) => ({ ...bill, splitMode: mode }));
  }

  function applyVerifiedReceipt(receipt: VerifiedReceipt) {
    const existing = bills[receiptGroupId];
    if (existing && existing.phase !== 'editing' && existing.phase !== 'paid') {
      Alert.alert('Bill locked', 'Finish the current demo payment, or reset the demo, before replacing this bill.');
      return;
    }
    const next = billFromReceipt(receiptGroupId, {
      schemaVersion: 1,
      source: 'reviewed',
      merchant: receipt.merchant,
      currency: 'USD',
      items: receipt.items.map((item) => ({
        clientId: item.id,
        name: item.name,
        quantity: item.quantity,
        netLineTotalCents: item.netLineTotalCents,
      })),
      taxCents: receipt.taxCents,
      tipCents: receipt.tipCents,
      serviceChargeCents: receipt.serviceChargeCents,
      discountCents: receipt.discountCents,
      printedTotalCents: receipt.printedTotalCents,
      warnings: [],
    }, `bill-${receiptGroupId}-${Date.now().toString(36)}`);
    setBills((current) => ({ ...current, [receiptGroupId]: next }));
    setViewingGroupId(receiptGroupId);
    setPendingReceipt(null);
    setPersonId(HOST_ID);
  }

  function startReview() {
    if (activePersonId !== HOST_ID) return 'Only the host can send this bill for approval.';
    if (!currentBill || currentBill.phase !== 'editing') return 'This bill is not open for changes.';
    if (!summary?.readyToFinalize) return 'Every item needs a full split, and the receipt total has to match, before approval.';
    const groupId = currentBill.groupId;
    setBills((current) => {
      const bill = current[groupId];
      if (!bill || bill.phase !== 'editing') return current;
      return { ...current, [groupId]: { ...bill, phase: 'review', approvals: {}, failedPersonId: null } };
    });
    return null;
  }

  function reopenReview() {
    if (activePersonId !== HOST_ID) return 'Only the host can reopen the bill.';
    if (!currentBill || currentBill.phase !== 'review') return 'Collection has started. Cancel it before editing again.';
    const groupId = currentBill.groupId;
    setBills((current) => {
      const bill = current[groupId];
      if (!bill || bill.phase !== 'review') return current;
      return { ...current, [groupId]: { ...bill, phase: 'editing', approvals: {} } };
    });
    return null;
  }

  function approveShare() {
    if (!currentBill || currentBill.phase !== 'review' || !summary) return 'The host has not asked for approval yet.';
    const mine = summary.people.find((person) => person.id === activePersonId);
    if (!mine || mine.totalCents <= 0) return 'You do not have a share to approve.';
    if (!selectedCard) return 'Choose a demo card on your profile first. No real card is stored.';
    const groupId = currentBill.groupId;
    const approver = activePersonId;
    setBills((current) => {
      const bill = current[groupId];
      if (!bill || bill.phase !== 'review') return current;
      return { ...current, [groupId]: { ...bill, approvals: { ...bill.approvals, [approver]: true } } };
    });
    return null;
  }

  function confirmCollect() {
    if (activePersonId !== HOST_ID) return 'Only the host can start collection.';
    if (!currentBill || currentBill.phase !== 'review' || !summary) return 'Send the bill for approval first.';
    const waiting = summary.people.filter((person) => person.totalCents > 0 && !currentBill.approvals[person.id]);
    if (waiting.length > 0) return 'Everyone with a share needs to approve first.';
    const groupId = currentBill.groupId;
    setBills((current) => {
      const bill = current[groupId];
      if (!bill || bill.phase !== 'review') return current;
      return { ...current, [groupId]: { ...bill, phase: 'collecting', failedPersonId: null } };
    });
    return null;
  }

  function setPhase(phase: BillPhase, extra?: Partial<ActiveBill>) {
    if (!currentBill) return;
    const groupId = currentBill.groupId;
    setBills((current) => {
      const bill = current[groupId];
      if (!bill) return current;
      return { ...current, [groupId]: { ...bill, ...extra, phase } };
    });
  }

  function simulateCollectionSuccess() {
    if (currentBill?.phase === 'collecting') setPhase('ready', { failedPersonId: null });
  }

  function simulateCollectionFailure() {
    if (!currentBill || currentBill.phase !== 'collecting' || !summary) return;
    const payers = summary.people.filter((person) => person.totalCents > 0).map((person) => person.id);
    const failedPersonId = [...payers].reverse().find((id) => id !== HOST_ID) ?? payers[0] ?? HOST_ID;
    setPhase('failed', { failedPersonId });
  }

  function retryFailed() {
    if (currentBill?.phase === 'failed') setPhase('collecting', { failedPersonId: null });
  }

  function simulateMerchant() {
    if (currentBill?.phase === 'ready') setPhase('merchant_pending');
  }

  function completeMerchant() {
    if (!currentBill || currentBill.phase !== 'merchant_pending' || !summary) return;
    const yours = summary.people.find((person) => person.id === HOST_ID)?.totalCents ?? 0;
    const archived: PastBill = {
      id: `paid-${currentBill.id}`,
      groupId: currentBill.groupId,
      merchant: currentBill.merchant,
      dateLabel: 'Oct 18',
      totalCents: summary.computedTotalCents,
      yourShareCents: yours,
      status: 'paid',
    };
    setPastBills((current) => [archived, ...current.filter((entry) => entry.id !== archived.id)]);
    setPhase('paid');
  }

  function cancelCollection() {
    if (!currentBill) return;
    if (activePersonId !== HOST_ID) return;
    if (currentBill.phase === 'editing' || currentBill.phase === 'review' || currentBill.phase === 'paid') return;
    setPhase('editing', { approvals: {}, failedPersonId: null });
  }

  function reset() {
    setBills(seedBills());
    setGroups(seedGroups());
    setFriends(DIRECTORY.filter((person) => person.id === 'alex' || person.id === 'sam'));
    setPastBills(seedPastBills());
    setPersonId(HOST_ID);
    setViewingGroupId('fam');
    setSelectedCardId(null);
    setPendingReceipt(null);
    setReceiptGroupId('fam');
  }

  const value: DemoContextValue = {
    profileName, username, friends, groups, pastBills, personId: activePersonId, you,
    viewingGroupId, viewingGroup, members, currentBill, summary, selectedCard,
    linked: selectedCard !== null, pendingReceipt, receiptGroupId,
    setProfileName, setUsername, setPerson: setPersonId, selectGroup: setViewingGroupId,
    selectReceiptGroup: setReceiptGroupId,
    setLinked: (linked) => setSelectedCardId(linked ? (selectedCardId ?? 'visa') : null),
    selectCard: setSelectedCardId, setPendingReceipt, lookup, activityLabel,
    billFor: (groupId) => bills[groupId] ?? null,
    createGroup, renameGroup, addGroupMember, removeGroupMember, addFriend,
    claimItem, unclaimItem, customizeItem, resetItem, setSplitMode, applyVerifiedReceipt,
    startReview, reopenReview, approveShare, confirmCollect,
    simulateCollectionSuccess, simulateCollectionFailure, retryFailed, simulateMerchant, completeMerchant, cancelCollection,
    reset,
  };

  return <DemoContext.Provider value={value}>{children}</DemoContext.Provider>;
}

const colorsFallback = '#637383';

export function useDemo() {
  const value = useContext(DemoContext);
  if (!value) throw new Error('useDemo must be inside DemoProvider');
  return value;
}

export function payerStatus(phase: BillPhase, approved: boolean, failed: boolean, owes: boolean) {
  if (!owes) return 'No share';
  if (phase === 'editing') return 'Still splitting';
  if (phase === 'review') return approved ? 'Approved' : 'Waiting for approval';
  if (phase === 'collecting') return 'Collecting payments';
  if (phase === 'failed') return failed ? 'Payment failed' : 'Collected in this demo';
  if (phase === 'ready') return 'All contributions collected';
  if (phase === 'merchant_pending') return 'Merchant payment pending';
  return 'Payment complete';
}

export function billStatusLabel(phase: BillPhase) {
  switch (phase) {
    case 'editing': return 'Splitting';
    case 'review': return 'Waiting for approval';
    case 'collecting': return 'Collecting payments';
    case 'failed': return 'Payment failed';
    case 'ready': return 'Virtual card ready';
    case 'merchant_pending': return 'Merchant payment pending';
    case 'paid': return 'Payment complete';
    default: return phase;
  }
}

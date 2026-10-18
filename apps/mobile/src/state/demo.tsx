import { createContext, useContext, useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react';
import { Alert } from 'react-native';
import {
  extractedToEditable,
  joinSplit,
  leaveSplit,
  makeSplitDemoReceipt,
  resetSplitToEqual,
  setCustomShare,
  splitLinesFromVerified,
  verifyReceipt,
  type ExtractedReceipt,
  type SplitLine,
  type SplitMode,
  type SplitSummary,
  type VerifiedReceipt,
  type MealTitlesResponse,
} from '@splitpool/contracts';
import { everyShareAuthorized, summarizeWithPersonalTips, titleRequestForBill } from '../lib/demoWorkflow';
import { generateMealTitles } from '../lib/mealTitles';
import { readTitles, writeTitles, type SavedTitles } from '../lib/titleStorage';

export type DemoPerson = {
  id: string;
  name: string;
  username: string;
  phone?: string;
  title: string;
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
  titles?: MealTitlesResponse;
};

export type BillPhase =
  | 'editing'
  | 'review'
  | 'collecting'
  | 'failed'
  | 'funding_pending'
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
  personalTips: Record<string, number>;
  authorizedIds: string[];
  titleLoading?: boolean;
  mealTitles?: MealTitlesResponse;
};

export type DemoCard = { id: string; brand: string; last4: string };

export const DEMO_CARDS: DemoCard[] = [
  { id: 'visa', brand: 'Demo Visa', last4: '4242' },
  { id: 'mastercard', brand: 'Demo Debit', last4: '4444' },
];

const DIRECTORY: DemoPerson[] = [
  { id: 'alex', name: 'Alex', username: 'alex', phone: '555-0101', title: 'green witch', initial: 'A', color: '#C4622D' },
  { id: 'sam', name: 'Sam', username: 'sam', phone: '555-0102', title: 'night owl', initial: 'S', color: '#2F7D6D' },
  { id: 'riley', name: 'Riley', username: 'riley', phone: '555-0148', title: 'late bite', initial: 'R', color: '#6D5BD0' },
  { id: 'morgan', name: 'Morgan', username: 'morgan', phone: '555-0162', title: 'soup season', initial: 'M', color: '#B4536A' },
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
    { id: 'pb-thai', groupId: 'fam', merchant: 'Dinner at Little Thai', dateLabel: 'Oct 16', totalCents: 6400, yourShareCents: 2134, status: 'paid' },
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
    personalTips: {},
    authorizedIds: [],
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
  cards: DemoCard[];
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
  addPayment: (brand: string, last4: string) => string | null;
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
  assignItem: (itemId: string, personId: string) => string | null;
  hintItem: (itemId: string, personId: string) => string | null;
  unclaimItem: (itemId: string) => void;
  customizeItem: (itemId: string, basisPoints: number) => string | null;
  resetItem: (itemId: string) => void;
  setSplitMode: (mode: SplitMode) => void;
  setPersonalTip: (tipCents: number) => string | null;
  applyVerifiedReceipt: (receipt: VerifiedReceipt) => void;
  startReview: () => string | null;
  reopenReview: () => string | null;
  approveShare: () => string | null;
  confirmCollect: () => string | null;
  simulateCollectionSuccess: () => void;
  authorizeMyShare: () => void;
  simulateCollectionFailure: () => void;
  retryFailed: () => void;
  simulateMerchant: () => void;
  completeMerchant: () => void;
  cancelCollection: () => void;
  inWallet: boolean;
  addToWallet: () => void;
  dismissNotice: (id: string) => void;
  quietNotices: { id: string; message: string }[];
  titleSharingEnabled: boolean;
  setTitleSharingEnabled: (enabled: boolean) => void;
  dismissTitle: () => void;
  titleStorageError: boolean;
  yourTitleSource: string | null;
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
  const [cards, setCards] = useState<DemoCard[]>(DEMO_CARDS);
  const [selectedCards, setSelectedCards] = useState<Record<string, string | null>>({});
  const [pendingReceipt, setPendingReceipt] = useState<ExtractedReceipt | null>(null);
  const [receiptGroupId, setReceiptGroupId] = useState('fam');
  const [notices, setNotices] = useState<{ id: string; personId: string; itemId?: string; kind?: 'hint'; message: string }[]>([]);
  const [walletBillId, setWalletBillId] = useState<string | null>(null);
  const [savedTitles, setSavedTitles] = useState<SavedTitles>({});
  const [titlesHydrated, setTitlesHydrated] = useState(false);
  const [titleStorageError, setTitleStorageError] = useState(false);
  const [titleSharingEnabled, setTitleSharingEnabled] = useState(true);
  const titleRequests = useRef(new Map<string, AbortController>());
  const resetEpoch = useRef(0);
  const latestPaidByPerson = useRef<Record<string, string>>({});
  const storageQueue = useRef(Promise.resolve());

  useEffect(() => {
    const epoch = resetEpoch.current;
    let active = true;
    void readTitles().then(saved => {
      if (!active) return;
      if (epoch === resetEpoch.current) setSavedTitles(current => ({ ...saved, ...current }));
      setTitlesHydrated(true);
    });
    const requests = titleRequests.current;
    return () => { active = false; requests.forEach(controller => controller.abort()); };
  }, []);

  useEffect(() => {
    if (!titlesHydrated) return;
    storageQueue.current = storageQueue.current.catch(() => {}).then(() => writeTitles(savedTitles))
      .then(() => setTitleStorageError(false)).catch(() => setTitleStorageError(true));
  }, [savedTitles, titlesHydrated]);

  const you = useMemo<DemoPerson>(() => ({
    id: HOST_ID,
    name: 'You',
    username: username.trim().replace(/^@/, '') || 'jamie',
    title: savedTitles.you?.title ?? '',
    initial: (profileName.trim().charAt(0) || 'Y').toUpperCase(),
    color: YOU_COLOR,
  }), [profileName, username, savedTitles]);

  const lookup = useMemo(() => {
    const all = new Map<string, DemoPerson>([[you.id, you], ...DIRECTORY.map((person) => [person.id, { ...person, title: savedTitles[person.id]?.title ?? '' }] as const)]);
    return (id: string): DemoPerson => all.get(id) ?? {
      id, name: 'Guest', username: id, title: '', initial: '?', color: colorsFallback,
    };
  }, [you, savedTitles]);

  const viewingGroup = groups.find((group) => group.id === viewingGroupId) ?? groups[0]!;
  const currentBill = bills[viewingGroup.id] ?? null;
  const summary = useMemo(
    () => currentBill ? summarizeWithPersonalTips(toInput(currentBill), viewingGroup.memberIds, currentBill.splitMode, currentBill.personalTips) : null,
    [currentBill, viewingGroup],
  );
  const members = viewingGroup.memberIds.map((id) => lookup(id));
  const activePersonId = viewingGroup.memberIds.includes(personId) ? personId : HOST_ID;
  const selectedCardId = selectedCards[activePersonId] ?? null;
  const selectedCard = cards.find((card) => card.id === selectedCardId) ?? null;

  function selectCard(id: string | null) {
    if (currentBill && currentBill.phase !== 'editing' && currentBill.phase !== 'paid'
      && (currentBill.phase !== 'review' || currentBill.approvals[activePersonId])) return;
    setSelectedCards(current => ({ ...current, [activePersonId]: id }));
  }

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
    return phase === 'review' || phase === 'collecting' || phase === 'failed' || phase === 'funding_pending' || phase === 'ready' || phase === 'merchant_pending';
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
    const trimmed = raw.trim();
    const handle = trimmed.replace(/^@/, '').toLowerCase();
    const digits = trimmed.replace(/\D/g, '');
    if (!handle) return { ok: false, message: 'Enter a username or phone number.' };
    if (handle === you.username.toLowerCase()) return { ok: false, message: 'That’s you.' };
    const match = DIRECTORY.find((person) => person.username === handle)
      ?? (digits.length >= 7 ? DIRECTORY.find((person) => person.phone?.replace(/\D/g, '') === digits) : undefined);
    if (!match) return { ok: false, message: digits.length >= 7
      ? `No demo number ${trimmed}. Try 555-0148 or 555-0162.`
      : `No demo user @${handle}. Try @riley or @morgan.` };
    if (friends.some((friend) => friend.id === match.id)) return { ok: false, message: `${match.name} is already a friend.` };
    setFriends((current) => [...current, match]);
    return { ok: true, person: match };
  }

  function claimItem(itemId: string) {
    if (!currentBill || currentBill.phase !== 'editing') return;
    if (!viewingGroup.memberIds.includes(activePersonId)) return;
    const claimer = activePersonId;
    updateEditing(currentBill.groupId, (bill) => ({
      ...bill,
      items: bill.items.map((item) => item.id === itemId ? joinSplit(item, claimer) : item),
    }));
    setNotices((current) => current.filter((notice) => !(notice.kind === 'hint' && notice.itemId === itemId && notice.personId === claimer)));
  }

  function assignItem(itemId: string, personIdToAssign: string) {
    if (!currentBill || currentBill.phase !== 'editing') return 'This bill is locked.';
    if (!viewingGroup.memberIds.includes(personIdToAssign)) return 'That person is not in this group.';
    const item = currentBill.items.find((entry) => entry.id === itemId);
    if (!item) return 'That item is no longer on the bill.';
    if (item.shares.some((share) => share.personId === personIdToAssign)) return null;
    updateEditing(currentBill.groupId, (bill) => ({
      ...bill,
      items: bill.items.map((entry) => entry.id === itemId ? joinSplit(entry, personIdToAssign) : entry),
    }));
    if (personIdToAssign !== activePersonId) {
      setNotices((current) => [...current, {
        id: `${itemId}-${personIdToAssign}-${Date.now().toString(36)}`,
        personId: personIdToAssign,
        message: `${item.name} was added to your items.`,
      }]);
    }
    return null;
  }

  function hintItem(itemId: string, personIdToHint: string) {
    if (!currentBill || currentBill.phase !== 'editing') return 'This bill is locked.';
    if (personIdToHint === activePersonId) return 'Hint someone else. You can claim it yourself.';
    if (!viewingGroup.memberIds.includes(personIdToHint)) return 'That person is not in this group.';
    const item = currentBill.items.find((entry) => entry.id === itemId);
    if (!item) return 'That item is no longer on the bill.';
    setNotices((current) => [...current, {
      id: `hint-${itemId}-${personIdToHint}-${Date.now().toString(36)}`,
      personId: personIdToHint,
      itemId,
      kind: 'hint',
      message: `${item.name} was hinted for you. You can still claim it yourself.`,
    }]);
    return null;
  }

  function dismissNotice(id: string) {
    setNotices((current) => current.filter((notice) => notice.id !== id));
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

  function setPersonalTip(tipCents: number) {
    if (!currentBill || currentBill.phase !== 'editing') return 'Tips are locked after review starts.';
    if (!Number.isSafeInteger(tipCents) || tipCents < 0 || tipCents > 100000000) return 'Enter a valid tip amount.';
    const payerId = activePersonId;
    updateEditing(currentBill.groupId, bill => ({ ...bill, personalTips: { ...bill.personalTips, [payerId]: tipCents } }));
    return null;
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
    if (summary.computedTotalCents <= 0 || summary.people.some(person => person.totalCents < 0)) return 'The bill needs valid positive payment amounts.';
    const groupId = currentBill.groupId;
    setBills((current) => {
      const bill = current[groupId];
      if (!bill || bill.phase !== 'editing') return current;
      return { ...current, [groupId]: { ...bill, phase: 'review', approvals: {}, authorizedIds: [], failedPersonId: null } };
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
      return { ...current, [groupId]: { ...bill, phase: 'collecting', authorizedIds: [], failedPersonId: null } };
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
    if (activePersonId === HOST_ID && currentBill?.phase === 'funding_pending' && summary
      && everyShareAuthorized(summary, currentBill.authorizedIds)) setPhase('ready', { failedPersonId: null });
  }

  function authorizeMyShare() {
    if (!currentBill || currentBill.phase !== 'collecting' || !summary || !currentBill.approvals[activePersonId]) return;
    if (!summary.people.some(person => person.id === activePersonId && person.totalCents > 0)) return;
    const authorizedIds = [...new Set([...currentBill.authorizedIds, activePersonId])];
    setPhase(everyShareAuthorized(summary, authorizedIds) ? 'funding_pending' : 'collecting', { authorizedIds });
  }

  function simulateCollectionFailure() {
    if (activePersonId !== HOST_ID || !currentBill || currentBill.phase !== 'collecting' || !summary) return;
    const payers = summary.people.filter((person) => person.totalCents > 0).map((person) => person.id);
    const failedPersonId = [...payers].reverse().find(id => !currentBill.authorizedIds.includes(id));
    if (!failedPersonId) return;
    setPhase('failed', { failedPersonId });
  }

  function retryFailed() {
    if (currentBill?.phase === 'failed' && (activePersonId === HOST_ID || activePersonId === currentBill.failedPersonId)) setPhase('collecting', { failedPersonId: null });
  }

  function simulateMerchant() {
    if (activePersonId === HOST_ID && currentBill?.phase === 'ready') setPhase('merchant_pending');
  }

  function completeMerchant() {
    if (activePersonId !== HOST_ID || !currentBill || currentBill.phase !== 'merchant_pending' || !summary) return;
    const yours = summary.people.find((person) => person.id === HOST_ID)?.totalCents ?? 0;
    const archived: PastBill = {
      id: `paid-${currentBill.id}`,
      groupId: currentBill.groupId,
      merchant: currentBill.merchant,
      dateLabel: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      totalCents: summary.computedTotalCents,
      yourShareCents: yours,
      status: 'paid',
    };
    setPastBills((current) => [archived, ...current.filter((entry) => entry.id !== archived.id)]);
    setPhase('paid', { titleLoading: titleSharingEnabled });
    const billId = currentBill.id;
    const groupId = currentBill.groupId;
    const roster = [...viewingGroup.memberIds];
    roster.forEach(id => { latestPaidByPerson.current[id] = billId; });
    if (!titleSharingEnabled || titleRequests.current.has(currentBill.id)) return;
    const request = titleRequestForBill(currentBill.items, summary, roster);
    const controller = new AbortController();
    titleRequests.current.set(billId, controller);
    const epoch = resetEpoch.current;
    void generateMealTitles(request, controller.signal).then(result => {
      if (controller.signal.aborted || epoch !== resetEpoch.current) return;
      const titles = result.titles.map(row => {
        const index = request.members.findIndex(member => member.id === row.id);
        const id = roster[index];
        return { id, name: lookup(id).name, title: row.title, items: request.members[index].items };
      });
      const response = { ...result, titles };
      setBills(current => current[groupId]?.id === billId
        ? { ...current, [groupId]: { ...current[groupId], titleLoading: false, mealTitles: response } } : current);
      setPastBills(current => current.map(entry => entry.id === archived.id ? { ...entry, titles: response } : entry));
      setSavedTitles(current => ({ ...current, ...Object.fromEntries(titles.filter(row => latestPaidByPerson.current[row.id] === billId).map(row => [row.id, {
        title: row.title, source: result.source, usedFallback: result.usedFallback,
      }])) }));
    });
  }

  function cancelCollection() {
    if (!currentBill) return;
    if (activePersonId !== HOST_ID) return;
    if (currentBill.phase === 'editing' || currentBill.phase === 'review' || currentBill.phase === 'paid') return;
    setWalletBillId(null);
    setPhase('editing', { approvals: {}, authorizedIds: [], failedPersonId: null });
  }

  function addToWallet() {
    if (!currentBill) return;
    if (currentBill.phase !== 'ready' && currentBill.phase !== 'merchant_pending' && currentBill.phase !== 'paid') return;
    setWalletBillId(currentBill.id);
  }

  function addPayment(brand: string, last4: string) {
    const name = brand.trim().slice(0, 30);
    if (!name) return 'Enter a name for this payment type.';
    const digits = last4.replace(/\D/g, '');
    if (last4.trim() && digits.length !== 4) return 'Use 4 digits for the label, or leave it blank.';
    const id = `pay-${Date.now().toString(36)}`;
    setCards((current) => [...current, { id, brand: name, last4: digits }]);
    selectCard(id);
    return null;
  }

  function reset() {
    resetEpoch.current += 1;
    titleRequests.current.forEach(controller => controller.abort());
    titleRequests.current.clear();
    latestPaidByPerson.current = {};
    setSavedTitles({});
    setTitleSharingEnabled(true);
    setBills(seedBills());
    setGroups(seedGroups());
    setFriends(DIRECTORY.filter((person) => person.id === 'alex' || person.id === 'sam'));
    setPastBills(seedPastBills());
    setPersonId(HOST_ID);
    setViewingGroupId('fam');
    setCards(DEMO_CARDS);
    setSelectedCards({});
    setPendingReceipt(null);
    setReceiptGroupId('fam');
    setNotices([]);
    setWalletBillId(null);
  }

  const value: DemoContextValue = {
    profileName, username, friends, groups, pastBills, personId: activePersonId, you,
    viewingGroupId, viewingGroup, members, currentBill, summary, cards, selectedCard,
    linked: selectedCard !== null, pendingReceipt, receiptGroupId,
    setProfileName, setUsername, setPerson: setPersonId, selectGroup: setViewingGroupId,
    selectReceiptGroup: setReceiptGroupId,
    setLinked: (linked) => selectCard(linked ? (selectedCardId ?? 'visa') : null),
    selectCard, addPayment, setPendingReceipt, lookup, activityLabel,
    billFor: (groupId) => bills[groupId] ?? null,
    createGroup, renameGroup, addGroupMember, removeGroupMember, addFriend,
    claimItem, assignItem, hintItem, unclaimItem, customizeItem, resetItem, setSplitMode, setPersonalTip, applyVerifiedReceipt,
    startReview, reopenReview, approveShare, confirmCollect,
    simulateCollectionSuccess, authorizeMyShare, simulateCollectionFailure, retryFailed, simulateMerchant, completeMerchant, cancelCollection,
    inWallet: walletBillId !== null && walletBillId === currentBill?.id,
    addToWallet,
    dismissNotice,
    quietNotices: notices.filter((notice) => notice.personId === activePersonId),
    titleSharingEnabled, setTitleSharingEnabled,
    dismissTitle: () => setSavedTitles(current => {
      const next = { ...current };
      delete next[HOST_ID];
      return next;
    }),
    titleStorageError,
    yourTitleSource: savedTitles.you ? savedTitles.you.usedFallback ? 'Keyword fallback' : 'AI-generated food wordplay' : null,
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
  if (phase === 'funding_pending') return 'Authorized · funding pending';
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
    case 'funding_pending': return 'Funding pending';
    case 'ready': return 'Virtual card ready';
    case 'merchant_pending': return 'Merchant payment pending';
    case 'paid': return 'Payment complete';
    default: return phase;
  }
}

import { createContext, useContext, useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react';
import { Alert } from 'react-native';
import {
  claimedHalves,
  demoBillFromVerifiedReceipt,
  makeDemoBill,
  summarizeBill,
  type DemoBill,
  type ExtractedReceipt,
  type PersonId,
  type SplitMode,
  type VerifiedReceipt,
} from '@splitpool/contracts';

const DEMO_BILL = 'demo-bill';
type Phase = 'editing' | 'collecting' | 'paid';
export type PersonMethod = { methodId: DemoMethodId | null; imageUri: string | null };
function blankMethods(): Record<PersonId, PersonMethod> {
  return { you: { methodId: null, imageUri: null }, alex: { methodId: null, imageUri: null }, sam: { methodId: null, imageUri: null } };
}
type DemoContextValue = {
  bill: DemoBill; person: PersonId; mode: SplitMode; phase: Phase; linked: boolean;
  profileName: string; summary: ReturnType<typeof summarizeBill>;
  pendingReceipt: ExtractedReceipt | null;
  setPerson: (person: PersonId) => void; setMode: (mode: SplitMode) => void;
  setProfileName: (name: string) => void; setLinked: (linked: boolean) => void;
  renameGroup: (name: string) => void; setClaim: (itemId: string, halves: number) => void;
  setPendingReceipt: (draft: ExtractedReceipt | null) => void;
  applyVerifiedReceipt: (receipt: VerifiedReceipt) => void;
  pay: () => void; reset: () => void;
};
const DemoContext = createContext<DemoContextValue | null>(null);

function draftFrom(bill: DemoBill, summary: ReturnType<typeof summarizeBill>): ReviewDraft {
  const itemShares = bill.items.flatMap((item) => {
    const amounts = allocateCents(item.cents, people.map((person) => item.halves[person.id]));
    return people.flatMap((person, index) => amounts[index] > 0 ? [{ itemId: item.id, userId: person.id, cents: amounts[index] }] : []);
  });
  return {
    spenderUserId: 'you',
    merchantId: bill.merchant.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'merchant',
    merchantTotalCents: summary.total,
    itemSubtotalCents: summary.subtotal,
    feeScheduleVersion: 'demo-0',
    seats: summary.shares.map((share) => ({ seatId: share.id, userId: share.id, merchantShareCents: share.total })),
    itemShares,
  };
}

export function DemoProvider({ children }: PropsWithChildren) {
  const [bill, setBill] = useState(makeDemoBill);
  const [person, setPerson] = useState<PersonId>('you');
  const [tipChoices, setTipChoices] = useState<TipChoices>(defaultTipChoices);
  const [methods, setMethods] = useState(blankMethods);
  const [profileName, setProfileName] = useState('Jamie');
  const [pendingReceipt, setPendingReceipt] = useState<ExtractedReceipt | null>(null);
  const summary = useMemo(() => summarizeBill(bill, mode), [bill, mode]);

  useEffect(() => {
    const timer = setInterval(() => {
      const next = Date.now();
      if (ledger.tick(next)) setNow(next);
    }, 400);
    return () => clearInterval(timer);
  }, [ledger]);

  function run(action: () => void) {
    let ok = true;
    try {
      action();
      setPaymentError(null);
    } catch (error) {
      ok = false;
      setPaymentError(error instanceof Error ? error.message : 'Payment failed.');
    }
    setNow(Date.now());
    return ok;
  }

  function setClaim(itemId: string, halves: number) {
    if (phase !== 'editing') return;
    const item = bill.items.find((entry) => entry.id === itemId);
    if (!item) return;
    if (claimedHalves(item) - item.halves[person] + halves > 2) {
      Alert.alert('Already claimed', 'Clear another demo participant’s claim before taking this share.');
      return;
    }
    setBill((current) => ({ ...current, items: current.items.map((entry) => entry.id === itemId
      ? { ...entry, halves: { ...entry.halves, [person]: halves } } : entry) }));
  }

  function applyVerifiedReceipt(receipt: VerifiedReceipt) {
    if (phase !== 'editing') {
      Alert.alert('Bill locked', 'Reset the local demo before replacing the receipt.');
      return;
    }
    setBill((current) => demoBillFromVerifiedReceipt(receipt, current.groupName));
    setPendingReceipt(null);
  }

  return <DemoContext.Provider value={{
    bill, person, mode, phase, linked, profileName, summary, pendingReceipt,
    setPerson, setLinked, setProfileName, setPendingReceipt, applyVerifiedReceipt,
    setMode: (next) => { if (phase === 'editing') setMode(next); },
    renameGroup: (name) => { if (phase === 'editing' && name.trim()) setBill((current) => ({ ...current, groupName: name.trim() })); },
    setClaim,
    pay: () => { if (summary.complete && linked && phase === 'editing') setPhase('collecting'); },
    reset: () => {
      setBill(makeDemoBill());
      setPhase('editing');
      setMode('proportional');
      setPerson('you');
      setLinked(false);
      setPendingReceipt(null);
    },
  }}>{children}</DemoContext.Provider>;
}

export function useDemo() {
  const value = useContext(DemoContext);
  if (!value) throw new Error('useDemo must be inside DemoProvider');
  return value;
}

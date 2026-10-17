import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';
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

type Phase = 'editing' | 'collecting' | 'paying' | 'paid';
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

export function DemoProvider({ children }: PropsWithChildren) {
  const [bill, setBill] = useState(makeDemoBill);
  const [person, setPerson] = useState<PersonId>('you');
  const [mode, setMode] = useState<SplitMode>('proportional');
  const [phase, setPhase] = useState<Phase>('editing');
  const [linked, setLinked] = useState(false);
  const [profileName, setProfileName] = useState('Jamie');
  const [pendingReceipt, setPendingReceipt] = useState<ExtractedReceipt | null>(null);
  const summary = useMemo(() => summarizeBill(bill, mode), [bill, mode]);

  useEffect(() => {
    if (phase !== 'collecting' && phase !== 'paying') return;
    const timer = setTimeout(() => setPhase(phase === 'collecting' ? 'paying' : 'paid'), 1200);
    return () => clearTimeout(timer);
  }, [phase]);

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

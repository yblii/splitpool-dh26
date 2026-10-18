import { createContext, useContext, useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react';
import { Alert } from 'react-native';
import {
  allocateCents, claimedHalves, defaultTipChoices, demoBillFromVerifiedReceipt, makeDemoBill, PaymentLedger, people, summarizeBill,
  type BillProjection, type DemoBill, type DemoMethodId, type ExtractedReceipt, type PersonId, type ReviewDraft, type TipChoice, type TipChoices, type VerifiedReceipt,
} from '@splitpool/contracts';

const DEMO_BILL = 'demo-bill';
type Phase = 'editing' | 'collecting' | 'paid';
export type PersonMethod = { methodId: DemoMethodId | null; imageUri: string | null };
function blankMethods(): Record<PersonId, PersonMethod> {
  return { you: { methodId: null, imageUri: null }, alex: { methodId: null, imageUri: null }, sam: { methodId: null, imageUri: null } };
}
type DemoContextValue = {
  bill: DemoBill; person: PersonId; tipChoices: TipChoices; phase: Phase;
  methods: Record<PersonId, PersonMethod>;
  profileName: string; linked: boolean; summary: ReturnType<typeof summarizeBill>;
  payment: BillProjection | null; paymentError: string | null;
  pendingReceipt: ExtractedReceipt | null;
  setPerson: (person: PersonId) => void; setTipChoice: (choice: TipChoice) => void;
  setProfileName: (name: string) => void; setLinked: (linked: boolean) => void;
  setPersonMethod: (patch: Partial<PersonMethod>) => void;
  renameGroup: (name: string) => void; setClaim: (itemId: string, halves: number) => void;
  setPendingReceipt: (draft: ExtractedReceipt | null) => void;
  applyVerifiedReceipt: (receipt: VerifiedReceipt) => void;
  freezeBill: () => void; acceptShare: () => void; confirmCollection: () => void;
  authorizeShare: () => void; rememberWalletHold: (paymentIntentId: string) => void; retryShare: () => void; openCheckout: () => boolean;
  chargeRestaurant: () => void; declineCard: () => boolean; cancelPayment: () => void; reopenBill: () => void; reset: () => void;
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
  const [linked, setLinked] = useState(false);
  const [pendingReceipt, setPendingReceipt] = useState<ExtractedReceipt | null>(null);
  const [ledger, setLedger] = useState(() => new PaymentLedger({ fundingDelayMs: 1500 }));
  const [now, setNow] = useState(0);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const holdsRef = useRef<Partial<Record<PersonId, string>>>({});
  const summary = useMemo(() => summarizeBill(bill, tipChoices), [bill, tipChoices]);
  const payment = useMemo(() => ledger.peekBill(person, DEMO_BILL, now), [ledger, person, now]);
  const phase: Phase = payment?.session?.phase === 'paid' ? 'paid' : payment?.snapshotId ? 'collecting' : 'editing';

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

  const sessionId = payment?.session?.sessionId;
  async function settleHolds(action: 'cancel' | 'capture') {
    const pending = Object.entries(holdsRef.current).flatMap(([userId, paymentIntentId]) => paymentIntentId ? [[userId, paymentIntentId] as const] : []);
    if (pending.length === 0) return;
    const { releaseDemoCardHold, stripePublishableKey } = await import('../lib/cardWallet');
    if (!stripePublishableKey) return;
    await Promise.all(pending.map(([userId, paymentIntentId]) => releaseDemoCardHold(userId, paymentIntentId, action)));
    holdsRef.current = {};
  }
  return <DemoContext.Provider value={{
    bill, person, tipChoices, phase, methods, profileName, linked, summary, payment, paymentError, pendingReceipt,
    setPerson, setProfileName, setLinked, setPendingReceipt, applyVerifiedReceipt,
    setPersonMethod: (patch) => {
      const seat = payment?.session?.seats.find((entry) => entry.userId === person);
      if (seat && (seat.status === 'authorized' || seat.status === 'captured' || seat.status === 'refunded')) return;
      setMethods((current) => ({ ...current, [person]: { ...current[person], ...patch } }));
    },
    setTipChoice: (choice) => {
      if (phase !== 'editing') return;
      if (choice.kind === 'custom' && (!Number.isSafeInteger(choice.cents) || choice.cents < 0 || choice.cents > 100_000)) return;
      setTipChoices((current) => ({ ...current, [person]: choice }));
    },
    renameGroup: (name) => { if (phase === 'editing' && name.trim()) setBill((current) => ({ ...current, groupName: name.trim() })); },
    setClaim,
    freezeBill: () => {
      if (!summary.complete) return;
      if (person !== 'you') { setPaymentError('Only the host can freeze the bill.'); return; }
      run(() => ledger.review('you', DEMO_BILL, draftFrom(bill, summary), Date.now()));
    },
    acceptShare: () => run(() => ledger.accept(person, DEMO_BILL)),
    confirmCollection: () => run(() => ledger.confirm('you', DEMO_BILL, 'confirm-demo', Date.now())),
    authorizeShare: () => { if (sessionId) run(() => ledger.authorize(person, sessionId, `auth-${person}`, Date.now())); },
    rememberWalletHold: (paymentIntentId) => { holdsRef.current[person] = paymentIntentId; },
    retryShare: () => { if (sessionId) run(() => ledger.retry(person, sessionId, `retry-${person}-${Date.now()}`, Date.now())); },
    openCheckout: () => sessionId ? run(() => ledger.checkout('you', sessionId, 'checkout-demo', Date.now())) : false,
    chargeRestaurant: () => {
      void (async () => {
        try {
          await settleHolds('capture');
          if (sessionId) run(() => ledger.merchantEvent('you', sessionId, 'exact', `exact-${Date.now()}`, Date.now()));
        } catch (error) {
          setPaymentError(error instanceof Error ? error.message : 'The card hold could not be captured.');
        }
      })();
    },
    declineCard: () => {
      if (!sessionId) return false;
      void (async () => {
        try {
          await settleHolds('cancel');
          run(() => ledger.declineCard('you', sessionId, `decline-${Date.now()}`, Date.now()));
        } catch (error) {
          setPaymentError(error instanceof Error ? error.message : 'The card hold could not be canceled.');
        }
      })();
      return true;
    },
    cancelPayment: () => {
      if (!sessionId) return;
      void (async () => {
        try {
          await settleHolds('cancel');
          run(() => ledger.cancel('you', sessionId, `cancel-${Date.now()}`, Date.now()));
        } catch (error) {
          setPaymentError(error instanceof Error ? error.message : 'The card hold could not be canceled.');
        }
      })();
    },
    reopenBill: () => run(() => ledger.reopen('you', DEMO_BILL)),
    reset: () => {
      holdsRef.current = {};
      setBill(makeDemoBill()); setTipChoices(defaultTipChoices()); setPerson('you'); setMethods(blankMethods());
      setLinked(false); setPendingReceipt(null);
      setPaymentError(null); setNow(0); setLedger(new PaymentLedger({ fundingDelayMs: 1500 }));
    },
  }}>{children}</DemoContext.Provider>;
}

export function useDemo() {
  const value = useContext(DemoContext);
  if (!value) throw new Error('useDemo must be inside DemoProvider');
  return value;
}

import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Text, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams, type Href } from 'expo-router';
import {
  formatMoney,
  type BillProjection,
  type BillResponse,
  type MealTitlesResponse,
} from '@splitpool/contracts';
import { MealTitles } from '../../../components/MealTitles';
import { AppHeader, Button, Card, ErrorBanner, Screen, styles } from '../../../components/ui';
import { CardUnlock, VirtualCard } from '../../../components/VirtualCard';
import { closeBill, formatApiError, getBill, getGroup } from '../../../lib/apiClient';
import { generateMealTitles, membersFromBill } from '../../../lib/mealTitles';
import {
  acceptBillShare,
  authorizeMyContribution,
  cancelPaymentSession,
  confirmBillCollection,
  getBillPayment,
  getPaymentCard,
  openPaymentCheckout,
  reopenBillPayment,
  reviewBillPayment,
  retryMyContribution,
  simulateMerchantCharge,
} from '../../../lib/paymentApi';
import { reviewDraftFromBill } from '../../../lib/reviewDraft';
import { useAppProfile } from '../../../state/appProfile';

const phaseCopy: Record<string, string> = {
  collecting: 'Each person authorizes their own share. The card stays locked until every share is in.',
  funding_pending: 'Everyone authorized. The pooled card stays locked until this bill’s funds are spendable.',
  ready_to_pay: 'The shares are pooled. The spender can unlock the restaurant card.',
  payment_pending: 'The restaurant charge is pending on the pooled card.',
  paid: 'The restaurant was paid from the pooled card.',
  canceling: 'Canceling. Open restaurant charges stay reserved.',
  canceled: 'Collection was canceled and unused authorizations were voided.',
};

export default function BillPaymentScreen() {
  const { billId } = useLocalSearchParams<{ billId: string }>();
  const { appProfile } = useAppProfile();
  const userId = appProfile?.userId;
  const [bill, setBill] = useState<BillResponse | null>(null);
  const [hostId, setHostId] = useState<string | null>(null);
  const [groupName, setGroupName] = useState('');
  const [payment, setPayment] = useState<BillProjection | null>(null);
  const [cardLast4, setCardLast4] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [biometric, setBiometric] = useState<'idle' | 'scanning' | 'done'>('idle');
  const [mealTitles, setMealTitles] = useState<MealTitlesResponse | undefined>(undefined);
  const [mealTitlesLoading, setMealTitlesLoading] = useState(false);
  const titlesForKeyRef = useRef<string | null>(null);
  const settledRef = useRef(false);

  const session = payment?.session ?? null;
  const isHost = Boolean(userId && hostId && userId === hostId);
  const isSpender = Boolean(userId && (payment?.spenderUserId === userId || (!payment?.spenderUserId && isHost)));
  const myShare = bill && userId
    ? bill.summary.shares.find((share) => share.userId === userId)
    : undefined;
  const mine = session?.seats.find((seat) => seat.userId === userId);
  const accepted = Boolean(userId && payment?.acceptedUserIds.includes(userId));
  const payers = bill?.summary.shares.filter((share) => share.totalCents > 0) ?? [];
  const allAccepted = payers.length > 0
    && payers.every((share) => payment?.acceptedUserIds.includes(share.userId));
  const settled = session?.phase === 'paid' || bill?.state === 'PAID';

  useEffect(() => {
    settledRef.current = settled;
  }, [settled]);

  const refresh = useCallback(async () => {
    if (!billId || !userId) return;
    setMessage('');
    try {
      const nextBill = await getBill(billId);
      setBill(nextBill);
      const billClosed = nextBill.state === 'PAID' || nextBill.state === 'CANCELLED';
      // Closed groups drop out of open listings; still readable with activeBillId null.
      if (!billClosed) {
        const group = await getGroup(nextBill.groupId);
        setHostId(group.hostId);
        setGroupName(group.name);
      }
      const projection = await getBillPayment(billId, userId);
      setPayment(projection);
      const sessionId = projection?.session?.sessionId;
      if (sessionId && projection?.spenderUserId === userId && projection.session?.checkoutOpen) {
        try {
          const card = await getPaymentCard(sessionId, userId);
          setCardLast4(card.last4);
        } catch {
          setCardLast4(null);
        }
      } else {
        setCardLast4(null);
      }
    } catch (error) {
      setMessage(formatApiError(error));
    }
  }, [billId, userId]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
      const timer = setInterval(() => {
        if (AppState.currentState !== 'active') return;
        if (settledRef.current) return;
        void refresh();
      }, 2000);
      return () => clearInterval(timer);
    }, [refresh]),
  );

  const paymentPhase = session?.phase;
  const paymentSessionId = session?.sessionId;
  useEffect(() => {
    if (paymentPhase !== 'funding_pending') return;
    const timer = setTimeout(() => { void refresh(); }, 1600);
    return () => clearTimeout(timer);
  }, [paymentPhase, paymentSessionId, refresh]);

  async function closeCollaborationBill(state: 'PAID' | 'CANCELLED') {
    if (!billId) return;
    if (bill?.state === state) return;
    const next = await closeBill(billId, state);
    setBill(next);
  }

  const billState = bill?.state;
  useEffect(() => {
    if (!billId) return;
    if (paymentPhase !== 'paid' && paymentPhase !== 'canceled') return;
    if (billState === 'PAID' || billState === 'CANCELLED') return;
    const state = paymentPhase === 'paid' ? 'PAID' as const : 'CANCELLED' as const;
    let cancelled = false;
    void (async () => {
      try {
        const next = await closeBill(billId, state);
        if (!cancelled) setBill(next);
      } catch (error) {
        if (!cancelled) setMessage(formatApiError(error));
      }
    })();
    return () => { cancelled = true; };
  }, [billId, billState, paymentPhase]);

  // Generate meal titles as soon as payment is processed / bill is paid.
  useEffect(() => {
    if (!bill || !settled) return;
    const key = `${bill.id}:${paymentSessionId ?? bill.state}`;
    if (titlesForKeyRef.current === key) return;
    let cancelled = false;
    setMealTitlesLoading(true);
    void (async () => {
      const result = await generateMealTitles({
        groupName: groupName || 'Group',
        merchant: bill.merchant,
        members: membersFromBill(bill),
      });
      if (cancelled) return;
      titlesForKeyRef.current = key;
      setMealTitles(result);
      setMealTitlesLoading(false);
    })();
    return () => { cancelled = true; };
  }, [bill, groupName, paymentSessionId, settled]);

  async function run(action: () => Promise<unknown>) {
    if (!userId) return;
    setBusy(true);
    setMessage('');
    try {
      await action();
      await refresh();
    } catch (error) {
      setMessage(formatApiError(error));
    } finally {
      setBusy(false);
    }
  }

  async function onConfirmPayment() {
    if (!bill || !userId || !hostId) return;
    if (!bill.summary.complete) {
      setMessage('Every item must be claimed before payment.');
      return;
    }
    const spenderUserId = bill.summary.shares.some((share) => share.userId === hostId && share.totalCents > 0)
      ? hostId
      : (bill.summary.shares.find((share) => share.totalCents > 0)?.userId ?? hostId);
    await run(async () => {
      const draft = reviewDraftFromBill(bill, spenderUserId);
      await reviewBillPayment(bill.id, userId, draft);
    });
  }

  async function onAccept() {
    if (!billId || !userId) return;
    await run(() => acceptBillShare(billId, userId));
  }

  async function onCollect() {
    if (!billId || !userId) return;
    await run(() => confirmBillCollection(billId, userId, `confirm-${billId}-${Date.now()}`));
  }

  async function onAuthorize() {
    if (!session || !userId) return;
    await run(() => authorizeMyContribution(session.sessionId, userId, `auth-${userId}-${Date.now()}`));
  }

  async function onRetry() {
    if (!session || !userId) return;
    await run(() => retryMyContribution(session.sessionId, userId, `retry-${userId}-${Date.now()}`));
  }

  async function onCheckout() {
    if (!session || !userId) return;
    await run(() => openPaymentCheckout(session.sessionId, userId, `checkout-${session.sessionId}`));
  }

  async function onCharge() {
    if (!session || !userId || !billId) return;
    await run(async () => {
      await simulateMerchantCharge(session.sessionId, userId, 'exact', `exact-${Date.now()}`);
      await closeCollaborationBill('PAID');
    });
  }

  async function onCancel() {
    if (!session || !userId || !billId) return;
    await run(async () => {
      await cancelPaymentSession(session.sessionId, userId, `cancel-${Date.now()}`);
      await closeCollaborationBill('CANCELLED');
    });
  }

  async function onReopen() {
    if (!billId || !userId) return;
    await run(() => reopenBillPayment(billId, userId));
  }

  let title = 'Confirm Payment';
  let onPress = () => { void onConfirmPayment(); };
  let disabled = busy || !bill?.summary.complete || !isHost;

  if (!bill?.summary.complete) {
    title = 'Claim every item first';
    disabled = true;
  } else if (!payment?.snapshotId) {
    if (isHost) {
      title = 'Confirm Payment';
      onPress = () => { void onConfirmPayment(); };
      disabled = busy;
    } else {
      title = 'Waiting for host';
      disabled = true;
    }
  } else if (!session) {
    if (!accepted && (myShare?.totalCents ?? 0) > 0) {
      title = `Accept ${formatMoney(myShare!.totalCents)}`;
      onPress = () => { void onAccept(); };
      disabled = busy;
    } else if (isHost && allAccepted) {
      title = 'Collect shares';
      onPress = () => { void onCollect(); };
      disabled = busy;
    } else if (accepted) {
      title = isHost ? 'Waiting for everyone to accept' : 'Share accepted';
      disabled = true;
    } else {
      title = 'No share to accept';
      disabled = true;
    }
  } else if (mine?.status === 'pending') {
    title = `Authorize ${formatMoney(mine.approvedTotalCents)}`;
    onPress = () => { void onAuthorize(); };
    disabled = busy;
  } else if (mine?.canRetry) {
    title = 'Retry my share';
    onPress = () => { void onRetry(); };
    disabled = busy;
  } else if (session.phase === 'funding_pending') {
    title = session.funding === 'unavailable' ? 'Card locked' : 'Funding the card…';
    disabled = true;
  } else if (session.phase === 'ready_to_pay' && !session.checkoutOpen && isSpender) {
    title = biometric === 'idle' ? 'Unlock with Face ID' : 'Confirming Face ID';
    onPress = () => { if (biometric === 'idle') setBiometric('scanning'); };
    disabled = busy || biometric !== 'idle';
  } else if (session.checkoutOpen && isSpender && session.phase !== 'paid' && session.phase !== 'canceled') {
    title = 'Use Card to Pay';
    onPress = () => { void onCharge(); };
    disabled = busy || (session.spendingBlocked && session.phase !== 'payment_pending');
  } else if (session.phase === 'paid') {
    title = 'Payment complete';
    disabled = true;
  } else {
    title = 'Waiting on the group';
    disabled = true;
  }

  if (!billId || !userId) {
    return (
      <Screen header={<AppHeader title="Payment" onBack={() => router.replace('/connected')} />}>
        <Text style={styles.subtitle}>Sign in and open a bill to continue payment.</Text>
      </Screen>
    );
  }

  if (settled) {
    return (
      <Screen
        header={<AppHeader title="Complete" onBack={() => router.replace('/connected')} />}
        footer={<Button title="Return to groups" onPress={() => router.replace('/connected')} />}
      >
        <View style={{ gap: 6 }}>
          <Text style={styles.title}>Settled together.</Text>
          <Text style={styles.subheading}>
            {[groupName, bill?.merchant].filter(Boolean).join(' · ') || 'Your group'}
          </Text>
        </View>
        <ErrorBanner
          tone="success"
          title="Payment complete"
          message="This bill is closed. Meal titles are for fun and never delay checkout."
        />
        <MealTitles result={mealTitles} loading={mealTitlesLoading} />
        {!!message && <ErrorBanner message={message} />}
      </Screen>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <Screen
        header={<AppHeader title="Payment" onBack={() => router.replace({ pathname: '/bill/[billId]', params: { billId } } as Href)} />}
        footer={<>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={styles.label}>You pay</Text>
            <Text style={styles.heading}>{formatMoney(myShare?.totalCents ?? 0)}</Text>
          </View>
          <Button title={busy ? 'Working…' : title} disabled={disabled} onPress={onPress} />
          {payment?.snapshotId && !session && isHost && (
            <Button title="Reopen bill" secondary disabled={busy} onPress={() => void onReopen()} />
          )}
          {session && isHost && session.phase !== 'paid' && session.phase !== 'canceled' && (
            <Button title="Cancel collection" secondary disabled={busy} onPress={() => void onCancel()} />
          )}
          <Button
            title="Back to bill"
            secondary
            onPress={() => router.replace({ pathname: '/bill/[billId]', params: { billId } } as Href)}
          />
        </>}
      >
        <View style={{ gap: 6 }}>
          <Text style={styles.title}>Confirm payment.</Text>
          <Text style={styles.subheading}>
            {bill?.merchant || 'Bill'}
            {session ? ` · ${session.phase.replace(/_/g, ' ')}` : payment?.snapshotId ? ' · frozen' : ''}
          </Text>
        </View>

        <Card>
          <Text style={styles.heading}>Your share</Text>
          <View style={styles.row}>
            <Text style={styles.text}>Items + tax + tip</Text>
            <Text style={styles.text}>{formatMoney(myShare?.totalCents ?? 0)}</Text>
          </View>
          {payment?.snapshotId && (
            <Text style={styles.small}>
              {accepted ? 'You accepted this frozen share.' : 'Accept your share before the host collects.'}
            </Text>
          )}
        </Card>

        {payment?.snapshotId && (
          <Card>
            <Text style={styles.heading}>Group progress</Text>
            {payers.map((share) => {
              const seat = session?.seats.find((entry) => entry.userId === share.userId);
              const didAccept = payment.acceptedUserIds.includes(share.userId);
              const label = seat?.status.replace(/_/g, ' ')
                ?? (didAccept ? 'accepted' : 'waiting');
              return (
                <View key={share.userId} style={styles.row}>
                  <Text style={[styles.text, { flex: 1 }]}>
                    {bill?.participants.find((participant) => participant.userId === share.userId)?.displayName
                      ?? share.userId}
                    {share.userId === userId ? ' · you' : ''}
                  </Text>
                  <Text style={styles.small}>{label}</Text>
                </View>
              );
            })}
          </Card>
        )}

        {session && (
          <>
            <VirtualCard
              seats={session.seats}
              budgetCents={session.cardBudgetCents}
              unlocked={session.checkoutOpen}
              last4={isSpender ? cardLast4 : null}
            />
            <Text style={styles.text}>{phaseCopy[session.phase] ?? session.phase}</Text>
            {session.spendDeadlineMs && (
              <Text style={styles.small}>
                New purchases close at {new Date(session.spendDeadlineMs).toLocaleTimeString()}.
              </Text>
            )}
            {session.pendingRefundCents > 0 && (
              <Text style={styles.small}>
                {formatMoney(session.pendingRefundCents)} of principal is waiting to be refunded by share.
              </Text>
            )}
          </>
        )}

        {!!message && <ErrorBanner message={message} />}
      </Screen>

      {isSpender && session && (
        <CardUnlock
          visible={biometric === 'scanning'}
          last4={biometric === 'scanning' && session.checkoutOpen ? cardLast4 : null}
          budgetCents={session.cardBudgetCents}
          onAuthenticate={() => { void onCheckout(); }}
          onDone={() => setBiometric('done')}
        />
      )}
    </View>
  );
}

import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { demoMethods, formatMoney, isCardWallet, people, personItemLines, tipPercents, type PersonId, type TipPercent } from '@splitpool/contracts';
import { CardWalletSheet } from '../components/CardWalletSheet';
import { PaymentMethods } from '../components/PaymentMethods';
import { Button, Card, colors, DemoNote, Screen, SegmentedControl, styles } from '../components/ui';
import { CardUnlock, VirtualCard } from '../components/VirtualCard';
import { apiUrl } from '../lib/api';
import { completeDemoCardHold, openDemoCardHold, stripePublishableKey } from '../lib/cardWallet';
import { useDemo } from '../state/demo';

const phaseCopy: Record<string, string> = {
  collecting: 'Each person authorizes their own share. The card stays locked until every share is in.',
  funding_pending: 'Everyone authorized. The pooled card stays locked until this bill’s funds are spendable.',
  ready_to_pay: 'The shares are pooled. You can pay the restaurant from this bill’s card.',
  payment_pending: 'The restaurant charge is pending on the pooled card.',
  paid: 'The restaurant was paid from the pooled card.',
  canceling: 'Canceling. Open restaurant charges stay reserved.',
  canceled: 'Collection was canceled and unused authorizations were voided.',
};

export default function PaymentScreen() {
  const {
    bill, summary, tipChoices, setTipChoice, methods, phase, person, payment, paymentError,
    mealTitles, mealTitlesLoading, mealTitlesSource,
    freezeBill, acceptShare, confirmCollection, authorizeShare, rememberWalletHold, retryShare, openCheckout, chargeRestaurant, declineCard, cancelPayment, reopenBill,
  } = useDemo();
  const session = payment?.session;
  const mine = session?.seats.find((seat) => seat.userId === person);
  const myShare = summary.shares.find((share) => share.id === person);
  const accepted = payment?.acceptedUserIds.includes(person) ?? false;
  const payers = summary.shares.filter((share) => share.total > 0);
  const allAccepted = payers.every((share) => payment?.acceptedUserIds.includes(share.id));
  const name = people.find((entry) => entry.id === person)?.name ?? 'You';
  const [biometric, setBiometric] = useState<'idle' | 'scanning' | 'rising' | 'done'>('idle');
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [declineOpen, setDeclineOpen] = useState(false);
  const [openMembers, setOpenMembers] = useState<PersonId[]>([]);
  const [customDrafts, setCustomDrafts] = useState<Partial<Record<PersonId, string>>>({});
  const [walletSecret, setWalletSecret] = useState<string | null>(null);
  const [walletIntent, setWalletIntent] = useState<string | null>(null);
  const [walletBusy, setWalletBusy] = useState(false);
  const [walletError, setWalletError] = useState<string | null>(null);
  const methodId = methods[person].methodId;
  const liveWallet = Boolean(methodId && isCardWallet(methodId) && Platform.OS === 'web' && stripePublishableKey && apiUrl);
  const payLabel = person === 'you' ? 'You pay' : `${name} pays`;
  const choice = tipChoices[person];
  const customText = customDrafts[person] ?? (choice.kind === 'custom' && choice.cents > 0 ? (choice.cents / 100).toFixed(2) : '');
  const myItems = personItemLines(bill, person);
  const needsMethod = (myShare?.total ?? 0) > 0 && !methods[person].methodId;

  let title = 'Freeze bill';
  let onPress = freezeBill;
  let disabled = !summary.complete;
  if (!summary.complete) { title = 'Claim every item'; disabled = true; }
  else if (needsMethod) { title = 'Choose a payment method'; disabled = true; }
  else if (!payment?.snapshotId) {
    title = person === 'you' ? 'Freeze bill' : 'Waiting for the host';
    onPress = freezeBill;
    disabled = person !== 'you';
  } else if (!session) {
    if (!accepted) { title = `Accept ${formatMoney(myShare?.total ?? 0)}`; onPress = acceptShare; disabled = false; }
    else if (person === 'you' && allAccepted) { title = 'Collect shares'; onPress = confirmCollection; disabled = false; }
    else { title = person === 'you' ? 'Waiting for everyone to accept' : 'Share accepted'; disabled = true; }
  } else if (mine?.status === 'pending') {
    const walletName = methodId && isCardWallet(methodId) ? demoMethods.find((entry) => entry.id === methodId)?.label : null;
    title = walletBusy ? 'Opening card wallet' : `Authorize ${formatMoney(mine.approvedTotalCents)}${walletName ? ` with ${walletName}` : ''}`;
    onPress = () => { if (liveWallet) void startWallet(); else authorizeShare(); };
    disabled = walletBusy;
  } else if (mine?.canRetry) {
    title = 'Retry my share'; onPress = retryShare; disabled = false;
  } else if (session.phase === 'funding_pending') {
    title = session.funding === 'unavailable' ? 'Card locked' : 'Funding the card…'; disabled = true;
  } else if (session.phase === 'ready_to_pay' && !session.checkoutOpen && person === 'you') {
    title = biometric === 'idle' ? 'Unlock with Face ID' : 'Confirming Face ID';
    onPress = () => { if (biometric === 'idle') setBiometric('scanning'); };
    disabled = biometric !== 'idle';
  } else if (session.checkoutOpen && person === 'you' && session.phase !== 'paid' && session.phase !== 'canceled') {
    title = 'Use Card to Pay'; onPress = chargeRestaurant; disabled = session.spendingBlocked && session.phase !== 'payment_pending';
  } else if (session.phase === 'paid') {
    title = 'Demo payment complete'; disabled = true;
  } else {
    title = 'Waiting on the group'; disabled = true;
  }
  if (session?.phase === 'payment_pending' && person === 'you' && session.checkoutOpen && !session.spendingBlocked) {
    title = 'Use Card to Pay'; onPress = chargeRestaurant; disabled = false;
  }

  async function startWallet() {
    if (!mine) return;
    setWalletBusy(true);
    setWalletError(null);
    try {
      const hold = await openDemoCardHold(person, mine.approvedTotalCents, `wallet-${person}-${mine.obligationId}`);
      setWalletIntent(hold.paymentIntentId);
      setWalletSecret(hold.clientSecret);
    } catch (error) {
      setWalletError(error instanceof Error ? error.message : 'The card hold could not be opened.');
    } finally {
      setWalletBusy(false);
    }
  }

  const presentingCard = biometric === 'scanning' || biometric === 'rising';
  return <Screen overlay={session && presentingCard ? <CardUnlock visible budgetCents={session.cardBudgetCents}
    last4={person === 'you' ? payment?.card?.last4 ?? null : null}
    onAuthenticate={() => setBiometric(openCheckout() ? 'rising' : 'idle')}
    onDone={() => setBiometric('done')} /> : null} footer={<>
    {detailsOpen && <View style={local.detailsContent}>
      {summary.shares.filter((share) => share.id !== person).map((share) => {
        const open = openMembers.includes(share.id);
        return <View key={share.id} style={{ gap: 8 }}>
          <Pressable accessibilityRole="button" accessibilityLabel={`${share.name} pays ${formatMoney(share.total)}`}
            accessibilityState={{ expanded: open }} onPress={() => setOpenMembers((current) => current.includes(share.id)
              ? current.filter((id) => id !== share.id) : [...current, share.id])} style={local.detailRow}>
            <Text style={styles.text}>{share.name}</Text>
            <Text style={local.amount}>{formatMoney(share.total)}</Text>
          </Pressable>
          {open && <View style={{ gap: 8, paddingLeft: 12 }}>
            {personItemLines(bill, share.id).map((line) => <View key={line.id} style={local.detailRow}>
              <Text style={styles.small}>{line.name}</Text><Text style={styles.small}>{formatMoney(line.cents)}</Text>
            </View>)}
            <View style={local.detailRow}><Text style={styles.small}>Subtotal</Text><Text style={styles.small}>{formatMoney(share.items)}</Text></View>
            <View style={local.detailRow}><Text style={styles.small}>Tax</Text><Text style={styles.small}>{formatMoney(share.tax)}</Text></View>
            <View style={local.detailRow}><Text style={styles.small}>Tip</Text><Text style={styles.small}>{formatMoney(share.tip)}</Text></View>
          </View>}
        </View>;
      })}
    </View>}
    <Pressable accessibilityRole="button" accessibilityLabel={detailsOpen ? 'Hide breakdown' : 'Show breakdown'}
      accessibilityState={{ expanded: detailsOpen }} onPress={() => setDetailsOpen((open) => !open)}>
      <Text style={styles.text}>{detailsOpen ? 'Hide Breakdown' : 'Show Breakdown'}</Text>
    </Pressable>
    <View style={local.checkout}>
      <Text style={styles.label}>{payLabel}</Text>
      <Text style={local.total}>{formatMoney(myShare?.total ?? 0)}</Text>
    </View>
    <Button title={title} disabled={disabled} onPress={onPress} />
    {session?.checkoutOpen && person === 'you' && session.phase !== 'paid' && session.phase !== 'canceled' && session.phase !== 'canceling' && <>
      {declineOpen && <View style={{ gap: 8 }}>
        <Text style={styles.small}>The restaurant declined the card. These amounts go back, then everyone authorizes again.</Text>
        {session.seats.filter((seat) => seat.merchantShareCents > 0).map((seat) => <View key={seat.seatId} style={local.detailRow}>
          <Text style={styles.text}>{people.find((entry) => entry.id === seat.userId)?.name ?? seat.userId}</Text>
          <Text style={local.amount}>{formatMoney(seat.merchantShareCents)}</Text>
        </View>)}
      </View>}
      <Button title={declineOpen ? 'Refund and authorize again' : 'Card declined'} secondary onPress={() => {
        if (!declineOpen) { setDeclineOpen(true); return; }
        if (declineCard()) { setDeclineOpen(false); setBiometric('idle'); }
      }} />
    </>}
    {payment?.snapshotId && !session && person === 'you' && <Button title="Reopen bill" secondary onPress={reopenBill} />}
    {session && person === 'you' && session.phase !== 'paid' && session.phase !== 'canceled' && <Button title="Cancel collection" secondary onPress={cancelPayment} />}
    <DemoNote />
  </>}>
    <View style={{ gap: 10 }}>
      <Text style={styles.title}>{session?.phase === 'paid' ? 'All settled.' : 'Review your split.'}</Text>
      <Text style={styles.subtitle}>{bill.groupName} · {bill.merchant}</Text>
    </View>
    {session?.phase === 'paid' && (
      <Card>
        <Text style={styles.heading}>Meal titles</Text>
        <Text style={styles.small}>
          Positive nicknames inspired by what each person ate
          {mealTitlesSource ? ` · ${mealTitlesSource}` : ''}.
        </Text>
        {mealTitlesLoading && !mealTitles && (
          <Text accessibilityLiveRegion="polite" style={styles.small}>Crafting titles…</Text>
        )}
        {mealTitles?.map((entry) => (
          <View key={entry.id} style={local.titleBlock}>
            <View style={styles.row}>
              <Text style={[styles.text, { flex: 1 }]}>{entry.name}</Text>
              <Text style={local.titleBadge}>{entry.title}</Text>
            </View>
            <Text style={styles.small}>
              {entry.items.length ? entry.items.join(' · ') : 'No items claimed'}
            </Text>
          </View>
        ))}
        <Button title="View history" secondary onPress={() => router.push('/history')} />
      </Card>
    )}
    <View style={{ gap: 14 }}>
      {myItems.length === 0
        ? <Text style={styles.small}>No items claimed yet.</Text>
        : myItems.map((line) => <View key={line.id} style={styles.row}><Text style={[styles.text, { flex: 1 }]}>{line.name}</Text><Text style={styles.text}>{formatMoney(line.cents)}</Text></View>)}
      <View style={styles.divider} />
      <View style={styles.row}><Text style={styles.text}>Subtotal</Text><Text style={styles.text}>{formatMoney(myShare?.items ?? 0)}</Text></View>
      <View style={styles.row}><Text style={styles.text}>Tax</Text><Text style={styles.text}>{formatMoney(myShare?.tax ?? 0)}</Text></View>
    </View>
    <Card>
      <Text style={styles.heading}>{person === 'you' ? 'Your tip' : `${name}’s tip`}</Text>
      <SegmentedControl label="Tip" options={[...tipPercents.map((rate) => ({ value: String(rate), label: `${rate}%` })), { value: 'custom', label: 'Custom' }]}
        value={choice.kind === 'custom' ? 'custom' : String(choice.percent)}
        onChange={(value) => {
          if (value === 'custom') { setCustomDrafts((current) => ({ ...current, [person]: '' })); setTipChoice({ kind: 'custom', cents: 0 }); return; }
          setTipChoice({ kind: 'percent', percent: Number(value) as TipPercent });
        }} disabled={phase !== 'editing'} />
      {choice.kind === 'custom' && <TextInput accessibilityLabel="Custom tip amount" value={customText} editable={phase === 'editing'}
        keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor={colors.muted} style={styles.input}
        onChangeText={(text) => {
          const cleaned = text.replace(/[^0-9.]/g, '');
          setCustomDrafts((current) => ({ ...current, [person]: cleaned }));
          const dollars = Number(cleaned);
          setTipChoice({ kind: 'custom', cents: Number.isFinite(dollars) ? Math.max(0, Math.round(dollars * 100)) : 0 });
        }} />}
      <Text style={styles.small}>{summary.complete ? 'Tip is added to these items.' : 'Tax and tip are added once every item is claimed.'}</Text>
      {mine && <Text style={styles.small}>Share {mine.status.replace(/_/g, ' ')}</Text>}
    </Card>
    {!summary.complete && <View style={{ gap: 12 }}>
      <Text accessibilityLiveRegion="polite" style={[styles.small, { color: colors.warning }]}>Claim every item before paying. Tax and tip will be added once the split is complete.</Text>
      <Button title="Return to bill" secondary onPress={() => router.replace('/')} />
    </View>}
    {session && !presentingCard && <>
      <VirtualCard seats={session.seats} budgetCents={session.cardBudgetCents} unlocked={session.checkoutOpen}
        last4={person === 'you' ? payment?.card?.last4 ?? null : null} />
      {session.phase !== 'ready_to_pay' && <Text style={styles.text}>{phaseCopy[session.phase]}</Text>}
      {session.spendDeadlineMs && <Text style={styles.small}>New purchases close at {new Date(session.spendDeadlineMs).toLocaleTimeString()}.</Text>}
      {session.pendingRefundCents > 0 && <Text style={styles.small}>{formatMoney(session.pendingRefundCents)} of principal is waiting to be refunded by share.</Text>}
    </>}
    <Card>
      <Text style={styles.heading}>Payment method</Text>
      <PaymentMethods />
      {walletSecret && <CardWalletSheet clientSecret={walletSecret} onError={(message) => { setWalletError(message); setWalletSecret(null); }} onConfirmed={async () => {
        if (!walletIntent || !mine) return;
        await completeDemoCardHold(person, walletIntent, `wallet-${person}-${mine.obligationId}`);
        rememberWalletHold(walletIntent);
        setWalletSecret(null);
        authorizeShare();
      }} />}
    </Card>
    {(walletError || paymentError) && <Text accessibilityLiveRegion="polite" style={[styles.small, { color: colors.warning }]}>{walletError ?? paymentError}</Text>}
  </Screen>;
}

const local = StyleSheet.create({
  checkout: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  total: { color: colors.ink, fontSize: 28, fontWeight: '700', fontVariant: ['tabular-nums'], letterSpacing: -0.6 },
  amount: { color: colors.ink, fontSize: 16, fontWeight: '700', fontVariant: ['tabular-nums'] },
  detailsContent: { gap: 14, paddingBottom: 8 },
  detailRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  titleBlock: { gap: 4 },
  titleBadge: {
    color: colors.success,
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    maxWidth: '58%',
    textAlign: 'right',
  },
});

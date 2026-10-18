import { useState } from 'react';
import { Text, View } from 'react-native';
import { router } from 'expo-router';
import { formatBasisPoints, formatMoney } from '@splitpool/contracts';
import { ConfirmationDialog, PaymentStatusRow } from '../components/payment-ui';
import { PersonSwitcher } from '../components/people';
import { monoFamily } from '../fonts';
import { AppHeader, Button, Card, ErrorBanner, Screen, colors, moneyMark, styles } from '../components/ui';
import { useDemo } from '../state/demo';

export default function ConfirmScreen() {
  const demo = useDemo();
  const bill = demo.currentBill;
  const summary = demo.summary;
  const [message, setMessage] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const host = demo.personId === 'you';

  if (!bill || !summary) {
    return <Screen header={<AppHeader title="Approval" onBack={() => router.back()} />}>
      <Text style={styles.subtitle}>There is no active bill for this group.</Text>
    </Screen>;
  }

  const mine = summary.people.find((person) => person.id === demo.personId);
  const mineCents = mine?.totalCents ?? 0;
  const owes = mineCents > 0;
  const approved = !!bill.approvals[demo.personId];
  const required = summary.people.filter((person) => person.totalCents > 0);
  const waiting = required.filter((person) => !bill.approvals[person.id]);
  const myPortions = bill.items.flatMap((item) => {
    const resolution = summary.resolutions.find((entry) => entry.itemId === item.id)?.resolution;
    const portion = resolution?.portions.find((entry) => entry.personId === demo.personId && entry.cents > 0);
    return portion ? [{ item: item.name, portion }] : [];
  });

  function approve() {
    const error = demo.approveShare();
    setMessage(error ?? `You approved ${formatMoney(mineCents)}. This does not charge a card.`);
  }

  function collect() {
    const error = demo.confirmCollect();
    if (error) {
      setMessage(error);
      setAsking(false);
      return;
    }
    setAsking(false);
    router.push('/payment');
  }

  return <Screen header={<AppHeader title="Approval" onBack={() => router.back()} />}>
    <View style={{ gap: 4 }}>
      <Text style={styles.title}>{host ? 'Lock in the shares' : 'Your share'}</Text>
      <Text style={styles.subtitle}>{demo.viewingGroup.name} · {bill.merchant}</Text>
    </View>
    <PersonSwitcher people={demo.members} value={demo.personId} onChange={demo.setPerson} />
    {bill.phase === 'editing' && <ErrorBanner title="Still editing" message="The host sends the bill for approval after every item is fully allocated." />}
    <Card>
      <Text style={styles.label}>{approved ? 'Approved amount' : 'Amount to approve'}</Text>
      <Text {...moneyMark} style={{ fontFamily: monoFamily, fontSize: 36, lineHeight: 42, fontWeight: '700', color: colors.ink }}>{formatMoney(mineCents)}</Text>
      {myPortions.map(({ item, portion }) => <View key={item} style={styles.row}>
        <Text style={[styles.text, { flex: 1 }]}>{item}</Text>
        <Text style={styles.small}>{formatBasisPoints(portion.basisPoints)}</Text>
        <Text {...moneyMark} style={{ fontFamily: monoFamily, fontWeight: '700', color: colors.ink }}>{formatMoney(portion.cents)}</Text>
      </View>)}
      {myPortions.length === 0 && <Text style={styles.small}>You have not claimed any items.</Text>}
      <View style={styles.divider} />
      <View style={styles.row}><Text style={styles.text}>Subtotal</Text><Text {...moneyMark} style={[styles.text, { fontFamily: monoFamily }]}>{formatMoney(mine?.itemsCents ?? 0)}</Text></View>
      <View style={styles.row}><Text style={styles.text}>Tax</Text>{summary.itemsComplete ? <Text {...moneyMark} style={[styles.text, { fontFamily: monoFamily }]}>{formatMoney(mine?.taxCents ?? 0)}</Text> : <Text style={styles.text}>Pending</Text>}</View>
      <View style={styles.row}><Text style={styles.text}>Tip</Text>{summary.itemsComplete ? <Text {...moneyMark} style={[styles.text, { fontFamily: monoFamily }]}>{formatMoney(mine?.tipCents ?? 0)}</Text> : <Text style={styles.text}>Pending</Text>}</View>
      {(mine?.serviceCents ?? 0) > 0 && <View style={styles.row}><Text style={styles.text}>Service</Text><Text {...moneyMark} style={[styles.text, { fontFamily: monoFamily }]}>{formatMoney(mine?.serviceCents ?? 0)}</Text></View>}
      <View style={styles.row}><Text style={styles.heading}>You pay</Text><Text {...moneyMark} style={[styles.heading, { fontFamily: monoFamily }]}>{formatMoney(mineCents)}</Text></View>
    </Card>
    <Card>
      <Text style={styles.heading}>Payment method</Text>
      <Text style={styles.text}>{demo.selectedCard ? `${demo.selectedCard.brand} ···· ${demo.selectedCard.last4}` : 'No demo card selected'}</Text>
      <Text style={styles.small}>Demo cards are labels only. SplitPool does not collect a real card number here.</Text>
      {!demo.selectedCard && <Button title="Choose a demo card" secondary onPress={() => router.push('/profile')} />}
    </Card>
    {owes && bill.phase === 'review' && !approved && <Button title={`Approve my share · ${formatMoney(mineCents)}`} onPress={approve} />}
    {approved && <ErrorBanner tone="success" title="Approved" message={`${formatMoney(mineCents)} is the amount you approved. You can switch people to approve the other shares.`} />}
    {message && <ErrorBanner message={message} tone={message.startsWith('You approved') ? 'success' : 'warning'} />}
    <View style={{ gap: 4 }}>
      <Text style={styles.heading}>Approval status</Text>
      {summary.people.map((person) => {
        const member = demo.lookup(person.id);
        const status = person.totalCents <= 0 ? 'No share' : bill.approvals[person.id] ? 'Approved' : bill.phase === 'review' ? 'Waiting' : 'Not requested';
        return <PaymentStatusRow key={person.id} person={member} status={status} amountCents={person.totalCents} />;
      })}
    </View>
    {host && bill.phase === 'review' && <>
      <Text style={styles.small}>{waiting.length === 0 ? 'Everyone with a share has approved.' : `${waiting.length} ${waiting.length === 1 ? 'person is' : 'people are'} still waiting.`}</Text>
      <Button title="Confirm & collect" disabled={waiting.length > 0} onPress={() => setAsking(true)} />
      <Button title="Reopen editing" secondary onPress={() => {
        const error = demo.reopenReview();
        setMessage(error ?? 'Editing is open again. Previous approvals were cleared.');
        if (!error) router.replace('/split');
      }} />
    </>}
    {host && bill.phase !== 'editing' && bill.phase !== 'review' && <Button title="View payment" onPress={() => router.push('/payment')} />}
    <ConfirmationDialog
      visible={asking}
      amountCents={summary.computedTotalCents}
      onBack={() => setAsking(false)}
      onConfirm={collect}
    />
  </Screen>;
}

import { Text, View } from 'react-native';
import { router } from 'expo-router';
import { formatMoney } from '@splitpool/contracts';
import { PaymentStatusRow, VirtualCard } from '../components/payment-ui';
import { PersonSwitcher } from '../components/people';
import { monoFamily } from '../fonts';
import { AppHeader, Button, Card, ErrorBanner, Screen, moneyMark, styles } from '../components/ui';
import { billStatusLabel, payerStatus, useDemo } from '../state/demo';

export default function PaymentScreen() {
  const demo = useDemo();
  const bill = demo.currentBill;
  const summary = demo.summary;
  const host = demo.personId === 'you';

  if (!bill || !summary) {
    return <Screen header={<AppHeader title="Payment" onBack={() => router.back()} />}>
      <Text style={styles.subtitle}>There is no active bill for this group.</Text>
    </Screen>;
  }

  const locked = bill.phase === 'editing' || bill.phase === 'review' || bill.phase === 'collecting' || bill.phase === 'failed';
  const failedPerson = bill.failedPersonId ? demo.lookup(bill.failedPersonId) : null;
  const cardStatus = bill.phase === 'paid'
    ? 'Payment complete'
    : bill.phase === 'merchant_pending'
      ? 'Merchant payment pending'
      : bill.phase === 'ready'
        ? 'Virtual card ready'
        : bill.phase === 'failed'
          ? 'Payment failed'
          : bill.phase === 'collecting'
            ? 'Collecting payments'
            : 'Waiting for approval';
  const cardDetail = 'This picture cannot pay a merchant. No charge leaves this demo.';

  return <Screen header={<AppHeader title={bill.phase === 'paid' ? 'Complete' : 'Payment'} onBack={() => router.back()} />}>
    <View style={{ gap: 4 }}>
      <Text style={styles.title}>{bill.phase === 'paid' ? 'Demo complete' : demo.viewingGroup.name}</Text>
      <Text style={styles.subtitle}>{bill.merchant} · <Text {...moneyMark} style={{ fontFamily: monoFamily }}>{formatMoney(summary.computedTotalCents)}</Text> · {billStatusLabel(bill.phase)}</Text>
    </View>
    {bill.phase === 'paid' && <ErrorBanner tone="success" title="Nothing was charged" message={`The demo collected ${formatMoney(summary.computedTotalCents)} across ${summary.people.filter((person) => person.totalCents > 0).length} people and then stopped. No restaurant was paid.`} />}
    <VirtualCard
      locked={locked}
      amountCents={summary.computedTotalCents}
      groupName={demo.viewingGroup.name}
      status={cardStatus}
      detail={cardDetail}
    />
    <PersonSwitcher people={demo.members} value={demo.personId} onChange={demo.setPerson} />
    <View>
      <Text style={styles.heading}>Contributions</Text>
      {summary.people.map((person) => <PaymentStatusRow
        key={person.id}
        person={demo.lookup(person.id)}
        status={payerStatus(bill.phase, !!bill.approvals[person.id], bill.failedPersonId === person.id, person.totalCents > 0)}
        amountCents={person.totalCents}
      />)}
    </View>
    {bill.phase === 'failed' && failedPerson && <ErrorBanner tone="danger" title="Payment failed" message={`${failedPerson.name}'s simulated payment failed. The card stays locked. A retry does not charge anyone again, because nobody was charged.`} />}
    {host && <Card>
      <Text style={styles.heading}>Demo controls</Text>
      <Text style={styles.small}>These buttons only change the story on this screen. They do not contact a bank or a restaurant.</Text>
      {bill.phase === 'collecting' && <>
        <Button title="Simulate successful payments" onPress={demo.simulateCollectionSuccess} />
        <Button title="Simulate a failed payment" secondary onPress={demo.simulateCollectionFailure} />
      </>}
      {bill.phase === 'failed' && <Button title="Simulate retry" onPress={demo.retryFailed} />}
      {bill.phase === 'ready' && <Button title="Simulate merchant checkout" onPress={demo.simulateMerchant} />}
      {bill.phase === 'merchant_pending' && <Button title="Finish the simulated checkout" onPress={demo.completeMerchant} />}
      {bill.phase !== 'editing' && bill.phase !== 'review' && bill.phase !== 'paid' && <Button title="Cancel demo collection" secondary onPress={demo.cancelCollection} />}
      {bill.phase === 'paid' && <Button title="Back to groups" onPress={() => router.replace('/')} />}
    </Card>}
    {!host && <Text style={styles.small}>Switch to You to run the host’s simulated collection.</Text>}
    {bill.phase === 'editing' || bill.phase === 'review' ? <Button title="Return to the split" secondary onPress={() => router.push(bill.phase === 'review' ? '/confirm' : '/split')} /> : null}
  </Screen>;
}

import { Text, View } from 'react-native';
import { router } from 'expo-router';
import { formatMoney } from '@splitpool/contracts';
import { PaymentStatusRow, VirtualCard } from '../components/payment-ui';
import { PersonSwitcher } from '../components/people';
import { monoFamily } from '../fonts';
import { AppHeader, Button, Card, ErrorBanner, Screen, moneyMark, styles } from '../components/ui';
import { billStatusLabel, payerStatus, useDemo } from '../state/demo';
import { MealTitles } from '../components/MealTitles';

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

  if (bill.phase === 'paid') {
    return <Screen header={<AppHeader title="Complete" onBack={() => router.replace('/')} />}
      footer={<Button title="Return to groups" onPress={() => router.replace('/')} />}>
      <View style={{ gap: 6 }}>
        <Text style={styles.title}>Settled together.</Text>
        <Text style={styles.subheading}>{bill.merchant} · {formatMoney(summary.computedTotalCents)}</Text>
      </View>
      <ErrorBanner tone="success" title="Simulated checkout complete" message="No real card was charged and no restaurant was paid." />
      <MealTitles result={bill.mealTitles} loading={bill.titleLoading} />
      <Button title="View settled bill" secondary onPress={() => router.push({ pathname: '/history', params: { id: `paid-${bill.id}` } })} />
    </Screen>;
  }

  const locked = bill.phase === 'editing' || bill.phase === 'review' || bill.phase === 'collecting' || bill.phase === 'failed' || bill.phase === 'funding_pending';
  const myShare = summary.people.find(person => person.id === demo.personId);
  const authorized = bill.authorizedIds.includes(demo.personId);
  const failedPerson = bill.failedPersonId ? demo.lookup(bill.failedPersonId) : null;
  const cardStatus = bill.phase === 'merchant_pending'
      ? 'Merchant payment pending'
      : bill.phase === 'ready'
        ? 'Virtual card ready'
        : bill.phase === 'failed'
          ? 'Payment failed'
          : bill.phase === 'collecting'
            ? 'Collecting payments'
            : bill.phase === 'funding_pending' ? 'Funding pending' : 'Waiting for approval';
  const cardDetail = 'Simulated card and merchant. No real money moves.';

  return <Screen header={<AppHeader title="Payment" onBack={() => router.back()} />}>
    <View style={{ gap: 4 }}>
      <Text style={styles.title}>{demo.viewingGroup.name}</Text>
      <Text style={styles.subheading}>{bill.merchant} · <Text {...moneyMark} style={{ fontFamily: monoFamily, fontSize: 21, lineHeight: 26 }}>{formatMoney(summary.computedTotalCents)}</Text> · {billStatusLabel(bill.phase)}</Text>
    </View>
    <VirtualCard
      locked={locked}
      amountCents={summary.computedTotalCents}
      groupName={demo.viewingGroup.name}
      status={cardStatus}
      detail={cardDetail}
      inWallet={demo.inWallet}
      onAddToWallet={demo.addToWallet}
    />
    <PersonSwitcher people={demo.members} value={demo.personId} onChange={demo.setPerson} />
    <View>
      <Text style={styles.heading}>Contributions</Text>
      {summary.people.map((person) => <PaymentStatusRow
        key={person.id}
        person={demo.lookup(person.id)}
        status={person.totalCents > 0 && bill.phase === 'collecting' && bill.authorizedIds.includes(person.id)
          ? 'Share authorized (simulated)'
          : bill.phase === 'failed' && person.id !== bill.failedPersonId
            ? bill.authorizedIds.includes(person.id) ? 'Share authorized (simulated)' : 'Waiting to authorize'
            : payerStatus(bill.phase, !!bill.approvals[person.id], bill.failedPersonId === person.id, person.totalCents > 0)}
        amountCents={person.totalCents}
      />)}
    </View>
    {bill.phase === 'failed' && failedPerson && <ErrorBanner tone="danger" title="Payment failed" message={`${failedPerson.name}'s simulated payment failed. The card stays locked. A retry does not charge anyone again, because nobody was charged.`} />}
    {bill.phase === 'collecting' && (myShare?.totalCents ?? 0) > 0 && <Card>
      <Text style={styles.heading}>Your contribution</Text>
      <Button title={authorized ? 'Share authorized (simulated)' : `Authorize ${formatMoney(myShare?.totalCents ?? 0)} (simulated)`} disabled={authorized} onPress={demo.authorizeMyShare} />
      <Text style={styles.small}>Each diner authorizes their own approved amount. Switch participants to continue this local demo.</Text>
    </Card>}
    {bill.phase === 'funding_pending' && <ErrorBanner title="All shares authorized" message="Authorizations are not spendable funding. The card stays locked until the next simulated funding confirmation." />}
    {host && <Card>
      <Text style={styles.heading}>Demo controls</Text>
      <Text style={styles.small}>These buttons only change the story on this screen. They do not contact a bank or a restaurant.</Text>
      {bill.phase === 'collecting' && <>
        <Button title="Simulate a failed payment" secondary onPress={demo.simulateCollectionFailure} />
      </>}
      {bill.phase === 'failed' && <Button title="Simulate retry" onPress={demo.retryFailed} />}
      {bill.phase === 'funding_pending' && <Button title="Confirm simulated funding" onPress={demo.simulateCollectionSuccess} />}
      {bill.phase === 'ready' && <Button title="Simulate merchant checkout" onPress={demo.simulateMerchant} />}
      {bill.phase === 'merchant_pending' && <Button title="Finish the simulated checkout" onPress={demo.completeMerchant} />}
      {bill.phase !== 'editing' && bill.phase !== 'review' && <Button title="Cancel demo collection" secondary onPress={demo.cancelCollection} />}
    </Card>}
    {!host && <Text style={styles.small}>Switch to You to run the host’s simulated collection.</Text>}
    {bill.phase === 'editing' || bill.phase === 'review' ? <Button title="Return to the split" secondary onPress={() => router.push(bill.phase === 'review' ? '/confirm' : '/split')} /> : null}
  </Screen>;
}

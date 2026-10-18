import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { formatBasisPoints, formatMoney } from '@splitpool/contracts';
import { ConfirmationDialog, PaymentStatusRow } from '../components/payment-ui';
import { PersonSwitcher } from '../components/people';
import { BottomSheet } from '../components/sheets';
import { monoFamily } from '../fonts';
import { AppHeader, Button, Card, ErrorBanner, Screen, colors, moneyMark, styles } from '../components/ui';
import { useDemo } from '../state/demo';

export default function ConfirmScreen() {
  const demo = useDemo();
  const bill = demo.currentBill;
  const summary = demo.summary;
  const [message, setMessage] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [pickingCard, setPickingCard] = useState(false);
  const [addingCard, setAddingCard] = useState(false);
  const [cardName, setCardName] = useState('');
  const [cardLast4, setCardLast4] = useState('');
  const [cardError, setCardError] = useState<string | null>(null);
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

  function closeCards() {
    setPickingCard(false);
    setAddingCard(false);
    setCardName('');
    setCardLast4('');
    setCardError(null);
  }

  function savePayment() {
    const error = demo.addPayment(cardName, cardLast4);
    if (error) {
      setCardError(error);
      return;
    }
    closeCards();
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
    <Pressable accessibilityRole="button" accessibilityLabel="Choose a payment method" onPress={() => setPickingCard(true)}>
      <Card>
        <Text style={styles.heading}>Payment method</Text>
        <Text style={styles.text}>{demo.selectedCard ? `${demo.selectedCard.brand}${demo.selectedCard.last4 ? ` ···· ${demo.selectedCard.last4}` : ''}` : 'No demo card selected'}</Text>
        <Text style={styles.small}>Demo cards are labels only. SplitPool does not collect a real card number here.</Text>
        <Text style={styles.link}>Select</Text>
      </Card>
    </Pressable>
    <BottomSheet visible={pickingCard} title="Payment method" onClose={closeCards}>
      <Text style={styles.small}>Pick a label. This does not charge a card.</Text>
      {demo.cards.map((card) => {
        const selected = demo.selectedCard?.id === card.id;
        return <Pressable
          key={card.id}
          accessibilityRole="button"
          accessibilityState={{ selected }}
          onPress={() => { demo.selectCard(card.id); closeCards(); }}
          style={{
            minHeight: 64, borderRadius: 16, borderWidth: 1.5, paddingHorizontal: 14, paddingVertical: 12,
            borderColor: selected ? colors.primary : colors.border,
            backgroundColor: selected ? colors.light : colors.paper,
            justifyContent: 'center',
          }}
        >
          <Text style={[styles.text, { fontWeight: '700' }]}>{card.brand}</Text>
          <Text style={styles.small}>{card.last4 ? `···· ${card.last4}` : 'No number'}{selected ? ' · Selected' : ''}</Text>
        </Pressable>;
      })}
      {addingCard ? <>
        <Text style={styles.label}>Name</Text>
        <TextInput accessibilityLabel="Payment type name" value={cardName} onChangeText={setCardName} placeholder="Cash or Demo Card" placeholderTextColor={colors.muted} maxLength={30} style={styles.input} />
        <Text style={styles.label}>Last 4, optional</Text>
        <TextInput accessibilityLabel="Last 4 digits" value={cardLast4} onChangeText={setCardLast4} placeholder="4242" placeholderTextColor={colors.muted} keyboardType="number-pad" maxLength={4} style={styles.input} />
        {cardError && <ErrorBanner message={cardError} />}
        <Button title="Save payment type" onPress={savePayment} />
      </> : <Button title="Add a payment type" secondary onPress={() => { setCardError(null); setAddingCard(true); }} />}
    </BottomSheet>
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

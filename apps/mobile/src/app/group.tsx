import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { formatMoney, summarizeSplitBill } from '@splitpool/contracts';
import { AvatarStack, MemberAvatar } from '../components/people';
import { BottomSheet } from '../components/sheets';
import { ReceiptPaper } from '../components/split-ui';
import { monoFamily } from '../fonts';
import { AppHeader, Button, ErrorBanner, Screen, colors, moneyMark, styles } from '../components/ui';
import { useDemo } from '../state/demo';

export default function GroupDetailsScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const requestedId = Array.isArray(params.id) ? params.id[0] : params.id;
  const demo = useDemo();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState<string | null>(null);
  const [namedFor, setNamedFor] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const group = demo.groups.find((entry) => entry.id === (requestedId ?? demo.viewingGroupId)) ?? demo.viewingGroup;
  if (namedFor !== group.id) {
    setNamedFor(group.id);
    setName(group.name);
  }
  const groupName = name ?? group.name;
  const members = group.memberIds.map((id) => demo.lookup(id));
  const bill = demo.billFor(group.id);
  const yourShareCents = bill
    ? summarizeSplitBill({
      items: bill.items,
      taxCents: bill.taxCents,
      tipCents: bill.tipCents,
      serviceChargeCents: bill.serviceChargeCents,
      discountCents: bill.discountCents,
      printedTotalCents: bill.printedTotalCents,
    }, group.memberIds, bill.splitMode).people.find((person) => person.id === 'you')?.totalCents ?? 0
    : 0;
  const past = demo.pastBills.filter((entry) => entry.groupId === group.id);
  const availableFriends = demo.friends.filter((friend) => !group.memberIds.includes(friend.id));

  function openBill() {
    demo.selectGroup(group.id);
    if (!bill || bill.phase === 'paid') return;
    if (bill.phase === 'editing') router.push('/split');
    else if (bill.phase === 'review') router.push('/confirm');
    else router.push('/payment');
  }

  function scan() {
    demo.selectGroup(group.id);
    demo.selectReceiptGroup(group.id);
    router.push('/receipt');
  }

  return <Screen
    header={<AppHeader title={group.name} onBack={() => router.back()} right={<Pressable accessibilityRole="button" accessibilityLabel="Edit group" hitSlop={8} onPress={() => { setMessage(null); setEditing(true); }} style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 }}>
      <Text style={styles.link}>Edit</Text>
    </Pressable>} />}
    footer={<Button title="Scan now" onPress={scan} />}
  >
    <View style={[styles.row, { justifyContent: 'flex-start' }]}>
      <AvatarStack people={members} size={36} />
    </View>
    <ReceiptPaper title="Past splits">
      <View style={[styles.row, { paddingVertical: 6 }]}>
        <Text style={[styles.small, { flex: 1 }]} />
        <Text style={[styles.small, { width: 72, textAlign: 'right' }]}>Total</Text>
        <Text style={[styles.small, { width: 72, textAlign: 'right' }]}>You pay</Text>
      </View>
      {bill && bill.phase !== 'paid' && <Pressable accessibilityRole="button" accessibilityLabel={`Continue ${bill.merchant}, total ${formatMoney(bill.printedTotalCents)}, you pay ${formatMoney(yourShareCents)}`} onPress={openBill} style={splitRow}>
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <Text style={[styles.text, { fontWeight: '700' }]} numberOfLines={1}>{bill.merchant}</Text>
        </View>
        <Text {...moneyMark} style={money}>{formatMoney(bill.printedTotalCents)}</Text>
        <Text {...moneyMark} style={money}>{formatMoney(yourShareCents)}</Text>
      </Pressable>}
      {past.length === 0 && !bill && <Text style={styles.small}>No earlier bills yet.</Text>}
      {past.map((entry) => <Pressable
        key={entry.id}
        accessibilityRole="button"
        accessibilityLabel={`${entry.merchant}, total ${formatMoney(entry.totalCents)}, you paid ${formatMoney(entry.yourShareCents)}`}
        onPress={() => router.push({ pathname: '/history', params: { id: entry.id } })}
        style={splitRow}
      >
        <Text style={[styles.text, { flex: 1 }]} numberOfLines={1}>{entry.merchant}</Text>
        <Text {...moneyMark} style={money}>{formatMoney(entry.totalCents)}</Text>
        <Text {...moneyMark} style={money}>{formatMoney(entry.yourShareCents)}</Text>
      </Pressable>)}
    </ReceiptPaper>

    <BottomSheet visible={editing} title="Edit group" onClose={() => setEditing(false)} footer={<Button title="Done" onPress={() => setEditing(false)} />}>
      <Text style={styles.label}>Group name</Text>
      <TextInput accessibilityLabel="Group name" value={groupName} onChangeText={setName} style={styles.input} maxLength={40} />
      <Button title="Save name" compact onPress={() => setMessage(demo.renameGroup(group.id, groupName) ?? 'Name saved on this device.')} />
      <Text style={styles.label}>Members</Text>
      {members.map((member) => <View key={member.id} style={[styles.row, { minHeight: 48 }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
          <MemberAvatar person={member} size={32} />
          <Text style={styles.text}>{member.name}</Text>
        </View>
        {member.id !== 'you' && <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${member.name}`} hitSlop={8} onPress={() => setMessage(demo.removeGroupMember(group.id, member.id) ?? `${member.name} was removed from this demo group.`)}>
          <Text style={[styles.link, { color: colors.danger }]}>Remove</Text>
        </Pressable>}
      </View>)}
      {availableFriends.length > 0 && <Text style={styles.label}>Add a friend</Text>}
      {availableFriends.map((friend) => <Pressable key={friend.id} accessibilityRole="button" onPress={() => setMessage(demo.addGroupMember(group.id, friend.id) ?? `${friend.name} was added. No invite was sent.`)} style={{ minHeight: 44, justifyContent: 'center' }}>
        <Text style={styles.link}>Add {friend.name}</Text>
      </Pressable>)}
      <Text style={styles.small}>Adding someone here only updates the local demo.</Text>
      {message && <ErrorBanner tone={message.includes('locked') || message.includes('Enter') || message.includes('friend first') ? 'warning' : 'success'} message={message} />}
    </BottomSheet>
  </Screen>;
}

const splitRow = { minHeight: 48, flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8, borderTopWidth: 1, borderStyle: 'dashed' as const, borderColor: '#E4D5C2' };
const money = { fontFamily: monoFamily, width: 80, textAlign: 'right' as const, color: colors.ink, fontWeight: '700' as const };

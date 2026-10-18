import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { formatMoney } from '@splitpool/contracts';
import { AvatarStack, MemberAvatar } from '../components/people';
import { BottomSheet } from '../components/sheets';
import { AppHeader, Button, Card, ErrorBanner, Screen, colors, styles } from '../components/ui';
import { billStatusLabel, useDemo } from '../state/demo';

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
    footer={<Button title="New bill" onPress={scan} />}
  >
    <View style={{ gap: 8 }}>
      <Text style={styles.title}>{group.name}</Text>
      <View style={[styles.row, { justifyContent: 'flex-start' }]}>
        <AvatarStack people={members} size={36} />
        <Text style={styles.subtitle}>{members.length} {members.length === 1 ? 'member' : 'members'}</Text>
      </View>
    </View>
    <Button title="Add member" secondary onPress={() => { setMessage(null); setEditing(true); }} />

    {bill && bill.phase !== 'paid' && <Pressable accessibilityRole="button" onPress={openBill} style={({ pressed }) => [{ opacity: pressed ? 0.86 : 1 }]}>
      <Card>
        <Text style={styles.label}>Continue</Text>
        <Text style={styles.heading}>{bill.phase === 'editing' ? 'Continue splitting' : bill.phase === 'review' ? 'Review approvals' : 'View payment'}</Text>
        <Text style={styles.text}>{bill.merchant}</Text>
        <Text style={styles.small}>{billStatusLabel(bill.phase)} · {formatMoney(bill.printedTotalCents)}</Text>
      </Card>
    </Pressable>}

    <View style={{ gap: 10 }}>
      <Text style={styles.heading}>Previous bills</Text>
      {past.length === 0 && <Text style={styles.small}>No earlier bills for this group.</Text>}
      {past.map((entry) => <Pressable
        key={entry.id}
        accessibilityRole="button"
        accessibilityLabel={`${entry.merchant}, ${entry.dateLabel}, paid`}
        onPress={() => router.push({ pathname: '/history', params: { id: entry.id } })}
        style={{ backgroundColor: colors.paper, borderRadius: 18, borderWidth: 1, borderColor: colors.border, padding: 14, gap: 4 }}
      >
        <View style={styles.row}>
          <Text style={[styles.text, { fontWeight: '700', flex: 1 }]}>{entry.merchant}</Text>
          <Text style={styles.small}>{entry.dateLabel}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.small}>Group total {formatMoney(entry.totalCents)}</Text>
          <Text style={styles.small}>You paid {formatMoney(entry.yourShareCents)}</Text>
        </View>
        <Text style={[styles.small, { color: colors.success, fontWeight: '700' }]}>Paid</Text>
      </Pressable>)}
    </View>

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

import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { claimedHalves, demoMethodLabel, formatMoney, people } from '@splitpool/contracts';
import { Button, Card, colors, DemoNote, Screen, SegmentedControl, styles } from '../components/ui';
import { useDemo } from '../state/demo';

export default function GroupScreen() {
  const { bill, summary, person, setPerson, setClaim, phase, renameGroup, methods } = useDemo();
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(bill.groupName);
  const currentShare = summary.shares.find((share) => share.id === person)!;
  const completedItems = bill.items.length - summary.unclaimed;

  return <Screen footer={<>
    <View style={styles.row}>
      <Text style={styles.label}>{person === 'you' ? 'Your share' : `${currentShare.name}’s share`}{!summary.complete ? ' · items only' : ''}</Text>
      <Text style={local.share}>{formatMoney(currentShare.total)}</Text>
    </View>
    <Button title={phase === 'paid' ? 'View payment' : 'Review split'} onPress={() => router.push('/payment')} />
    <DemoNote />
  </>}>
    <View style={{ gap: 10 }}>
      <View style={styles.row}>
        <Text style={styles.label}>Your group</Text>
        <Pressable accessibilityRole="button" accessibilityState={{ disabled: phase !== 'editing' }} disabled={phase !== 'editing'}
          hitSlop={12} onPress={() => setRenaming(!renaming)}><Text style={styles.link}>{renaming ? 'Cancel' : 'Edit group'}</Text></Pressable>
      </View>
      <Text style={styles.title}>{bill.groupName}</Text>
      <Text style={styles.subtitle}>{bill.merchant} · {people.length} people</Text>
    </View>
    {renaming && <Card>
      <TextInput accessibilityLabel="Group name" value={name} onChangeText={setName} style={styles.input} maxLength={60} />
      <Button title="Save group name" disabled={!name.trim()} onPress={() => { renameGroup(name); setRenaming(false); }} />
    </Card>}
    <View style={local.totalRow}>
      <View style={{ gap: 5 }}><Text style={styles.label}>Bill total</Text><Text style={local.total}>{formatMoney(summary.total)}</Text></View>
      <View style={{ gap: 5, alignItems: 'flex-end' }}>
        <Text style={[styles.label, { color: phase === 'paid' ? colors.success : colors.primary }]}>{phase === 'paid' ? 'Demo paid' : `${completedItems} of ${bill.items.length} claimed`}</Text>
        <View style={local.progressTrack}><View style={[local.progressFill, { width: `${completedItems / Math.max(bill.items.length, 1) * 100}%` }]} /></View>
      </View>
    </View>
    <View style={{ gap: 12 }}>
      <Text style={styles.label}>Claiming as · demo participants</Text>
      <SegmentedControl label="Claiming as" options={people.map((entry) => ({ value: entry.id, label: entry.name }))} value={person} onChange={setPerson} />
      <Pressable accessibilityRole="button" accessibilityLabel="Choose a payment method" onPress={() => router.push('/profile')} hitSlop={8}>
        <Text style={methods[person].methodId ? styles.small : styles.link}>{methods[person].methodId ? demoMethodLabel(methods[person].methodId) : 'Add a payment method'}</Text>
      </Pressable>
    </View>
    <View>
      <View style={[styles.row, { paddingBottom: 8 }]}>
        <Text style={styles.heading}>Choose your items</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Add a receipt" hitSlop={12} onPress={() => router.push('/receipt')}><Text style={styles.link}>Receipt ↗</Text></Pressable>
      </View>
      <Text style={styles.small}>Select the share you want to cover.</Text>
      {bill.items.map((item) => <View key={item.id} style={local.item}>
        <View style={styles.row}><Text style={local.itemName}>{item.name}</Text><Text style={local.price}>{formatMoney(item.cents)}</Text></View>
        <View style={styles.row}>
          <Text style={[styles.small, { flex: 1 }]}>{people.filter((entry) => item.halves[entry.id] > 0).map((entry) => `${entry.name} ${item.halves[entry.id] === 2 ? 'all' : '½'}`).join(' · ') || 'No claims yet'}</Text>
          <Text style={[styles.label, { color: claimedHalves(item) === 2 ? colors.success : colors.warning }]}>
            {claimedHalves(item) === 2 ? 'Claimed' : `${(2 - claimedHalves(item)) / 2 * 100}% available`}
          </Text>
        </View>
        <SegmentedControl label={item.name} options={[{ label: 'None', value: 0 }, { label: 'Half', value: 1 }, { label: 'All mine', value: 2 }]}
          value={item.halves[person]} onChange={(value) => setClaim(item.id, value)} disabled={phase !== 'editing'} />
      </View>)}
    </View>
    <Text accessibilityLiveRegion="polite" style={[styles.small, { color: summary.complete ? colors.success : colors.warning }]}>
      {summary.complete ? 'Every item is accounted for. Ready to review.' : `${summary.unclaimed} ${summary.unclaimed === 1 ? 'item needs' : 'items need'} a claim before payment.`}
    </Text>
  </Screen>;
}

const local = StyleSheet.create({
  totalRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 20, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.border, gap: 12 },
  total: { color: colors.ink, fontSize: 34, lineHeight: 41, letterSpacing: -0.8, fontWeight: '700', fontVariant: ['tabular-nums'] },
  share: { color: colors.ink, fontSize: 20, fontWeight: '700', fontVariant: ['tabular-nums'] },
  progressTrack: { height: 3, width: 94, backgroundColor: colors.border, marginTop: 5 },
  progressFill: { height: 3, backgroundColor: colors.primary },
  item: { paddingVertical: 22, borderBottomWidth: 1, borderColor: colors.border, gap: 12 },
  itemName: { flex: 1, color: colors.ink, fontSize: 16, lineHeight: 23, letterSpacing: 0.4, fontWeight: '800', textTransform: 'uppercase' },
  price: { color: colors.ink, fontSize: 16, lineHeight: 23, fontWeight: '700', fontVariant: ['tabular-nums'] },
});

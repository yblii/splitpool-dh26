import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { formatMoney } from '@splitpool/contracts';
import { Button, Card, colors, DemoNote, Screen, SegmentedControl, styles } from '../components/ui';
import { useDemo } from '../state/demo';

export default function PaymentScreen() {
  const { bill, summary, mode, setMode, linked, phase, pay } = useDemo();
  const busy = phase === 'collecting' || phase === 'paying';
  return <Screen footer={<>
    <Button title={phase === 'paid' ? 'Demo payment complete ✓' : phase === 'collecting' ? 'Collecting shares…' : phase === 'paying' ? 'Paying merchant…' : !linked ? 'Add payment method' : 'Simulate payment'}
      disabled={!summary.complete || busy || phase === 'paid'} onPress={() => linked ? pay() : router.push('/profile')} />
    <DemoNote />
  </>}>
    <View style={{ gap: 10 }}>
      <Text style={styles.title}>{phase === 'paid' ? 'All settled.' : 'Review your split.'}</Text>
      <Text style={styles.subtitle}>{phase === 'paid' ? 'Your demo payment is complete.' : `${bill.groupName} · ${bill.merchant}`}</Text>
    </View>
    <View style={local.totalRow}>
      <Text style={styles.label}>Bill total</Text><Text style={local.total}>{formatMoney(summary.total)}</Text>
    </View>
    <Card>
      <Text style={styles.heading}>Tax & tip</Text>
      <SegmentedControl label="Tax and tip split" options={[{ value: 'proportional', label: 'By item share' }, { value: 'equal', label: 'Split equally' }]}
        value={mode} onChange={setMode} disabled={phase !== 'editing'} />
      <Text style={styles.small}>{mode === 'equal' ? 'Tax and tip are shared equally across all three people.' : 'Tax and tip follow each person’s share of the items.'}</Text>
    </Card>
    <View>
      <Text style={styles.heading}>Who pays what</Text>
      {summary.shares.map((share) => <View key={share.id} style={local.person}>
        <View style={styles.row}><Text style={local.name}>{share.name}</Text><Text style={local.amount}>{formatMoney(share.total)}</Text></View>
        <Text style={styles.small}>{formatMoney(share.items)} items{summary.complete ? ` + ${formatMoney(share.tax)} tax + ${formatMoney(share.tip)} tip` : ' · tax and tip pending'}</Text>
      </View>)}
    </View>
    {!summary.complete && <View style={{ gap: 12 }}>
      <Text accessibilityLiveRegion="polite" style={[styles.small, { color: colors.warning }]}>Claim every item before paying. Tax and tip will be added once the split is complete.</Text>
      <Button title="Return to bill" secondary onPress={() => router.replace('/')} />
    </View>}
    <Card>
      <Text style={styles.heading}>Payment method</Text>
      <View style={styles.row}><Text style={styles.text}>{linked ? 'Demo Visa ···· 4242' : 'No method selected'}</Text>
        <Pressable onPress={() => router.push('/profile')} accessibilityRole="button" hitSlop={12}
          style={{ paddingVertical: 12 }}><Text style={styles.link}>Manage</Text></Pressable></View>
      <Text style={styles.small}>Alex and Sam are demo participants. Payment is simulated; no card is charged.</Text>
    </Card>
  </Screen>;
}

const local = StyleSheet.create({
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.border, paddingVertical: 22, gap: 12 },
  total: { color: colors.ink, fontSize: 34, fontWeight: '700', fontVariant: ['tabular-nums'], letterSpacing: -0.8 },
  person: { borderBottomWidth: 1, borderColor: colors.border, paddingVertical: 22, gap: 6 },
  name: { fontSize: 18, letterSpacing: 0.8, color: colors.ink, fontWeight: '800', textTransform: 'uppercase' },
  amount: { color: colors.ink, fontSize: 21, fontWeight: '700', fontVariant: ['tabular-nums'] },
});

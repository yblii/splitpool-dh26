import { useState } from 'react';
import { Text, View } from 'react-native';
import { router } from 'expo-router';
import { formatBasisPoints, formatMoney, itemVisualState, type SplitBlocker } from '@splitpool/contracts';
import { PersonSwitcher } from '../components/people';
import { ProgressMeter } from '../components/split-ui';
import { AppHeader, Button, Card, ErrorBanner, Screen, SegmentedControl, colors, styles } from '../components/ui';
import { useDemo } from '../state/demo';

const STATE_LABEL = {
  unclaimed: 'Unclaimed',
  single: 'Claimed',
  equal: 'Split equally',
  custom: 'Custom split',
  incomplete: 'Partly allocated',
  error: 'Invalid split',
} as const;

function blockerCopy(blocker: SplitBlocker) {
  if (blocker.kind === 'unclaimed') return `${blocker.itemName} is unclaimed.`;
  if (blocker.kind === 'incomplete') return `${blocker.itemName} still has ${formatBasisPoints(blocker.remainderBasisPoints)} open.`;
  if (blocker.kind === 'overallocated') return `${blocker.itemName}: ${blocker.message}`;
  return `The receipt adds up to ${formatMoney(blocker.computedCents)}, but the printed total is ${formatMoney(blocker.printedCents)}.`;
}

export default function OverviewScreen() {
  const demo = useDemo();
  const bill = demo.currentBill;
  const summary = demo.summary;
  const [message, setMessage] = useState<string | null>(null);
  const viewer = summary?.people.find((person) => person.id === demo.personId);
  const host = demo.personId === 'you';

  if (!bill || !summary) {
    return <Screen header={<AppHeader title="Overview" onBack={() => router.back()} />}>
      <Text style={styles.subtitle}>There is no active bill for this group.</Text>
    </Screen>;
  }

  function send() {
    const error = demo.startReview();
    if (error) setMessage(error);
    else router.push('/confirm');
  }

  return <Screen
    header={<AppHeader title="Overview" onBack={() => router.back()} />}
    footer={bill.phase === 'editing' ? <Button title={host ? 'Send for approval' : 'Waiting on the host'} disabled={!host || !summary.readyToFinalize} onPress={send} /> : <Button title="Open approval" onPress={() => router.push('/confirm')} />}
  >
    <View style={{ gap: 4 }}>
      <Text style={styles.title}>{bill.merchant}</Text>
      <Text style={styles.subtitle}>{demo.viewingGroup.name}</Text>
    </View>
    <Card>
      <View style={styles.row}>
        <View>
          <Text style={styles.label}>{summary.itemsComplete ? 'Your total' : 'Your items'}</Text>
          <Text style={{ fontSize: 28, fontWeight: '700', color: colors.ink, fontVariant: ['tabular-nums'] }}>{formatMoney(viewer?.totalCents ?? 0)}</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={styles.label}>Group total</Text>
          <Text style={{ fontSize: 18, fontWeight: '700', color: colors.ink, fontVariant: ['tabular-nums'] }}>{formatMoney(summary.computedTotalCents)}</Text>
        </View>
      </View>
      <ProgressMeter value={summary.fullyAllocated} total={summary.itemCount} />
      {summary.readyToFinalize && <ErrorBanner tone="success" title="Ready" message="Every item is fully allocated and the totals match." />}
    </Card>
    {summary.blockers.length > 0 && <View style={{ gap: 8 }}>
      {summary.blockers.map((blocker, index) => <ErrorBanner key={`${blocker.kind}-${index}`} message={blockerCopy(blocker)} />)}
    </View>}
    {message && <ErrorBanner message={message} />}
    <PersonSwitcher people={demo.members} value={demo.personId} onChange={demo.setPerson} />
    <Card>
      <Text style={styles.heading}>Tax and tip</Text>
      <SegmentedControl
        label="Tax and tip split"
        options={[{ value: 'proportional', label: 'By items' }, { value: 'equal', label: 'Equally' }]}
        value={bill.splitMode}
        disabled={bill.phase !== 'editing'}
        onChange={demo.setSplitMode}
      />
      <Text style={styles.small}>{bill.splitMode === 'equal'
        ? 'Tax and tip are shared equally by people who claimed something.'
        : 'Tax and tip follow each person’s share of the items.'}</Text>
    </Card>
    <View style={{ gap: 10 }}>
      <Text style={styles.heading}>Items</Text>
      {bill.items.map((item) => {
        const resolution = summary.resolutions.find((entry) => entry.itemId === item.id)?.resolution;
        if (!resolution) return null;
        const visual = itemVisualState(resolution);
        const tone = visual === 'incomplete' || visual === 'unclaimed' || visual === 'error' ? colors.warning : colors.success;
        return <View key={item.id} style={{ backgroundColor: colors.paper, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 14, gap: 4 }}>
          <View style={styles.row}>
            <Text style={[styles.text, { fontWeight: '700', flex: 1 }]}>{item.name}</Text>
            <Text style={{ fontWeight: '700', color: colors.ink, fontVariant: ['tabular-nums'] }}>{formatMoney(item.cents)}</Text>
          </View>
          <Text style={{ color: tone, fontWeight: '700', fontSize: 13 }}>{STATE_LABEL[visual]}</Text>
          <Text style={styles.small}>{resolution.portions.length === 0
            ? 'No claims yet'
            : resolution.portions.map((portion) => `${demo.lookup(portion.personId).name} ${formatBasisPoints(portion.basisPoints)}`).join(' · ')}</Text>
        </View>;
      })}
    </View>
    {!host && bill.phase === 'editing' && <Text style={styles.small}>You can claim items. The host sends the finished bill for approval.</Text>}
  </Screen>;
}

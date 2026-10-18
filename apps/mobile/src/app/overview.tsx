import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { formatBasisPoints, formatMoney, itemVisualState, type SplitBlocker } from '@splitpool/contracts';
import { PersonSwitcher } from '../components/people';
import { ProgressMeter } from '../components/split-ui';
import { monoFamily } from '../fonts';
import { AppHeader, Button, Card, ErrorBanner, FadingNotice, ReadyReviewNote, Screen, SegmentedControl, colors, moneyMark, styles } from '../components/ui';
import { useDemo } from '../state/demo';
import { moneyInputToCents } from '../lib/demoWorkflow';

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
  const [hintFor, setHintFor] = useState<string | null>(null);
  const [tipDraft, setTipDraft] = useState<{ personId: string; value: string } | null>(null);
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
    footer={<View style={{ gap: 10 }}>
      {demo.quietNotices.map((notice) => <FadingNotice key={notice.id} id={notice.id} message={notice.message} onDismiss={demo.dismissNotice} />)}
      {bill.phase === 'editing'
        ? <Button title={host ? 'Send for approval' : 'Waiting on the host'} disabled={!host || !summary.readyToFinalize} onPress={send} />
        : <Button title="Open approval" onPress={() => router.push('/confirm')} />}
    </View>}
  >
    <View style={{ gap: 4 }}>
      <Text style={styles.title}>{bill.merchant}</Text>
      <Text style={styles.subheading}>{demo.viewingGroup.name}</Text>
    </View>
    <Card>
      <View style={styles.row}>
        <View>
          <Text style={styles.label}>{summary.itemsComplete ? 'Your total' : 'Your items'}</Text>
          <Text {...moneyMark} style={{ fontFamily: monoFamily, fontSize: 28, fontWeight: '700', color: colors.ink }}>{formatMoney(viewer?.totalCents ?? 0)}</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={styles.label}>Group total</Text>
          <Text {...moneyMark} style={{ fontFamily: monoFamily, fontSize: 18, fontWeight: '700', color: colors.ink }}>{formatMoney(summary.computedTotalCents)}</Text>
        </View>
      </View>
      <ProgressMeter
        value={summary.fullyAllocated}
        total={summary.itemCount}
        partial={summary.resolutions.filter((entry) => entry.resolution.status === 'incomplete').length}
      />
      {summary.itemsComplete && <ReadyReviewNote />}
    </Card>
    {summary.blockers.length > 0 && <View style={{ gap: 8 }}>
      {summary.blockers.map((blocker, index) => {
        const itemId = 'itemId' in blocker ? blocker.itemId : null;
        const unclaimed = blocker.kind === 'unclaimed';
        return <View key={`${blocker.kind}-${itemId ?? index}`} style={{ gap: 8 }}>
          <View style={[styles.banner, { backgroundColor: colors.warningSoft, flexDirection: 'row', alignItems: 'flex-start', gap: 10 }]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={itemId ? `Open ${blockerCopy(blocker)}` : blockerCopy(blocker)}
              disabled={!itemId}
              onPress={() => itemId && router.push({ pathname: '/split', params: { item: itemId, open: String(Date.now()) } })}
              style={{ flex: 1 }}
            >
              <Text style={[styles.bannerBody, { color: colors.warning }]}>{blockerCopy(blocker)}</Text>
            </Pressable>
            {unclaimed && bill.phase === 'editing' && itemId && <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: hintFor === itemId }}
              accessibilityLabel={hintFor === itemId ? `Close hints for ${blocker.itemName}` : `Hint someone about ${blocker.itemName}`}
              onPress={() => setHintFor(hintFor === itemId ? null : itemId)}
              hitSlop={8}
            >
              <Text style={hintToggle}>{hintFor === itemId ? 'Close' : 'Hint'}</Text>
            </Pressable>}
            {unclaimed && bill.phase === 'editing' && <Pressable accessibilityRole="button" accessibilityLabel={`Claim ${blocker.itemName}`} onPress={() => demo.claimItem(blocker.itemId)} hitSlop={6}>
              <Text style={styles.link}>Claim</Text>
            </Pressable>}
          </View>
          {unclaimed && bill.phase === 'editing' && itemId && hintFor === itemId && <View style={hintMenu}>
            <Text style={hintNote}>Pick who to hint. They still choose whether to claim it.</Text>
            {demo.members.filter((person) => person.id !== demo.personId).map((person) => <Pressable
              key={person.id}
              accessibilityRole="button"
              accessibilityLabel={`Hint ${person.name} about ${blocker.itemName}`}
              onPress={() => {
                const error = demo.hintItem(itemId, person.id);
                setMessage(error ?? `Hinted ${person.name} about ${blocker.itemName}. They can still claim it.`);
                if (!error) setHintFor(null);
              }}
              style={hintPerson}
            >
              <Text style={{ color: person.color, fontWeight: '700', fontSize: 14 }}>{person.name}</Text>
            </Pressable>)}
          </View>}
        </View>;
      })}
    </View>}
    {message && <ErrorBanner message={message} />}
    <PersonSwitcher people={demo.members} value={demo.personId} onChange={demo.setPerson} />
    <Card>
      <Text style={styles.heading}>Your optional tip</Text>
      <Text style={styles.small}>Only you pay this amount. It is added to any tip already printed on the receipt.</Text>
      <TextInput accessibilityLabel="Your optional tip amount" keyboardType="decimal-pad" editable={bill.phase === 'editing'}
        value={tipDraft?.personId === demo.personId ? tipDraft.value : ((bill.personalTips[demo.personId] ?? 0) / 100).toFixed(2)}
        onChangeText={value => setTipDraft({ personId: demo.personId, value })} style={styles.input} />
      <Button title="Save my tip" secondary disabled={bill.phase !== 'editing'} onPress={() => {
        const value = tipDraft?.personId === demo.personId ? tipDraft.value : ((bill.personalTips[demo.personId] ?? 0) / 100).toFixed(2);
        const cents = moneyInputToCents(value);
        setMessage(cents === null ? 'Enter a tip in dollars with up to two decimal places.' : demo.setPersonalTip(cents) ?? 'Your tip was saved.');
        if (cents !== null) setTipDraft(null);
      }} />
    </Card>
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
        const done = visual === 'single' || visual === 'equal' || visual === 'custom';
        const unclaimed = visual === 'unclaimed';
        const fill = done ? colors.ink : unclaimed ? '#C45C28' : null;
        const tone = visual === 'incomplete' || visual === 'error' ? colors.warning : colors.success;
        return <Pressable
          key={item.id}
          accessibilityRole="button"
          accessibilityLabel={`Open ${item.name}, ${STATE_LABEL[visual]}`}
          onPress={() => router.push({ pathname: '/split', params: { item: item.id, open: String(Date.now()) } })}
          style={{
            backgroundColor: fill ?? colors.paper,
            borderRadius: 16, borderWidth: 1, borderColor: fill ?? colors.border, padding: 14, gap: 4,
          }}
        >
          <View style={styles.row}>
            <Text style={[styles.text, { fontWeight: '700', flex: 1, color: fill ? '#FFFFFF' : colors.ink }]}>{item.name}</Text>
            <Text {...moneyMark} style={{ fontFamily: monoFamily, fontWeight: '700', color: fill ? '#FFFFFF' : colors.ink }}>{formatMoney(item.cents)}</Text>
          </View>
          {visual !== 'single' && resolution.portions.length === 0 && <Text style={{ color: fill ? '#FFFFFF' : tone, fontWeight: '700', fontSize: 13 }}>{STATE_LABEL[visual]}</Text>}
          <View style={styles.row}>
            <Text style={[styles.small, { flex: 1 }, fill && { color: 'rgba(255,255,255,0.82)' }]}>{resolution.portions.length === 0
              ? 'No claims yet'
              : resolution.portions.map((portion) => `${demo.lookup(portion.personId).name} ${formatBasisPoints(portion.basisPoints)}`).join(' · ')}</Text>
            {visual !== 'single' && resolution.portions.length > 0 && <Text style={{ color: fill ? '#FFFFFF' : tone, fontWeight: '700', fontSize: 13 }}>{STATE_LABEL[visual]}</Text>}
          </View>
        </Pressable>;
      })}
    </View>
    {!host && bill.phase === 'editing' && <Text style={styles.small}>You can claim items. The host sends the finished bill for approval.</Text>}
  </Screen>;
}

const hintToggle = { color: colors.muted, fontSize: 12, lineHeight: 16, fontWeight: '600' as const };
const hintMenu = {
  alignSelf: 'flex-end' as const, width: 220, borderWidth: 1, borderColor: colors.border,
  borderRadius: 12, backgroundColor: colors.paper, overflow: 'hidden' as const,
};
const hintNote = { color: colors.muted, fontSize: 11, lineHeight: 15, paddingHorizontal: 10, paddingTop: 8, paddingBottom: 6 };
const hintPerson = {
  minHeight: 36, justifyContent: 'center' as const, paddingHorizontal: 10,
  borderTopWidth: 1, borderTopColor: colors.border,
};

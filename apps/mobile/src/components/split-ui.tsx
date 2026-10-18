import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, PanResponder, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import {
  formatBasisPoints,
  formatMoney,
  FULL_SPLIT_BASIS_POINTS,
  itemVisualState,
  percentInputToBasisPoints,
  resolveItemSplit,
  setCustomShare,
  type ItemResolution,
  type ItemVisualState,
  type SplitLine,
} from '@splitpool/contracts';
import { MemberAvatar, type AvatarPerson } from './people';
import { BottomSheet } from './sheets';
import { Button, colors, styles, useReduceMotion } from './ui';

const STATE_LABEL: Record<ItemVisualState, string> = {
  unclaimed: 'Unclaimed',
  single: 'Claimed',
  equal: 'Split equally',
  custom: 'Custom',
  incomplete: 'Incomplete',
  error: 'Needs a fix',
};

function personColor(people: AvatarPerson[], id: string) {
  return people.find((person) => person.id === id)?.color ?? colors.muted;
}

function personName(people: AvatarPerson[], id: string) {
  return people.find((person) => person.id === id)?.name ?? 'Someone';
}

export function SplitProgressBar({ segments }: {
  segments: { key: string; basisPoints: number; color: string; label: string }[];
}) {
  const reduceMotion = useReduceMotion();
  const visible = segments.filter((segment) => segment.basisPoints > 0);
  return <View
    accessibilityLabel={visible.map((segment) => `${segment.label} ${formatBasisPoints(segment.basisPoints)}`).join(', ') || 'Nothing allocated'}
    style={barStyles.track}
  >
    {visible.map((segment) => <BarSegment
      key={segment.key}
      percent={(segment.basisPoints / FULL_SPLIT_BASIS_POINTS) * 100}
      color={segment.color}
      reduceMotion={reduceMotion}
    />)}
  </View>;
}

function BarSegment({ percent, color, reduceMotion }: { percent: number; color: string; reduceMotion: boolean }) {
  const [width] = useState(() => new Animated.Value(percent));
  useEffect(() => {
    if (reduceMotion) {
      width.setValue(percent);
      return;
    }
    Animated.timing(width, {
      toValue: percent, duration: 280, easing: Easing.out(Easing.cubic), useNativeDriver: false,
    }).start();
  }, [percent, reduceMotion, width]);
  return <Animated.View style={{
    height: '100%',
    backgroundColor: color,
    width: width.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] }),
  }} />;
}

export function ProgressMeter({ value, total }: { value: number; total: number }) {
  const percent = total === 0 ? 0 : Math.min(100, (value / total) * 100);
  const done = total > 0 && value === total;
  return <View style={{ gap: 6 }}>
    <View style={barStyles.meterTrack}>
      <View style={[barStyles.meterFill, { width: `${percent}%`, backgroundColor: done ? colors.success : colors.primary }]} />
    </View>
    <Text style={[styles.small, { color: done ? colors.success : colors.muted }]}>
      {value} of {total} items fully allocated
    </Text>
  </View>;
}

export function MoneyText({ cents, style }: { cents: number; style?: object }) {
  const reduceMotion = useReduceMotion();
  const [scale] = useState(() => new Animated.Value(1));
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (reduceMotion) return;
    scale.setValue(1.08);
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, friction: 7, tension: 140 }).start();
  }, [cents, reduceMotion, scale]);
  return <Animated.Text style={[{ transform: [{ scale }] }, style]}>{formatMoney(cents)}</Animated.Text>;
}

const cardMotion = new Map<string, { editable: boolean; reduceMotion: boolean; dragging: boolean }>();

function motionFor(id: string) {
  const existing = cardMotion.get(id);
  if (existing) return existing;
  const created = { editable: true, reduceMotion: false, dragging: false };
  cardMotion.set(id, created);
  return created;
}

function createItemPan(
  motion: { editable: boolean; reduceMotion: boolean; dragging: boolean },
  translateX: Animated.Value,
) {
  return PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesture) => motion.editable && Math.abs(gesture.dx) > 14 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.2,
    onPanResponderGrant: () => { motion.dragging = false; },
    onPanResponderMove: (_, gesture) => {
      if (Math.abs(gesture.dx) > 8) motion.dragging = true;
      translateX.setValue(Math.min(0, Math.max(-108, gesture.dx)));
    },
    onPanResponderRelease: (_, gesture) => {
      const swiped = Math.abs(gesture.dx) > 8;
      motion.dragging = swiped;
      Animated.timing(translateX, {
        toValue: gesture.dx < -52 ? -100 : 0,
        duration: motion.reduceMotion ? 0 : 160,
        useNativeDriver: true,
      }).start();
      if (swiped) setTimeout(() => { motion.dragging = false; }, 80);
    },
  });
}

export function ReceiptItemCard({
  item, resolution, people, viewerId, editable, onClaim, onCustomize, onLeave,
}: {
  item: SplitLine;
  resolution: ItemResolution;
  people: AvatarPerson[];
  viewerId: string;
  editable: boolean;
  onClaim: () => void;
  onCustomize: () => void;
  onLeave: () => void;
}) {
  const reduceMotion = useReduceMotion();
  const motion = motionFor(item.id);
  motion.editable = editable;
  motion.reduceMotion = reduceMotion;
  const [translateX] = useState(() => new Animated.Value(0));
  const visual = itemVisualState(resolution);
  const mine = resolution.portions.find((portion) => portion.personId === viewerId);
  const signature = `${visual}:${resolution.portions.map((portion) => `${portion.personId}:${portion.basisPoints}`).join('|')}`;
  const [flash] = useState(() => new Animated.Value(0));
  const seen = useRef(signature);

  useEffect(() => {
    if (seen.current === signature) return;
    seen.current = signature;
    if (reduceMotion) return;
    flash.setValue(1);
    Animated.timing(flash, { toValue: 0, duration: 420, useNativeDriver: false }).start();
  }, [flash, reduceMotion, signature]);

  const [pan] = useState(() => createItemPan(motionFor(item.id), translateX));

  const segments = [
    ...resolution.portions.filter((portion) => portion.basisPoints > 0).map((portion) => ({
      key: portion.personId,
      basisPoints: portion.basisPoints,
      color: personColor(people, portion.personId),
      label: personName(people, portion.personId),
    })),
    ...(resolution.remainderBasisPoints > 0 ? [{
      key: 'open',
      basisPoints: resolution.remainderBasisPoints,
      color: '#E7C9A4',
      label: 'Unallocated',
    }] : []),
  ];

  const backgroundColor = flash.interpolate({
    inputRange: [0, 1],
    outputRange: [colors.paper, visual === 'incomplete' || visual === 'error' ? '#FBF4EA' : '#E7F6EE'],
  });

  return <View style={cardStyles.shell}>
    {editable && <View style={cardStyles.reveal}>
      <Pressable accessibilityRole="button" accessibilityLabel={`Customize ${item.name}`} onPress={onCustomize} style={cardStyles.revealButton}>
        <Text style={cardStyles.revealText}>Customize</Text>
      </Pressable>
    </View>}
    <Animated.View style={{ transform: [{ translateX }] }} {...(editable ? pan.panHandlers : {})}>
      <Animated.View style={[cardStyles.card, visual === 'incomplete' && cardStyles.incomplete, visual === 'error' && cardStyles.error, { backgroundColor }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={mine
            ? `${item.name}, ${formatMoney(item.cents)}, your share ${formatMoney(mine.cents)}`
            : `${item.name}, ${formatMoney(item.cents)}, unclaimed. Tap to claim.`}
          accessibilityHint={editable ? 'Swipe left to customize your percentage.' : undefined}
          disabled={!editable}
          onPress={() => {
            if (motion.dragging) return;
            if (!mine) onClaim();
          }}
          style={{ gap: 10 }}
        >
          <View style={styles.row}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={cardStyles.name}>{item.name}</Text>
              <Text style={styles.small}>{item.quantity > 1 ? `Qty ${item.quantity}` : 'Qty 1'}</Text>
            </View>
            <Text style={cardStyles.price}>{formatMoney(item.cents)}</Text>
          </View>
          <View style={styles.row}>
            <View style={cardStyles.statePill}>
              <Text style={cardStyles.stateText}>{STATE_LABEL[visual]}</Text>
            </View>
            {resolution.portions.length > 0 ? <View style={{ flexDirection: 'row' }}>
              {resolution.portions.map((portion, index) => {
                const person = people.find((entry) => entry.id === portion.personId);
                return person ? <View key={portion.personId} style={{ marginLeft: index === 0 ? 0 : -6 }}>
                  <AppearingAvatar person={person} />
                </View> : null;
              })}
            </View> : <Text style={styles.small}>Tap to claim</Text>}
          </View>
          <SplitProgressBar segments={segments} />
          {resolution.portions.length === 0 ? <Text style={styles.small}>No one has claimed this yet.</Text> : resolution.portions.map((portion) => {
            const person = people.find((entry) => entry.id === portion.personId);
            return <View key={portion.personId} style={styles.row}>
              <Text style={[cardStyles.portionName, { color: person?.color ?? colors.ink }]}>{person?.name ?? 'Someone'}</Text>
              <Text style={cardStyles.portionMeta}>{formatBasisPoints(portion.basisPoints)} · {portion.mode === 'custom' ? 'Custom' : 'Auto'}</Text>
              <Text style={cardStyles.portionMoney}>{formatMoney(portion.cents)}</Text>
            </View>;
          })}
          {resolution.remainderBasisPoints > 0 && <Text style={[styles.small, { color: colors.warning }]}>
            {formatBasisPoints(resolution.remainderBasisPoints)} unallocated · {formatMoney(resolution.unallocatedCents)} still open
          </Text>}
          {resolution.status === 'overallocated' && <Text style={[styles.small, { color: colors.danger }]}>{resolution.message}</Text>}
          {resolution.status === 'complete' && resolution.message && visual === 'custom' && resolution.portions.some((portion) => portion.basisPoints === 0) &&
            <Text style={[styles.small, { color: colors.warning }]}>{resolution.message}</Text>}
        </Pressable>
        {editable && mine && <View style={[styles.row, { justifyContent: 'flex-start', gap: 16 }]}>
          <Pressable accessibilityRole="button" hitSlop={8} onPress={onCustomize}><Text style={styles.link}>Customize</Text></Pressable>
          <Pressable accessibilityRole="button" hitSlop={8} onPress={onLeave}><Text style={[styles.link, { color: colors.danger }]}>Remove my claim</Text></Pressable>
        </View>}
      </Animated.View>
    </Animated.View>
  </View>;
}

function AppearingAvatar({ person }: { person: AvatarPerson }) {
  const reduceMotion = useReduceMotion();
  const [opacity] = useState(() => new Animated.Value(reduceMotion ? 1 : 0));
  const [scale] = useState(() => new Animated.Value(reduceMotion ? 1 : 0.7));
  useEffect(() => {
    if (reduceMotion) {
      opacity.setValue(1);
      scale.setValue(1);
      return;
    }
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, friction: 6 }),
    ]).start();
  }, [opacity, reduceMotion, scale]);
  return <Animated.View style={{ opacity, transform: [{ scale }] }}>
    <MemberAvatar person={person} size={26} />
  </Animated.View>;
}

export function CustomSplitSheet({
  item, people, roster, viewerId, visible, onClose, onSave, onReset, onLeave,
}: {
  item: SplitLine | null;
  people: AvatarPerson[];
  roster: readonly string[];
  viewerId: string;
  visible: boolean;
  onClose: () => void;
  onSave: (basisPoints: number) => string | null;
  onReset: () => void;
  onLeave: () => void;
}) {
  const shareKey = item?.shares.map((share) => `${share.personId}:${share.mode}:${share.basisPoints ?? ''}`).join('|') ?? '';
  const openKey = visible && item ? `${item.id}:${shareKey}:${viewerId}:${roster.join(',')}` : '';
  const [form, setForm] = useState({ openKey: '', text: '0', draftBp: 0, error: null as string | null });
  if (visible && item && form.openKey !== openKey) {
    const resolution = resolveItemSplit(item, roster);
    const mine = resolution.portions.find((portion) => portion.personId === viewerId);
    const basisPoints = mine?.basisPoints ?? 0;
    setForm({ openKey, text: formatBasisPoints(basisPoints).replace('%', ''), draftBp: basisPoints, error: null });
  }
  const text = form.text;
  const draftBp = form.draftBp;
  const error = form.error;
  function setText(value: string) { setForm((current) => ({ ...current, text: value })); }
  function setDraftBp(value: number) { setForm((current) => ({ ...current, draftBp: value })); }
  function setError(value: string | null) { setForm((current) => ({ ...current, error: value })); }

  const otherCustom = item?.shares
    .filter((share) => share.personId !== viewerId && share.mode === 'custom')
    .reduce((sum, share) => sum + (share.basisPoints ?? 0), 0) ?? 0;
  const maxBp = FULL_SPLIT_BASIS_POINTS - otherCustom;

  const preview = useMemo(() => {
    if (!item) return null;
    const result = setCustomShare(item, viewerId, draftBp);
    if (result.error || !result.line) return null;
    return resolveItemSplit(result.line, roster);
  }, [draftBp, item, roster, viewerId]);

  function applyText(value: string) {
    setText(value);
    const parsed = percentInputToBasisPoints(value);
    if ('error' in parsed) {
      setError(parsed.error);
      return;
    }
    if (parsed.basisPoints > maxBp) {
      setError(`${formatBasisPoints(maxBp)} is still open after the other custom shares.`);
      return;
    }
    setError(null);
    setDraftBp(parsed.basisPoints);
  }

  function save() {
    const parsed = percentInputToBasisPoints(text);
    if ('error' in parsed) {
      setError(parsed.error);
      return;
    }
    const message = onSave(parsed.basisPoints);
    if (message) setError(message);
    else onClose();
  }

  const incomplete = preview?.status === 'incomplete';

  return <BottomSheet
    visible={visible && !!item}
    title={item ? item.name : 'Customize'}
    onClose={onClose}
    footer={<View style={{ gap: 8 }}>
      <Button title="Save" onPress={save} disabled={!!error} />
      <Button title="Cancel" secondary onPress={onClose} />
    </View>}
  >
    {item && <>
      <Text style={styles.subtitle}>{formatMoney(item.cents)} total. Your percentage stays fixed. Everyone on Auto splits what is left.</Text>
      {otherCustom > 0 && <Text style={styles.small}>Other custom shares already use {formatBasisPoints(otherCustom)}. You can take up to {formatBasisPoints(maxBp)}.</Text>}
      <PercentSlider value={draftBp} max={maxBp} onChange={(basisPoints) => applyText(formatBasisPoints(basisPoints).replace('%', ''))} />
      <View style={{ gap: 6 }}>
        <Text style={styles.label}>Your percentage</Text>
        <TextInput
          accessibilityLabel="Your percentage"
          keyboardType="decimal-pad"
          value={text}
          onChangeText={applyText}
          style={styles.input}
        />
      </View>
      {error && <Text accessibilityLiveRegion="polite" style={{ color: colors.danger, fontSize: 14, lineHeight: 20 }}>{error}</Text>}
      {incomplete && preview?.message && !error && <Text style={{ color: colors.warning, fontSize: 14, lineHeight: 20 }}>{preview.message} You can save it, and the bill stays unfinished.</Text>}
      <View style={{ gap: 8 }}>
        {(preview?.portions ?? []).map((portion) => {
          const person = people.find((entry) => entry.id === portion.personId);
          const isViewer = portion.personId === viewerId;
          return <View key={portion.personId} style={sheetRow.row}>
            {person && <MemberAvatar person={person} size={32} />}
            <View style={{ flex: 1 }}>
              <Text style={styles.text}>{person?.name ?? 'Someone'}{isViewer ? ' · you' : ''}</Text>
              <Text style={styles.small}>{portion.mode === 'custom' ? 'Custom' : 'Auto'}{!isViewer && portion.mode === 'custom' ? ' · only they can change this' : ''}</Text>
            </View>
            <Text style={sheetRow.money}>{formatBasisPoints(portion.basisPoints)} · {formatMoney(portion.cents)}</Text>
          </View>;
        })}
        {(preview?.remainderBasisPoints ?? 0) > 0 && <Text style={[styles.small, { color: colors.warning }]}>
          Unallocated {formatBasisPoints(preview?.remainderBasisPoints ?? 0)} · {formatMoney(preview?.unallocatedCents ?? 0)}
        </Text>}
      </View>
      <View style={[styles.row, { justifyContent: 'flex-start', gap: 16 }]}>
        <Pressable accessibilityRole="button" hitSlop={8} onPress={onReset}><Text style={styles.link}>Reset to equal split</Text></Pressable>
        <Pressable accessibilityRole="button" hitSlop={8} onPress={() => { onLeave(); onClose(); }}><Text style={[styles.link, { color: colors.danger }]}>Remove my claim</Text></Pressable>
      </View>
    </>}
  </BottomSheet>;
}

function PercentSlider({ value, max, onChange }: { value: number; max: number; onChange: (basisPoints: number) => void }) {
  const width = useRef(1);
  function fromX(locationX: number) {
    const ratio = Math.min(1, Math.max(0, locationX / width.current));
    const raw = Math.round((ratio * FULL_SPLIT_BASIS_POINTS) / 50) * 50;
    onChange(Math.min(max, Math.max(0, raw)));
  }
  const shown = Math.min(value, max);
  return <View
    accessibilityRole="adjustable"
    accessibilityLabel="Your percentage"
    accessibilityValue={{ min: 0, max: Math.round(max / 100), now: Math.round(shown / 100), text: formatBasisPoints(shown) }}
    accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
    onAccessibilityAction={(event) => {
      if (event.nativeEvent.actionName === 'increment') onChange(Math.min(max, shown + 100));
      if (event.nativeEvent.actionName === 'decrement') onChange(Math.max(0, shown - 100));
    }}
    onLayout={(event) => { width.current = event.nativeEvent.layout.width || 1; }}
    onStartShouldSetResponder={() => true}
    onMoveShouldSetResponder={() => true}
    onResponderGrant={(event) => fromX(event.nativeEvent.locationX)}
    onResponderMove={(event) => fromX(event.nativeEvent.locationX)}
    style={barStyles.sliderHit}
  >
    <View style={barStyles.sliderTrack}>
      <View style={[barStyles.sliderFill, { width: `${(shown / FULL_SPLIT_BASIS_POINTS) * 100}%` }]} />
      <View style={[barStyles.sliderCap, { left: `${(max / FULL_SPLIT_BASIS_POINTS) * 100}%` }]} />
    </View>
  </View>;
}

export function BillSummary({
  yourLabel, yourCents, totalCents, allocated, count, actionLabel, onAction, note,
}: {
  yourLabel: string;
  yourCents: number;
  totalCents: number;
  allocated: number;
  count: number;
  actionLabel: string;
  onAction: () => void;
  note?: string;
}) {
  return <View style={{ gap: 10 }}>
    <View style={styles.row}>
      <View style={{ gap: 2 }}>
        <Text style={styles.label}>{yourLabel}</Text>
        <MoneyText cents={yourCents} style={summaryStyles.yours} />
      </View>
      <View style={{ gap: 2, alignItems: 'flex-end' }}>
        <Text style={styles.label}>Bill total</Text>
        <Text style={summaryStyles.bill}>{formatMoney(totalCents)}</Text>
      </View>
    </View>
    <ProgressMeter value={allocated} total={count} />
    {note ? <Text style={styles.small}>{note}</Text> : null}
    <Button title={actionLabel} onPress={onAction} />
  </View>;
}

const barStyles = StyleSheet.create({
  track: { height: 12, borderRadius: 999, overflow: 'hidden', backgroundColor: colors.border, flexDirection: 'row' },
  meterTrack: { height: 8, borderRadius: 999, backgroundColor: colors.border, overflow: 'hidden' },
  meterFill: { height: '100%', borderRadius: 999 },
  sliderHit: { minHeight: 44, justifyContent: 'center' },
  sliderTrack: { height: 10, borderRadius: 999, backgroundColor: colors.border, overflow: 'hidden' },
  sliderFill: { height: '100%', backgroundColor: colors.primary },
  sliderCap: { position: 'absolute', top: 0, bottom: 0, width: 2, marginLeft: -1, backgroundColor: colors.warning },
});

const cardStyles = StyleSheet.create({
  shell: { borderRadius: 20, overflow: 'hidden', backgroundColor: colors.primary },
  reveal: { position: 'absolute', right: 0, top: 0, bottom: 0, width: 100, alignItems: 'center', justifyContent: 'center' },
  revealButton: { minWidth: 88, minHeight: 64, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  revealText: { color: '#FFFFFF', fontWeight: '700', fontSize: 13, textAlign: 'center' },
  card: { borderRadius: 20, borderWidth: 1, borderColor: colors.border, padding: 14, gap: 10 },
  incomplete: { borderColor: '#E3C39A' },
  error: { borderColor: '#E7B4B4' },
  name: { color: colors.ink, fontSize: 17, lineHeight: 22, fontWeight: '700' },
  price: { color: colors.ink, fontSize: 17, lineHeight: 22, fontWeight: '700', fontVariant: ['tabular-nums'] },
  statePill: { backgroundColor: colors.subtle, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  stateText: { color: colors.ink, fontSize: 12, lineHeight: 16, fontWeight: '700' },
  portionName: { flex: 1, fontSize: 14, lineHeight: 18, fontWeight: '700' },
  portionMeta: { color: colors.muted, fontSize: 13, lineHeight: 18 },
  portionMoney: { width: 72, textAlign: 'right', color: colors.ink, fontSize: 14, fontWeight: '700', fontVariant: ['tabular-nums'] },
});

const sheetRow = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 },
  money: { color: colors.ink, fontSize: 13, lineHeight: 18, fontWeight: '700', fontVariant: ['tabular-nums'], textAlign: 'right' },
});

const summaryStyles = StyleSheet.create({
  yours: { color: colors.ink, fontSize: 28, lineHeight: 34, fontWeight: '700', fontVariant: ['tabular-nums'] },
  bill: { color: colors.ink, fontSize: 18, lineHeight: 24, fontWeight: '700', fontVariant: ['tabular-nums'] },
});

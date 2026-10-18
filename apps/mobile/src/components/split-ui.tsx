import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Animated, Easing, PanResponder, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
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
import { monoFamily } from '../fonts';
import { MemberAvatar, type AvatarPerson } from './people';
import { BottomSheet } from './sheets';
import { Button, colors, moneyMark, styles, useReduceMotion } from './ui';

const STATE_LABEL: Record<ItemVisualState, string> = {
  unclaimed: 'Unclaimed',
  single: 'Claimed',
  equal: 'Split equally',
  custom: 'Custom',
  incomplete: 'Incomplete',
  error: 'Needs a fix',
};

function claimStatus(visual: ItemVisualState, resolution: ItemResolution, viewerId: string, quantity: number) {
  const qty = quantity > 1 ? ` · Qty ${quantity}` : '';
  if (visual === 'unclaimed' || resolution.portions.length === 0) return { lead: `Unclaimed${qty}`, money: '', tail: '' };
  const portion = resolution.portions.find((entry) => entry.personId === viewerId) ?? resolution.portions[0];
  const name = visual === 'single' ? 'Claimed' : STATE_LABEL[visual];
  if (!portion) return { lead: `${name}${qty}`, money: '', tail: '' };
  return { lead: `${name}, ${formatBasisPoints(portion.basisPoints)}, `, money: formatMoney(portion.cents), tail: qty };
}

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
  return <Animated.Text {...moneyMark} style={[{ transform: [{ scale }] }, style]}>{formatMoney(cents)}</Animated.Text>;
}

const RECEIPT_PAPER = '#FFFDF8';

const cardMotion = new Map<string, { editable: boolean; reduceMotion: boolean; dragging: boolean; openPercent: () => void }>();

function motionFor(id: string) {
  const existing = cardMotion.get(id);
  if (existing) return existing;
  const created = { editable: true, reduceMotion: false, dragging: false, openPercent: () => {} };
  cardMotion.set(id, created);
  return created;
}

function createItemPan(
  motion: { editable: boolean; reduceMotion: boolean; dragging: boolean; openPercent: () => void },
  translateX: Animated.Value,
) {
  return PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesture) => motion.editable && gesture.dx < -10 && Math.abs(gesture.dx) > Math.abs(gesture.dy),
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: () => { motion.dragging = false; },
    onPanResponderMove: (_, gesture) => {
      if (gesture.dx < -8) motion.dragging = true;
      translateX.setValue(Math.min(0, Math.max(-132, gesture.dx)));
    },
    onPanResponderRelease: (_, gesture) => {
      const open = gesture.dx < -56 || gesture.vx < -0.4;
      motion.dragging = Math.abs(gesture.dx) > 8;
      Animated.timing(translateX, {
        toValue: 0,
        duration: motion.reduceMotion ? 0 : 160,
        useNativeDriver: true,
      }).start();
      if (open && motion.editable) motion.openPercent();
      if (motion.dragging) setTimeout(() => { motion.dragging = false; }, 120);
    },
  });
}

export function ReceiptPaper({ title, dimTitle, alert, children }: {
  title: string;
  dimTitle?: boolean;
  alert?: string | null;
  children: ReactNode;
}) {
  return <View style={paperStyles.body}>
    {title ? <Text style={[paperStyles.title, dimTitle && paperStyles.dimmed]}>{title}</Text> : null}
    {title ? <View style={paperStyles.rule} /> : null}
    {children}
    {alert ? <View accessibilityLiveRegion="polite" style={paperStyles.alert}>
      <Text style={paperStyles.alertMark}>!</Text>
      <Text style={paperStyles.alertText}>{alert}</Text>
    </View> : null}
  </View>;
}

function shareMark(count: number, custom: boolean, basisPoints: number) {
  if (count <= 1) return '✓';
  if (custom) return formatBasisPoints(basisPoints);
  return `1/${count}`;
}

function claimLabel(name: string, count: number, mine: boolean, custom: boolean, basisPoints: number) {
  if (count === 0) return `Claim ${name}`;
  if (!mine) return count === 1
    ? `${name} is claimed. Tap to claim your share.`
    : `${name} split ${shareMark(count, false, 0)}. Tap to claim your share.`;
  if (count === 1) return `${name}, claimed. Tap to remove your claim.`;
  return `${name} split ${shareMark(count, custom, basisPoints)}. Tap to remove your claim.`;
}

export function ReceiptItemCard({
  item, resolution, people, roster, viewerId, editable, faded, percentOpen, expanded, emphasized = false,
  onClaim, onOpen, onEditPercent, onSavePercent, onCancelPercent, onLeave,
}: {
  item: SplitLine;
  resolution: ItemResolution;
  people: AvatarPerson[];
  roster: readonly string[];
  viewerId: string;
  editable: boolean;
  faded: boolean;
  percentOpen: boolean;
  expanded: boolean;
  emphasized?: boolean;
  onClaim: () => void;
  onOpen: () => void;
  onEditPercent: () => void;
  onSavePercent: (basisPoints: number) => string | null;
  onCancelPercent: () => void;
  onLeave: () => void;
}) {
  const reduceMotion = useReduceMotion();
  const motion = motionFor(item.id);
  motion.editable = editable && !percentOpen;
  motion.reduceMotion = reduceMotion;
  motion.openPercent = onEditPercent;
  const [translateX] = useState(() => new Animated.Value(0));
  const [fade] = useState(() => new Animated.Value(faded ? 0.22 : 1));
  const visual = itemVisualState(resolution);
  const mine = resolution.portions.find((portion) => portion.personId === viewerId);
  const signature = `${visual}:${resolution.portions.map((portion) => `${portion.personId}:${portion.basisPoints}`).join('|')}`;
  const [flash] = useState(() => new Animated.Value(0));
  const seen = useRef(signature);
  const draftKey = percentOpen ? `${item.id}:${viewerId}:${mine?.basisPoints ?? 'new'}` : '';
  const [draft, setDraft] = useState({ key: '', text: '', error: '' });
  if (percentOpen && draft.key !== draftKey) {
    setDraft({
      key: draftKey,
      text: mine ? formatBasisPoints(mine.basisPoints).replace('%', '') : '',
      error: '',
    });
  }

  useEffect(() => {
    if (seen.current === signature) return;
    seen.current = signature;
    if (reduceMotion) return;
    flash.setValue(1);
    Animated.timing(flash, { toValue: 0, duration: 420, useNativeDriver: false }).start();
  }, [flash, reduceMotion, signature]);

  useEffect(() => {
    Animated.timing(fade, {
      toValue: faded ? 0.22 : 1,
      duration: reduceMotion ? 0 : 180,
      useNativeDriver: true,
    }).start();
  }, [fade, faded, reduceMotion]);

  const [pan] = useState(() => createItemPan(motionFor(item.id), translateX));
  const text = draft.text;
  const fieldError = draft.error;
  const preview = useMemo(() => {
    if (!percentOpen) return null;
    const parsed = percentInputToBasisPoints(text);
    if ('error' in parsed) return null;
    const result = setCustomShare(item, viewerId, parsed.basisPoints);
    if (result.error || !result.line) return null;
    const next = resolveItemSplit(result.line, roster);
    return next.portions.find((portion) => portion.personId === viewerId) ?? null;
  }, [item, percentOpen, roster, text, viewerId]);

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
  const hatch = resolution.portions.length > 0
    ? resolution.portions.map((portion) => personColor(people, portion.personId))
    : ['#E4D8C8'];
  const payers = resolution.portions.map((portion) => personName(people, portion.personId)).join(', ');
  const status = claimStatus(visual, resolution, viewerId, item.quantity);

  function commitPercent() {
    const next = percentInputToBasisPoints(text);
    if ('error' in next) {
      setDraft((current) => ({ ...current, error: next.error }));
      return;
    }
    const message = onSavePercent(next.basisPoints);
    if (message) setDraft((current) => ({ ...current, error: message }));
  }

  return <View style={[cardStyles.shell, emphasized && { borderWidth: 2, borderColor: colors.warning, borderRadius: 16 }]}>
    {editable && !percentOpen && <View style={cardStyles.reveal}>
      <Text style={cardStyles.revealText}>enter %</Text>
    </View>}
    <Animated.View style={{ transform: [{ translateX }], opacity: fade }} {...(editable && !percentOpen ? pan.panHandlers : {})}>
      <Animated.View style={{ backgroundColor: flash.interpolate({
        inputRange: [0, 1],
        outputRange: [RECEIPT_PAPER, '#E7F6EE'],
      }) }}>
        {percentOpen ? <View style={cardStyles.editRow}>
          <Text style={cardStyles.chevron}>›</Text>
          <Text style={cardStyles.name} numberOfLines={1}>{item.name}</Text>
          <TextInput
            accessibilityLabel={`Percentage for ${item.name}`}
            autoFocus
            keyboardType="decimal-pad"
            placeholder="enter %"
            placeholderTextColor={colors.muted}
            value={text}
            onChangeText={(value) => setDraft((current) => ({ ...current, text: value, error: '' }))}
            onSubmitEditing={commitPercent}
            style={cardStyles.percentInput}
          />
          <Text {...moneyMark} style={cardStyles.sharePrice}>{preview ? formatMoney(preview.cents) : formatMoney(item.cents)}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Save percentage" onPress={commitPercent} style={cardStyles.setButton}>
            <Text style={cardStyles.setText}>Set</Text>
          </Pressable>
          {fieldError ? <View style={cardStyles.inlineAlert}>
            <Text style={cardStyles.alertMark}>!</Text>
            <Text style={cardStyles.alertText}>{fieldError}</Text>
          </View> : <Text style={cardStyles.editHint}>Your share updates from this percent. Everyone else splits what is left.</Text>}
          <Pressable accessibilityRole="button" hitSlop={8} onPress={onCancelPercent}><Text style={styles.link}>Cancel</Text></Pressable>
        </View> : <View style={[cardStyles.line, visual === 'error' && cardStyles.errorLine]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={mine
              ? `${item.name}, ${formatMoney(item.cents)}. Paying: ${payers}. Your share ${formatMoney(mine.cents)}.`
              : `${item.name}, ${formatMoney(item.cents)}, unclaimed.`}
            accessibilityHint="Tap the line to open it. Tap the circle to claim."
            onPress={() => {
              if (motion.dragging) return;
              onOpen();
            }}
            style={cardStyles.lineMain}
          >
            <View style={cardStyles.hatch}>
              {hatch.map((color, index) => <View key={`${color}-${index}`} style={{ flex: 1, backgroundColor: color }} />)}
            </View>
            <Text style={cardStyles.chevron}>{expanded ? '⌄' : '›'}</Text>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={cardStyles.name} numberOfLines={1}>{expanded && visual !== 'unclaimed' ? `✓ ${item.name}` : item.name}</Text>
              <Text style={cardStyles.meta}>
                {status.lead}
                {status.money ? <Text {...moneyMark} style={cardStyles.metaMoney}>{status.money}</Text> : null}
                {status.tail}
              </Text>
            </View>
            <Text {...moneyMark} style={cardStyles.price}>{formatMoney(item.cents)}</Text>
            {resolution.portions.length > 0 ? <View style={cardStyles.avatars}>
              {resolution.portions.map((portion, index) => {
                const person = people.find((entry) => entry.id === portion.personId);
                return person ? <View key={portion.personId} style={{ marginLeft: index === 0 ? 0 : -8 }}>
                  <AppearingAvatar person={person} />
                </View> : null;
              })}
            </View> : null}
          </Pressable>
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: !!mine, disabled: !editable }}
            accessibilityLabel={claimLabel(item.name, resolution.portions.length, !!mine, mine?.mode === 'custom', mine?.basisPoints ?? 0)}
            disabled={!editable}
            hitSlop={6}
            onPress={() => {
              if (mine) onLeave();
              else onClaim();
            }}
            style={[cardStyles.claimCircle, mine && cardStyles.claimOn]}
          >
            <Text style={[cardStyles.claimMark, mine && cardStyles.claimOnMark, resolution.portions.length > 1 && cardStyles.claimFraction]}>
              {mine ? shareMark(resolution.portions.length, mine.mode === 'custom', mine.basisPoints) : ''}
            </Text>
          </Pressable>
        </View>}
        {expanded && !percentOpen && <View style={cardStyles.opened}>
          <SplitProgressBar segments={segments} />
          {resolution.portions.length === 0 ? <Text style={cardStyles.meta}>No one is paying for this yet.</Text> : resolution.portions.map((portion) => {
            const person = people.find((entry) => entry.id === portion.personId);
            return <View key={portion.personId} style={cardStyles.payer}>
              {person && <MemberAvatar person={person} size={28} />}
              <Text style={[cardStyles.portionName, { color: person?.color ?? colors.ink }]}>{person?.name ?? 'Someone'}</Text>
              <Text style={cardStyles.portionMeta}>{formatBasisPoints(portion.basisPoints)} · {portion.mode === 'custom' ? 'Custom' : 'Auto'}</Text>
              <Text {...moneyMark} style={cardStyles.portionMoney}>{formatMoney(portion.cents)}</Text>
            </View>;
          })}
          {resolution.remainderBasisPoints > 0 && <Text style={cardStyles.warn}>
            Overflow portion {formatBasisPoints(resolution.remainderBasisPoints)} · <Text {...moneyMark} style={{ fontFamily: monoFamily, color: colors.warning }}>{formatMoney(resolution.unallocatedCents)}</Text> still open
          </Text>}
          {resolution.message && visual !== 'equal' && visual !== 'single' && <Text style={cardStyles.warn}>{resolution.message}</Text>}
          {editable && mine && <Pressable accessibilityRole="button" hitSlop={8} onPress={onLeave}>
            <Text style={[styles.link, { color: colors.danger }]}>Remove my claim</Text>
          </Pressable>}
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
      <Text style={styles.subtitle}><Text {...moneyMark} style={{ fontFamily: monoFamily, color: colors.muted }}>{formatMoney(item.cents)}</Text> total. Your percentage stays fixed. Everyone on Auto splits what is left.</Text>
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
            <Text {...moneyMark} style={sheetRow.money}>{formatBasisPoints(portion.basisPoints)} · {formatMoney(portion.cents)}</Text>
          </View>;
        })}
        {(preview?.remainderBasisPoints ?? 0) > 0 && <Text style={[styles.small, { color: colors.warning }]}>
          Unallocated {formatBasisPoints(preview?.remainderBasisPoints ?? 0)} · <Text {...moneyMark} style={{ fontFamily: monoFamily, color: colors.warning }}>{formatMoney(preview?.unallocatedCents ?? 0)}</Text>
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
        <Text {...moneyMark} style={summaryStyles.bill}>{formatMoney(totalCents)}</Text>
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

const paperStyles = StyleSheet.create({
  body: {
    backgroundColor: RECEIPT_PAPER,
    width: '100%',
    maxWidth: '100%',
    minWidth: 0,
    alignSelf: 'stretch',
    borderRadius: 20,
    overflow: 'hidden',
    paddingHorizontal: 14,
    paddingBottom: 8,
    ...Platform.select({
      web: { boxShadow: '0 10px 24px rgba(22, 50, 74, 0.08)' },
      default: {
        shadowColor: '#16324A', shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: 8 }, elevation: 2,
      },
    }),
  },
  title: {
    color: colors.ink, fontSize: 22, lineHeight: 28, fontWeight: '700', textAlign: 'center', paddingTop: 4, paddingBottom: 8,
    fontFamily: 'Inter',
  },
  dimmed: { opacity: 0.25 },
  rule: { borderBottomWidth: 1, borderStyle: 'dashed', borderColor: '#D9CBB8', marginBottom: 4 },
  alert: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8, marginBottom: 6,
    backgroundColor: colors.warningSoft, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8,
  },
  alertMark: {
    width: 22, height: 22, borderRadius: 4, textAlign: 'center', lineHeight: 22,
    backgroundColor: colors.warning, color: '#FFFFFF', fontWeight: '800', overflow: 'hidden',
  },
  alertText: { flex: 1, color: colors.warning, fontSize: 13, lineHeight: 18, fontWeight: '600' },
});

const cardStyles = StyleSheet.create({
  shell: { overflow: 'hidden', backgroundColor: '#E7D7C3' },
  reveal: { position: 'absolute', right: 0, top: 0, bottom: 0, width: 118, alignItems: 'center', justifyContent: 'center' },
  revealText: { color: colors.ink, fontWeight: '800', fontSize: 14 },
  line: {
    minHeight: 58, flexDirection: 'row', alignItems: 'center',
    borderBottomWidth: 1, borderStyle: 'dashed', borderBottomColor: '#E4D5C2',
    backgroundColor: RECEIPT_PAPER,
  },
  lineMain: { flex: 1, minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
  errorLine: { backgroundColor: '#FBF4EA' },
  hatch: { width: 10, alignSelf: 'stretch', borderRadius: 2, overflow: 'hidden' },
  chevron: { color: colors.muted, fontSize: 18, lineHeight: 22, width: 14 },
  name: { fontFamily: 'Inter', color: colors.ink, fontSize: 16, lineHeight: 21, fontWeight: '700' },
  meta: { color: colors.muted, fontSize: 12, lineHeight: 16 },
  metaMoney: { fontFamily: monoFamily, color: colors.muted, fontSize: 12, lineHeight: 16, fontWeight: '700' },
  price: { fontFamily: monoFamily, color: colors.ink, fontSize: 15, lineHeight: 20, fontWeight: '700' },
  avatars: { flexDirection: 'row', marginLeft: 2 },
  claimCircle: {
    minWidth: 36, height: 36, paddingHorizontal: 6, borderRadius: 18, marginRight: 8,
    borderWidth: 2, borderColor: colors.success, backgroundColor: '#FFFFFF',
    alignItems: 'center', justifyContent: 'center',
  },
  claimOn: { backgroundColor: colors.success, borderColor: colors.success },
  claimMark: { fontFamily: 'Inter', color: colors.success, fontSize: 18, lineHeight: 22, fontWeight: '700' },
  claimOnMark: { color: '#FFFFFF' },
  claimFraction: { fontSize: 11, lineHeight: 14, fontWeight: '800' },
  percentChip: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 },
  percentText: { color: colors.primary, fontSize: 12, lineHeight: 16, fontWeight: '800' },
  editRow: {
    minHeight: 72, gap: 8, paddingVertical: 10, paddingRight: 4,
    borderBottomWidth: 1, borderColor: '#E4D5C2', backgroundColor: RECEIPT_PAPER,
    flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center',
  },
  percentInput: {
    minWidth: 96, minHeight: 44, borderWidth: 1.5, borderColor: colors.ink, borderRadius: 8,
    paddingHorizontal: 10, fontSize: 16, color: colors.ink, backgroundColor: '#FFFFFF',
  },
  sharePrice: { fontFamily: monoFamily, color: colors.ink, fontSize: 16, lineHeight: 22, fontWeight: '700' },
  setButton: {
    minWidth: 52, minHeight: 44, borderRadius: 8, backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12,
  },
  setText: { color: '#FFFFFF', fontWeight: '800', fontSize: 15 },
  editHint: { width: '100%', color: colors.muted, fontSize: 12, lineHeight: 16 },
  inlineAlert: { width: '100%', flexDirection: 'row', alignItems: 'center', gap: 8 },
  alertMark: {
    width: 22, height: 22, borderRadius: 4, textAlign: 'center', lineHeight: 22,
    backgroundColor: colors.danger, color: '#FFFFFF', fontWeight: '800', overflow: 'hidden',
  },
  alertText: { flex: 1, color: colors.danger, fontSize: 13, lineHeight: 18 },
  opened: { gap: 8, paddingLeft: 24, paddingRight: 4, paddingBottom: 10, backgroundColor: RECEIPT_PAPER },
  payer: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 36 },
  portionName: { flex: 1, fontSize: 14, lineHeight: 18, fontWeight: '700' },
  portionMeta: { color: colors.muted, fontSize: 12, lineHeight: 16 },
  portionMoney: { fontFamily: monoFamily, width: 76, textAlign: 'right', color: colors.ink, fontSize: 15, fontWeight: '700' },
  warn: { color: colors.warning, fontSize: 13, lineHeight: 18 },
});

const sheetRow = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 },
  money: { fontFamily: monoFamily, color: colors.ink, fontSize: 13, lineHeight: 18, fontWeight: '700', textAlign: 'right' },
});

const summaryStyles = StyleSheet.create({
  yours: { fontFamily: monoFamily, color: colors.ink, fontSize: 28, lineHeight: 34, fontWeight: '700' },
  bill: { fontFamily: monoFamily, color: colors.ink, fontSize: 18, lineHeight: 24, fontWeight: '700' },
});

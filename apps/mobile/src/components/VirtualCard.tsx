import { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { formatMoney } from '@splitpool/contracts';
import { colors } from './ui';

type Seat = { userId: string; merchantShareCents: number; status: string };

const receivedStatus = new Set(['authorized', 'captured']);

export function receivedSeats(seats: Seat[]) {
  return seats.filter((seat) => receivedStatus.has(seat.status));
}

export function VirtualCard({ seats, budgetCents, unlocked, last4 }: {
  seats: Seat[]; budgetCents: number; unlocked: boolean; last4: string | null;
}) {
  const received = receivedSeats(seats);
  const loaded = received.reduce((sum, seat) => sum + seat.merchantShareCents, 0);
  const [scale] = useState(() => new Animated.Value(0.94));
  const previous = useRef(0);

  useEffect(() => {
    const arriving = received.length > previous.current;
    if (arriving) scale.setValue(previous.current === 0 ? 0.9 : 0.96);
    previous.current = received.length;
    if (arriving) Animated.spring(scale, { toValue: 1, friction: 7, tension: 70, useNativeDriver: false }).start();
  }, [received.length, scale]);

  if (received.length === 0 && !unlocked) return null;

  return <Animated.View style={{ transform: [{ scale }] }}>
    <CardFace budgetCents={budgetCents} loaded={loaded} unlocked={unlocked} last4={last4} />
    <Text style={card.caption}>{received.length} of {seats.length} shares on the card{unlocked ? '' : ' · locked'}</Text>
  </Animated.View>;
}

export function CardUnlock({ visible, last4, budgetCents, onAuthenticate, onDone }: {
  visible: boolean; last4: string | null; budgetCents: number;
  onAuthenticate: () => void; onDone: () => void;
}) {
  const [rise] = useState(() => new Animated.Value(480));
  const [face] = useState(() => new Animated.Value(1));
  const [pulse] = useState(() => new Animated.Value(1));
  const [check] = useState(() => new Animated.Value(0));
  const [scrim] = useState(() => new Animated.Value(1));
  const authenticate = useRef(onAuthenticate);
  const finish = useRef(onDone);

  useEffect(() => {
    authenticate.current = onAuthenticate;
    finish.current = onDone;
  }, [onAuthenticate, onDone]);

  useEffect(() => {
    if (!visible) return;
    face.setValue(1);
    check.setValue(0);
    scrim.setValue(1);
    rise.setValue(480);
    pulse.setValue(1);
    const scan = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1.08, duration: 420, useNativeDriver: false }),
      Animated.timing(pulse, { toValue: 1, duration: 420, useNativeDriver: false }),
    ]));
    scan.start();
    const timer = setTimeout(() => authenticate.current(), 1100);
    return () => { scan.stop(); clearTimeout(timer); };
  }, [visible, face, check, scrim, rise, pulse]);

  useEffect(() => {
    if (!visible || !last4) return;
    let held = true;
    const animation = Animated.parallel([
      Animated.timing(face, { toValue: 0, duration: 180, useNativeDriver: false }),
      Animated.spring(rise, { toValue: 0, friction: 8, tension: 42, useNativeDriver: false }),
      Animated.spring(check, { toValue: 1, friction: 6, tension: 80, delay: 160, useNativeDriver: false }),
    ]);
    animation.start(({ finished }) => {
      if (!finished || !held) return;
      setTimeout(() => {
        if (!held) return;
        Animated.timing(scrim, { toValue: 0, duration: 220, useNativeDriver: false }).start(({ finished: faded }) => {
          if (faded && held) finish.current();
        });
      }, 700);
    });
    return () => { held = false; animation.stop(); };
  }, [visible, last4, face, rise, check, scrim]);

  if (!visible) return null;
  return <Animated.View style={[card.overlay, { opacity: scrim }]} accessibilityViewIsModal>
    <Animated.View style={[card.faceWrap, { opacity: face, transform: [{ scale: pulse }] }]}>
      <FaceMark />
      <Text style={card.faceTitle}>Face ID</Text>
      <Text style={card.faceHint}>Look at the camera to unlock this card</Text>
    </Animated.View>
    <Animated.View style={[card.rising, { transform: [{ translateY: rise }] }]}>
      <Animated.View style={[card.check, { opacity: check, transform: [{ scale: check }] }]}><Text style={card.checkMark}>✓</Text></Animated.View>
      <View style={card.slot}><CardFace budgetCents={budgetCents} loaded={budgetCents} unlocked last4={last4} /></View>
    </Animated.View>
  </Animated.View>;
}

function CardFace({ budgetCents, loaded, unlocked, last4 }: {
  budgetCents: number; loaded: number; unlocked: boolean; last4: string | null;
}) {
  const portion = budgetCents > 0 ? Math.min(1, loaded / budgetCents) : 0;
  const [fill] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.timing(fill, { toValue: portion, duration: 480, useNativeDriver: false }).start();
  }, [portion, fill]);
  const width = fill.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });
  return <View style={[card.face, !unlocked && card.locked]} accessibilityLabel={last4 ? `Simulated card ending in ${last4}` : 'Simulated card, locked'}>
    <View style={card.top}>
      <Text style={card.brand}>SplitPool</Text>
      <Text style={card.sim}>Simulated</Text>
    </View>
    <View style={card.chip} />
    <Text style={card.number}>{last4 ? `•••• •••• •••• ${last4}` : '•••• •••• •••• ••••'}</Text>
    <View style={card.bottom}>
      <Text style={card.budget}>{formatMoney(budgetCents)}</Text>
      <Text style={card.sim}>{unlocked ? 'Ready' : 'Locked'}</Text>
    </View>
    <View style={card.track}><Animated.View style={[card.fill, { width }]} /></View>
  </View>;
}

function FaceMark() {
  return <View style={card.glyph}>
    <View style={card.eyes}><View style={card.eye} /><View style={card.eye} /></View>
    <View style={card.mouth} />
  </View>;
}

const card = StyleSheet.create({
  face: {
    backgroundColor: '#12344A', borderRadius: 18, padding: 22, gap: 18, minHeight: 196, overflow: 'hidden',
    shadowColor: '#0C2434', shadowOpacity: 0.28, shadowRadius: 18, shadowOffset: { width: 0, height: 14 }, elevation: 8,
  },
  locked: { opacity: 0.72 },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  brand: { color: '#F4F7FA', fontSize: 18, fontWeight: '800', letterSpacing: 0.4 },
  sim: { color: '#D5E2EC', fontSize: 11, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase' },
  chip: { width: 36, height: 26, borderRadius: 6, backgroundColor: '#D7B56D' },
  number: { color: '#F4F7FA', fontSize: 18, letterSpacing: 2, fontVariant: ['tabular-nums'] },
  bottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  budget: { color: '#FFFFFF', fontSize: 22, fontWeight: '700', fontVariant: ['tabular-nums'] },
  track: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 4, backgroundColor: '#0C2434' },
  fill: { height: 4, backgroundColor: '#8FCBB8' },
  caption: { marginTop: 10, color: colors.muted, fontSize: 12, lineHeight: 18 },
  overlay: { ...StyleSheet.absoluteFill, zIndex: 30, backgroundColor: 'rgba(8, 16, 24, 0.72)', alignItems: 'center', justifyContent: 'center' },
  faceWrap: { alignItems: 'center', gap: 10 },
  faceTitle: { color: '#FFFFFF', fontSize: 22, fontWeight: '800' },
  faceHint: { color: '#D5E2EC', fontSize: 14 },
  glyph: { width: 88, height: 88, borderRadius: 44, borderWidth: 2, borderColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', gap: 10 },
  eyes: { flexDirection: 'row', gap: 16 },
  eye: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#FFFFFF' },
  mouth: { width: 22, height: 8, borderBottomWidth: 2, borderColor: '#FFFFFF', borderRadius: 8 },
  rising: { position: 'absolute', left: 0, right: 0, bottom: 88, alignItems: 'center', paddingHorizontal: 24 },
  slot: { width: '100%', maxWidth: 420 },
  check: { alignSelf: 'center', width: 54, height: 54, borderRadius: 27, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  checkMark: { color: colors.success, fontSize: 28, fontWeight: '800' },
});

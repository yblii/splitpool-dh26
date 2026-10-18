import { useEffect, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { formatMoney } from '@splitpool/contracts';
import { MemberAvatar, type AvatarPerson } from './people';
import { CenterDialog } from './sheets';
import { monoFamily } from '../fonts';
import { Button, colors, moneyMark, styles, useReduceMotion } from './ui';

export function PaymentStatusRow({ person, status, amountCents }: {
  person: AvatarPerson; status: string; amountCents: number;
}) {
  return <View style={payStyles.row}>
    <MemberAvatar person={person} size={40} />
    <View style={{ flex: 1, gap: 2 }}>
      <Text style={styles.text}>{person.name}</Text>
      <Text style={styles.small}>{status}</Text>
    </View>
    <Text {...moneyMark} style={payStyles.amount}>{formatMoney(amountCents)}</Text>
  </View>;
}

export function VirtualCard({
  locked, amountCents, groupName, status, detail, inWallet = false, onAddToWallet,
}: {
  locked: boolean;
  amountCents: number;
  groupName: string;
  status: string;
  detail: string;
  inWallet?: boolean;
  onAddToWallet?: () => void;
}) {
  const reduceMotion = useReduceMotion();
  const [lock] = useState(() => new Animated.Value(locked ? 1 : 0));
  useEffect(() => {
    Animated.timing(lock, { toValue: locked ? 1 : 0, duration: reduceMotion ? 0 : 420, useNativeDriver: true }).start();
  }, [lock, locked, reduceMotion]);
  const scale = lock.interpolate({ inputRange: [0, 1], outputRange: [1, 0.98] });
  return <Animated.View style={[payStyles.card, { transform: [{ scale }] }]}>
    <View style={payStyles.orb} />
    <Text style={payStyles.brand}>SPLITPOOL</Text>
    <Text style={payStyles.kicker}>Simulated card</Text>
    <Text {...moneyMark} style={payStyles.cardAmount}>{formatMoney(amountCents)}</Text>
    <Text style={payStyles.group}>{groupName}</Text>
    <Text style={payStyles.status}>{status}</Text>
    <Text style={payStyles.detail}>{detail}</Text>
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={inWallet ? 'In your demo wallet' : 'Add to wallet'}
      accessibilityState={{ disabled: locked || inWallet }}
      disabled={locked || inWallet}
      onPress={onAddToWallet}
      style={payStyles.wallet}
    >
      <Text style={payStyles.walletText}>{inWallet ? 'In demo wallet' : 'Add to wallet'}</Text>
    </Pressable>
    <Animated.View pointerEvents={locked ? 'auto' : 'none'} style={[payStyles.lock, { opacity: lock }]}>
      <View style={payStyles.lockPill}><Text style={payStyles.lockText}>Locked</Text></View>
      <Text style={payStyles.lockHint}>Unlocks in this demo after every share is collected.</Text>
    </Animated.View>
  </Animated.View>;
}

export function ConfirmationDialog({
  visible, amountCents, onBack, onConfirm,
}: {
  visible: boolean;
  amountCents: number;
  onBack: () => void;
  onConfirm: () => void;
}) {
  return <CenterDialog visible={visible} title="Confirm collection" onClose={onBack}>
    <Text style={styles.text}>
      Everyone with a share has approved. Confirming locks this bill and starts a simulated collection of {formatMoney(amountCents)}.
    </Text>
    <Text style={styles.small}>
      After collection starts, changing the split would mean canceling and handling refunds. This demo does not charge cards or pay a restaurant.
    </Text>
    <View style={payStyles.actions}>
      <Button title="Go back" secondary onPress={onBack} style={payStyles.back} />
      <Button title="Confirm & collect" onPress={onConfirm} style={payStyles.collect} />
    </View>
  </CenterDialog>;
}

const payStyles = StyleSheet.create({
  actions: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12,
  },
  back: { alignSelf: 'flex-start', flexGrow: 0, paddingHorizontal: 16 },
  collect: {
    alignSelf: 'flex-start', flexGrow: 0, flexShrink: 0, paddingHorizontal: 14,
  },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  amount: { fontFamily: monoFamily, color: colors.ink, fontSize: 16, fontWeight: '700' },
  card: {
    backgroundColor: '#173E5C', borderRadius: 24, padding: 20, minHeight: 196, overflow: 'hidden', gap: 4,
  },
  orb: {
    position: 'absolute', width: 160, height: 160, borderRadius: 80, backgroundColor: 'rgba(255,255,255,0.08)',
    top: -50, right: -30,
  },
  brand: { color: 'rgba(255,255,255,0.72)', fontSize: 12, letterSpacing: 1.4, fontWeight: '700' },
  kicker: { color: '#FFFFFF', fontSize: 13, lineHeight: 18, fontWeight: '600', marginTop: 8 },
  cardAmount: { fontFamily: monoFamily, color: '#FFFFFF', fontSize: 32, lineHeight: 38, fontWeight: '700', marginTop: 8 },
  group: { color: 'rgba(255,255,255,0.86)', fontSize: 15, lineHeight: 20 },
  status: { color: '#FFFFFF', fontSize: 15, lineHeight: 20, fontWeight: '700', marginTop: 10 },
  detail: { color: 'rgba(255,255,255,0.78)', fontSize: 13, lineHeight: 18 },
  wallet: {
    alignSelf: 'stretch', marginTop: 12, minHeight: 40, borderRadius: 999,
    backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14,
  },
  walletText: { color: colors.ink, fontSize: 14, lineHeight: 18, fontWeight: '800' },
  lock: {
    ...StyleSheet.absoluteFill, backgroundColor: 'rgba(18, 40, 58, 0.72)',
    alignItems: 'center', justifyContent: 'center', gap: 8, padding: 20,
  },
  lockPill: { backgroundColor: '#FFFFFF', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 6 },
  lockText: { color: colors.ink, fontWeight: '800', fontSize: 14 },
  lockHint: { color: '#FFFFFF', fontSize: 13, lineHeight: 18, textAlign: 'center' },
});

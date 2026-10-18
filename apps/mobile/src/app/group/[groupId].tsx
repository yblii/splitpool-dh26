import { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as Linking from 'expo-linking';
import { router, useFocusEffect, useLocalSearchParams, type Href } from 'expo-router';
import { formatMoney, type GroupDetail } from '@splitpool/contracts';
import { MemberAvatar } from '../../components/people';
import { BottomSheet } from '../../components/sheets';
import { ReceiptPaper } from '../../components/split-ui';
import { monoFamily } from '../../fonts';
import { AppHeader, Button, ErrorBanner, Screen, colors, moneyMark, styles } from '../../components/ui';
import {
  createBill,
  createInvite,
  formatApiError,
  getGroup,
} from '../../lib/apiClient';
import { avatarFromProfile } from '../../lib/peopleUi';
import { useAppProfile } from '../../state/appProfile';

function inviteUrlForToken(token: string) {
  return Linking.createURL(`/invite/${token}`);
}

/** Live group home — demo layout, collaboration API underneath. */
export default function ConnectedGroupScreen() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const { appProfile } = useAppProfile();
  const [group, setGroup] = useState<GroupDetail | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!groupId) return;
    setMessage(null);
    try {
      setGroup(await getGroup(groupId));
    } catch (error) {
      setMessage(formatApiError(error));
      setGroup(null);
    }
  }, [groupId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const isHost = Boolean(group && appProfile && group.hostId === appProfile.userId);
  const members = group?.members.map((member) => avatarFromProfile(member)) ?? [];
  const openBill = group?.bills.find((bill) => bill.state !== 'PAID' && bill.state !== 'CANCELLED')
    ?? (group?.activeBillId
      ? group.bills.find((bill) => bill.id === group.activeBillId)
      : undefined);
  const past = group?.bills.filter((bill) => bill.state === 'PAID' || bill.state === 'CANCELLED') ?? [];

  async function ensureOpenBill() {
    if (!group) return null;
    if (group.activeBillId) return group.activeBillId;
    if (!isHost) {
      setMessage('Only the host can open a new bill for this group.');
      return null;
    }
    const bill = await createBill(group.id);
    await load();
    return bill.id;
  }

  async function scanReceipt() {
    if (!group) return;
    setBusy(true);
    setMessage(null);
    try {
      const billId = await ensureOpenBill();
      if (!billId) return;
      router.push({ pathname: '/bill/[billId]/receipt', params: { billId } } as Href);
    } catch (error) {
      setMessage(formatApiError(error));
    } finally {
      setBusy(false);
    }
  }

  function continueBill() {
    if (!openBill) return;
    router.push({ pathname: '/bill/[billId]', params: { billId: openBill.id } } as Href);
  }

  async function copyInvite() {
    if (!group || !isHost) return;
    setBusy(true);
    setMessage(null);
    try {
      const result = await createInvite(group.id);
      const url = inviteUrlForToken(result.token);
      setInviteUrl(url);
      await Clipboard.setStringAsync(url);
      setMessage('Invite link copied. Valid for 24 hours.');
    } catch (error) {
      setMessage(formatApiError(error));
    } finally {
      setBusy(false);
    }
  }

  if (!groupId) {
    return (
      <Screen header={<AppHeader title="Group" onBack={() => router.replace('/connected')} />}>
        <Text style={styles.subtitle}>Missing group id.</Text>
      </Screen>
    );
  }

  return (
    <Screen
      header={(
        <AppHeader
          title={group?.name ?? 'Group'}
          onBack={() => router.replace('/connected')}
          right={isHost ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Edit group"
              hitSlop={8}
              onPress={() => setEditing(true)}
              style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 }}
            >
              <Text style={styles.link}>Edit</Text>
            </Pressable>
          ) : undefined}
        />
      )}
      footer={<Button title={busy ? 'Working…' : 'Scan now'} disabled={busy || !group} onPress={() => void scanReceipt()} />}
    >
      {group && (
        <View style={memberRow}>
          {members.map((member) => (
            <View key={member.id} style={memberProfile}>
              <MemberAvatar person={member} size={48} />
              <Text style={memberName} numberOfLines={1}>{member.name}</Text>
              <Text style={memberTitle} numberOfLines={2}>
                {member.id === group.hostId ? 'Host' : 'Member'}
                {member.id === appProfile?.userId ? ' · you' : ''}
              </Text>
            </View>
          ))}
        </View>
      )}

      <ReceiptPaper title="Past splits" level="subheading">
        <View style={[styles.row, { paddingVertical: 6 }]}>
          <Text style={[styles.small, { flex: 1 }]} />
          <Text style={[styles.small, { width: 72, textAlign: 'right' }]}>Total</Text>
          <Text style={[styles.small, { width: 72, textAlign: 'right' }]}>You pay</Text>
        </View>

        {openBill && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Continue ${openBill.merchant}`}
            onPress={continueBill}
            style={splitRow}
          >
            <View style={{ flex: 1, justifyContent: 'center' }}>
              <Text style={[styles.text, { fontWeight: '700' }]} numberOfLines={1}>
                {openBill.merchant || 'Open bill'}
              </Text>
              <Text style={styles.small}>{openBill.state.replace(/_/g, ' ').toLowerCase()}</Text>
            </View>
            <Text {...moneyMark} style={money}>{formatMoney(openBill.totalCents)}</Text>
            <Text {...moneyMark} style={money}>{formatMoney(openBill.yourShareCents)}</Text>
          </Pressable>
        )}

        {past.length === 0 && !openBill && (
          <Text style={styles.small}>No bills yet. Scan a receipt to start one.</Text>
        )}

        {past.map((entry) => (
          <Pressable
            key={entry.id}
            accessibilityRole="button"
            accessibilityLabel={`${entry.merchant}, total ${formatMoney(entry.totalCents)}`}
            onPress={() => router.push({ pathname: '/bill/[billId]', params: { billId: entry.id } } as Href)}
            style={splitRow}
          >
            <Text style={[styles.text, { flex: 1 }]} numberOfLines={1}>{entry.merchant}</Text>
            <Text {...moneyMark} style={money}>{formatMoney(entry.totalCents)}</Text>
            <Text {...moneyMark} style={money}>{formatMoney(entry.yourShareCents)}</Text>
          </Pressable>
        ))}
      </ReceiptPaper>

      {message && <ErrorBanner message={message} />}

      <BottomSheet visible={editing} title="Edit group" onClose={() => setEditing(false)} footer={<Button title="Done" onPress={() => setEditing(false)} />}>
        <Text style={styles.small}>Invite friends with a link. They join this group and any open bill as payers.</Text>
        <Button title={busy ? 'Creating…' : 'Copy invite link'} disabled={busy || !isHost} onPress={() => void copyInvite()} />
        {inviteUrl && (
          <View style={{ gap: 8 }}>
            <Text style={styles.label}>Invite URL</Text>
            <Text selectable style={styles.text}>{inviteUrl}</Text>
          </View>
        )}
        {!isHost && <Text style={styles.small}>Only the host can invite people.</Text>}
      </BottomSheet>
    </Screen>
  );
}

const memberRow = { flexDirection: 'row' as const, alignItems: 'flex-start' as const, justifyContent: 'space-between' as const };
const memberProfile = { alignItems: 'center' as const, gap: 4, flex: 1, minHeight: 44 };
const memberName = { fontFamily: 'Inter', fontSize: 16, lineHeight: 21, fontWeight: '600' as const, color: colors.ink, textAlign: 'center' as const };
const memberTitle = { fontFamily: 'Inter', fontSize: 13, lineHeight: 18, fontWeight: '400' as const, color: colors.muted, textAlign: 'center' as const };
const splitRow = { minHeight: 48, flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8, borderTopWidth: 1, borderStyle: 'dashed' as const, borderColor: '#E4D5C2' };
const money = { fontFamily: monoFamily, width: 80, textAlign: 'right' as const, color: colors.ink, fontWeight: '700' as const };

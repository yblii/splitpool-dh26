import { useCallback, useState } from 'react';
import { Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as Linking from 'expo-linking';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import type { GroupDetail } from '@splitpool/contracts';
import { Button, Card, DemoNote, Screen, colors, styles } from '../../components/ui';
import {
  closeBill,
  createInvite,
  formatApiError,
  getGroup,
} from '../../lib/apiClient';
import { getBillPayment } from '../../lib/paymentApi';
import { useAppProfile } from '../../state/appProfile';

function inviteUrlForToken(token: string) {
  return Linking.createURL(`/invite/${token}`);
}

export default function GroupScreen() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const { appProfile } = useAppProfile();
  const [group, setGroup] = useState<GroupDetail | null>(null);
  const [message, setMessage] = useState('');
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!groupId || !appProfile?.userId) return;
    setMessage('');
    try {
      let next = await getGroup(groupId);
      if (next.activeBillId) {
        try {
          const payment = await getBillPayment(next.activeBillId, appProfile.userId);
          const phase = payment?.session?.phase;
          if (phase === 'paid' || phase === 'canceled') {
            await closeBill(next.activeBillId, phase === 'paid' ? 'PAID' : 'CANCELLED');
            router.replace('/');
            return;
          }
        } catch {
          // Keep the group view usable if payment status cannot be read.
        }
      }
      setGroup(next);
    } catch (error) {
      setMessage(formatApiError(error));
      setGroup(null);
    }
  }, [groupId, appProfile]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const isHost = Boolean(group && appProfile && group.hostId === appProfile.userId);

  async function openBill() {
    if (!group?.activeBillId) return;
    router.push({ pathname: '/bill/[billId]', params: { billId: group.activeBillId } });
  }

  async function markBillClosed() {
    if (!group?.activeBillId || !isHost) return;
    setBusy(true);
    setMessage('');
    try {
      await closeBill(group.activeBillId, 'PAID');
      router.replace('/');
    } catch (error) {
      setMessage(formatApiError(error));
    } finally {
      setBusy(false);
    }
  }

  async function copyInviteLink() {
    if (!group) return;
    setBusy(true);
    setMessage('');
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

  async function copyAgain() {
    if (!inviteUrl) return;
    try {
      await Clipboard.setStringAsync(inviteUrl);
      setMessage('Invite link copied again.');
    } catch {
      setMessage('Could not copy. Select the link and copy it manually.');
    }
  }

  if (!groupId) {
    return (
      <Screen>
        <Text style={styles.subtitle}>Missing group id.</Text>
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={{ gap: 10 }}>
        <Text style={styles.title}>{group?.name ?? 'Group'}</Text>
        <Text style={styles.subtitle}>
          {group
            ? `${group.members.length} member${group.members.length === 1 ? '' : 's'}${isHost ? ' · You are host' : ''}`
            : message || 'Loading…'}
        </Text>
      </View>

      {group?.activeBillId && (
        <Button
          title={busy ? 'Please wait…' : 'Open bill'}
          disabled={busy}
          onPress={() => void openBill()}
        />
      )}
      {group?.activeBillId && isHost && (
        <Button
          title="Close bill"
          secondary
          disabled={busy}
          onPress={() => void markBillClosed()}
        />
      )}

      {group && (
        <Card>
          <Text style={styles.heading}>Members</Text>
          {group.members.map((member) => (
            <Text key={member.userId} style={styles.text}>
              {member.displayName} (@{member.username})
              {member.userId === group.hostId ? ' · host' : ''}
              {member.userId === appProfile?.userId ? ' · you' : ''}
            </Text>
          ))}
        </Card>
      )}

      {isHost && group && (
        <Card>
          <Text style={styles.heading}>Invite</Text>
          <Text style={styles.small}>
            Create a link friends can open while signed in. They join this bill’s group as payers.
          </Text>
          <Button
            title={busy ? 'Creating…' : 'Copy invite link'}
            disabled={busy}
            onPress={() => void copyInviteLink()}
          />
          {inviteUrl && (
            <View style={{ gap: 8 }}>
              <Text style={styles.label}>Invite URL</Text>
              <Text selectable style={styles.text}>{inviteUrl}</Text>
              <Button title="Copy again" secondary disabled={busy} onPress={() => void copyAgain()} />
            </View>
          )}
        </Card>
      )}

      {!!message && <Text style={[styles.small, { color: colors.warning }]}>{message}</Text>}

      <Button title="Back to groups" secondary onPress={() => router.replace('/connected')} />
      <DemoNote />
    </Screen>
  );
}

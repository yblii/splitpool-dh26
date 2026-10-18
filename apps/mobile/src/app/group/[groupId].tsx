import { useCallback, useState } from 'react';
import { Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as Linking from 'expo-linking';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import type { GroupDetail } from '@splitpool/contracts';
import { Button, Card, DemoNote, Screen, colors, styles } from '../../components/ui';
import {
  createBill,
  createInvite,
  formatApiError,
  getGroup,
} from '../../lib/apiClient';
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
    if (!groupId) return;
    setMessage('');
    try {
      setGroup(await getGroup(groupId));
    } catch (error) {
      setMessage(formatApiError(error));
    }
  }, [groupId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const isHost = Boolean(group && appProfile && group.hostId === appProfile.userId);

  async function openOrCreateBill() {
    if (!group || !appProfile) return;
    setBusy(true);
    setMessage('');
    try {
      if (group.activeBillId) {
        router.push({ pathname: '/bill/[billId]', params: { billId: group.activeBillId } });
        return;
      }
      const bill = await createBill(group.id);
      router.push({ pathname: '/bill/[billId]', params: { billId: bill.id } });
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
            : 'Loading…'}
        </Text>
      </View>

      <Button
        title={busy ? 'Please wait…' : group?.activeBillId ? 'Open bill' : 'Start bill'}
        disabled={busy || !group}
        onPress={() => void openOrCreateBill()}
      />
      {group && !group.activeBillId && (
        <Text style={styles.small}>No open bill. Paid bills stay closed here — start a new one when you need it.</Text>
      )}

      <Card>
        <Text style={styles.heading}>Members</Text>
        {group?.members.map((member) => (
          <Text key={member.userId} style={styles.text}>
            {member.displayName} (@{member.username})
            {member.userId === group.hostId ? ' · host' : ''}
            {member.userId === appProfile?.userId ? ' · you' : ''}
          </Text>
        )) ?? <Text style={styles.small}>Loading members…</Text>}
      </Card>

      {isHost && (
        <Card>
          <Text style={styles.heading}>Invite</Text>
          <Text style={styles.small}>
            Create a link friends can open while signed in. They join the group and become payers on the active bill.
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

      <Button title="Back to groups" secondary onPress={() => router.replace('/')} />
      <DemoNote />
    </Screen>
  );
}

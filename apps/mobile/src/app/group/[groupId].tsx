import { useCallback, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
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

export default function GroupScreen() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const { appProfile } = useAppProfile();
  const [group, setGroup] = useState<GroupDetail | null>(null);
  const [message, setMessage] = useState('');
  const [inviteUsername, setInviteUsername] = useState('');
  const [inviteToken, setInviteToken] = useState<string | null>(null);
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
      const bill = await createBill(group.id, [appProfile.userId]);
      router.push({ pathname: '/bill/[billId]', params: { billId: bill.id } });
    } catch (error) {
      setMessage(formatApiError(error));
    } finally {
      setBusy(false);
    }
  }

  async function onInvite(kind: 'username' | 'link') {
    if (!group) return;
    setBusy(true);
    setMessage('');
    setInviteToken(null);
    try {
      const result = await createInvite(
        group.id,
        kind === 'username' ? inviteUsername.trim() : undefined,
      );
      if (kind === 'username') {
        setMessage(`Invite created for @${inviteUsername.trim().toLowerCase()}.`);
        setInviteUsername('');
      } else {
        setInviteToken(result.token);
        setMessage('Shareable invite link token created (valid 24 hours).');
      }
    } catch (error) {
      setMessage(formatApiError(error));
    } finally {
      setBusy(false);
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
          <Text style={styles.label}>Username</Text>
          <TextInput
            accessibilityLabel="Invite username"
            autoCapitalize="none"
            autoCorrect={false}
            value={inviteUsername}
            onChangeText={setInviteUsername}
            placeholder="friend_username"
            style={styles.input}
            maxLength={30}
          />
          <Button
            title="Invite by username"
            secondary
            disabled={busy || inviteUsername.trim().length < 3}
            onPress={() => void onInvite('username')}
          />
          <Button
            title="Create invite link token"
            secondary
            disabled={busy}
            onPress={() => void onInvite('link')}
          />
          {inviteToken && (
            <View style={{ gap: 8 }}>
              <Text style={styles.small}>Token (share with a signed-in teammate):</Text>
              <Text selectable style={styles.text}>{inviteToken}</Text>
              <Button
                title="Open accept screen"
                secondary
                onPress={() => router.push({ pathname: '/invite/[token]', params: { token: inviteToken } })}
              />
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

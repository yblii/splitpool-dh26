import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { Button, Card, Screen, colors, styles } from '../../components/ui';
import { acceptInvite, formatApiError } from '../../lib/apiClient';
import { useAppProfile } from '../../state/appProfile';
import { useAuth } from '../../state/auth';

export default function AcceptInviteScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const inviteToken = typeof token === 'string' ? decodeURIComponent(token) : '';
  const { session, isLoading: authLoading } = useAuth();
  const { status } = useAppProfile();
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const ready = Boolean(session) && status === 'ready';
  const needsSetup = Boolean(session) && status === 'needsSetup';

  useEffect(() => {
    if (authLoading || status === 'loading') return;
    if (!session) {
      router.replace({
        pathname: '/login',
        params: { next: inviteToken ? `/invite/${inviteToken}` : '/connected' },
      } as Href);
      return;
    }
    if (needsSetup) {
      router.replace('/profile-setup');
    }
  }, [authLoading, session, status, needsSetup, inviteToken]);

  async function onAccept() {
    if (!inviteToken || !ready) return;
    setBusy(true);
    setMessage('');
    try {
      const result = await acceptInvite(inviteToken);
      router.replace({ pathname: '/group/[groupId]', params: { groupId: result.groupId } });
    } catch (error) {
      setMessage(formatApiError(error));
      setBusy(false);
    }
  }

  if (authLoading || status === 'loading' || !ready) {
    return (
      <Screen>
        <Text style={styles.subtitle}>Opening invite…</Text>
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={{ gap: 10 }}>
        <Text style={styles.title}>Join group.</Text>
        <Text style={styles.subtitle}>Accept this invite to join the group.</Text>
      </View>
      <Card>
        <Button
          title={busy ? 'Joining…' : 'Accept invite'}
          disabled={busy || !inviteToken}
          onPress={() => void onAccept()}
        />
        {!!message && <Text style={[styles.small, { color: colors.warning }]}>{message}</Text>}
      </Card>
      <Button title="Back to groups" secondary onPress={() => router.replace('/connected')} />
    </Screen>
  );
}

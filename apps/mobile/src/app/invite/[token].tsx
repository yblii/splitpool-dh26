import { useState } from 'react';
import { Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Button, Card, DemoNote, Screen, colors, styles } from '../../components/ui';
import { acceptInvite, formatApiError } from '../../lib/apiClient';

export default function AcceptInviteScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function onAccept() {
    if (!token) return;
    setBusy(true);
    setMessage('');
    try {
      const result = await acceptInvite(token);
      router.replace({ pathname: '/group/[groupId]', params: { groupId: result.groupId } });
    } catch (error) {
      setMessage(formatApiError(error));
      setBusy(false);
    }
  }

  return (
    <Screen>
      <View style={{ gap: 10 }}>
        <Text style={styles.title}>Join group.</Text>
        <Text style={styles.subtitle}>Accept this invite to join the group. You become a payer on the active bill automatically.</Text>
      </View>
      <Card>
        <Text style={styles.label}>Invite token</Text>
        <Text selectable style={styles.text}>{token || '(missing)'}</Text>
        <Button
          title={busy ? 'Joining…' : 'Accept invite'}
          disabled={busy || !token}
          onPress={() => void onAccept()}
        />
        {!!message && <Text style={[styles.small, { color: colors.warning }]}>{message}</Text>}
      </Card>
      <Button title="Back to groups" secondary onPress={() => router.replace('/connected')} />
      <DemoNote />
    </Screen>
  );
}

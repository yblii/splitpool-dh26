import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { Button, Card, Screen, styles } from '../components/ui';
import { apiUrl } from '../lib/api';
import { displayNameFromProfile, useAuth } from '../state/auth';
import { useAppProfile } from '../state/appProfile';

const USERNAME_PATTERN = /^[A-Za-z0-9_]{3,30}$/;

export default function ProfileSetupScreen() {
  const { profile, signOut } = useAuth();
  const { status, errorMessage, completeSetup, refresh } = useAppProfile();
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState(() => displayNameFromProfile(profile));
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const canSubmit = USERNAME_PATTERN.test(username.trim()) && displayName.trim().length > 0;

  async function onSubmit() {
    setBusy(true);
    setMessage('');
    const error = await completeSetup({ username, displayName });
    setBusy(false);
    if (error) {
      setMessage(error);
      return;
    }
    router.replace('/connected');
  }

  if (status === 'unavailable') {
    return (
      <Screen>
        <View style={{ gap: 10 }}>
          <Text style={styles.title}>Connect the API.</Text>
          <Text style={styles.subtitle}>
            Groups and bills need the Fastify API and Tiger Data. Sign-in alone is not enough.
          </Text>
        </View>
        <Card>
          <Text style={styles.small}>
            {errorMessage ?? 'API unavailable.'}
            {'\n\n'}Current EXPO_PUBLIC_API_URL: {apiUrl || '(missing)'}
            {'\n\n'}1. Fill apps/api/.env (DATABASE_URL, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY)
            {'\n'}2. npm run migrate --workspace @splitpool/api
            {'\n'}3. npm run api
            {'\n'}4. Confirm curl http://localhost:3001/api/v1/ready → status ok
            {'\n'}5. Restart Expo after changing apps/mobile/.env
          </Text>
          <Button title="Retry" onPress={() => void refresh()} />
          <Button
            title="Sign out"
            secondary
            onPress={() => {
              void signOut().then(() => router.replace('/login'));
            }}
          />
        </Card>
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={{ gap: 10 }}>
        <Text style={styles.title}>Choose a username.</Text>
        <Text style={styles.subtitle}>
          Friends invite you with a link. Display name is what they see on the bill.
        </Text>
      </View>
      <Card>
        <Text style={styles.label}>Username</Text>
        <TextInput
          accessibilityLabel="Username"
          autoCapitalize="none"
          autoCorrect={false}
          value={username}
          onChangeText={setUsername}
          placeholder="e.g. jamie_chen"
          style={styles.input}
          maxLength={30}
        />
        <Text style={styles.small}>3–30 characters: letters, numbers, underscore. Stored in PostgreSQL, not Supabase Auth.</Text>
        <Text style={styles.label}>Display name</Text>
        <TextInput
          accessibilityLabel="Display name"
          value={displayName}
          onChangeText={setDisplayName}
          placeholder="Display name"
          style={styles.input}
          maxLength={80}
        />
        <Button
          title={busy ? 'Saving…' : 'Continue'}
          disabled={busy || !canSubmit}
          onPress={() => void onSubmit()}
        />
        {!!message && <Text style={styles.small}>{message}</Text>}
      </Card>
      <Button
        title="Sign out"
        secondary
        disabled={busy}
        onPress={() => {
          void signOut().then(() => router.replace('/login'));
        }}
      />
    </Screen>
  );
}

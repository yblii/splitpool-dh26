import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { Link, router } from 'expo-router';
import { Button, Card, DemoNote, Screen, styles } from '../components/ui';
import { useAuth } from '../state/auth';

export default function LoginScreen() {
  const { configured, signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit() {
    setBusy(true);
    setMessage('');
    const error = await signIn(email, password);
    setBusy(false);
    if (error) {
      setMessage(error);
      return;
    }
    router.replace('/profile');
  }

  return (
    <Screen>
      <View style={{ gap: 10 }}>
        <Text style={styles.title}>Welcome back.</Text>
        <Text style={styles.subtitle}>Sign in with the email and password for your SplitPool account.</Text>
      </View>
      <Card>
        {!configured && (
          <Text style={styles.small}>
            Add your Supabase URL and publishable key to apps/mobile/.env, then restart Expo.
          </Text>
        )}
        <Text style={styles.label}>Email</Text>
        <TextInput
          accessibilityLabel="Email"
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
          placeholder="you@example.com"
          style={styles.input}
        />
        <Text style={styles.label}>Password</Text>
        <TextInput
          accessibilityLabel="Password"
          autoCapitalize="none"
          autoComplete="current-password"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          placeholder="Password"
          style={styles.input}
        />
        <Button
          title={busy ? 'Signing in…' : 'Sign in'}
          disabled={busy || !email.trim() || !password || !configured}
          onPress={() => void onSubmit()}
        />
        {!!message && <Text style={styles.small}>{message}</Text>}
      </Card>
      <View style={styles.row}>
        <Text style={styles.small}>New here?</Text>
        <Link href="/signup" asChild>
          <Pressable accessibilityRole="button" hitSlop={12}>
            <Text style={styles.link}>Create an account</Text>
          </Pressable>
        </Link>
      </View>
      <DemoNote />
    </Screen>
  );
}

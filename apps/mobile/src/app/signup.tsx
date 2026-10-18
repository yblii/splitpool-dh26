import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { Link, router } from 'expo-router';
import { Button, Card, DemoNote, Screen, styles } from '../components/ui';
import { useAuth } from '../state/auth';

export default function SignUpScreen() {
  const { configured, signUp } = useAuth();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const canSubmit = Boolean(
    configured
    && firstName.trim()
    && lastName.trim()
    && email.trim()
    && password.length >= 8
    && phone.trim(),
  );

  async function onSubmit() {
    setBusy(true);
    setMessage('');
    const result = await signUp({ firstName, lastName, email, password, phone });
    setBusy(false);
    if (result === 'Check your email to confirm your account, then sign in.') {
      setMessage(result);
      setPassword('');
      return;
    }
    if (result) {
      setMessage(result);
      return;
    }
    router.replace('/profile');
  }

  return (
    <Screen>
      <View style={{ gap: 10 }}>
        <Text style={styles.title}>Create account.</Text>
        <Text style={styles.subtitle}>Tell us who you are so friends can recognize you in a split.</Text>
      </View>
      <Card>
        {!configured && (
          <Text style={styles.small}>
            Add your Supabase URL and publishable key to apps/mobile/.env, then restart Expo.
          </Text>
        )}
        <Text style={styles.label}>First name</Text>
        <TextInput
          accessibilityLabel="First name"
          autoComplete="given-name"
          value={firstName}
          onChangeText={setFirstName}
          placeholder="First name"
          style={styles.input}
        />
        <Text style={styles.label}>Last name</Text>
        <TextInput
          accessibilityLabel="Last name"
          autoComplete="family-name"
          value={lastName}
          onChangeText={setLastName}
          placeholder="Last name"
          style={styles.input}
        />
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
          autoComplete="new-password"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          placeholder="At least 8 characters"
          style={styles.input}
        />
        <Text style={styles.label}>Phone number</Text>
        <TextInput
          accessibilityLabel="Phone number"
          autoComplete="tel"
          keyboardType="phone-pad"
          value={phone}
          onChangeText={setPhone}
          placeholder="Phone number"
          style={styles.input}
        />
        <Button
          title={busy ? 'Creating account…' : 'Sign up'}
          disabled={busy || !canSubmit}
          onPress={() => void onSubmit()}
        />
        <Text style={styles.small}>Password must be at least 8 characters. No MFA for this demo.</Text>
        {!!message && <Text style={styles.small}>{message}</Text>}
      </Card>
      <View style={styles.row}>
        <Text style={styles.small}>Already have an account?</Text>
        <Link href="/login" asChild>
          <Pressable accessibilityRole="button" hitSlop={12}>
            <Text style={styles.link}>Sign in</Text>
          </Pressable>
        </Link>
      </View>
      <DemoNote />
    </Screen>
  );
}

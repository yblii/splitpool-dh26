import { useEffect, useState } from 'react';
import { Text, TextInput } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { PaymentMethods } from '../components/PaymentMethods';
import { Button, Card, DemoNote, Screen, styles } from '../components/ui';
import { useDemo } from '../state/demo';
import { apiUrl, checkApi } from '../lib/api';
import { getSupabase, supabaseConfigured } from '../lib/supabase';

export default function ProfileScreen() {
  const { profileName, setProfileName, reset } = useDemo();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [signedInEmail, setSignedInEmail] = useState<string>();
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [showConnections, setShowConnections] = useState(false);
  const health = useQuery({ queryKey: ['health', apiUrl], queryFn: checkApi, enabled: false, retry: false });

  useEffect(() => {
    const client = getSupabase();
    if (!client) return;
    let active = true;
    void client.auth.getSession().then(({ data }) => { if (active) setSignedInEmail(data.session?.user.email); });
    const { data } = client.auth.onAuthStateChange((_, session) => {
      if (active) setSignedInEmail(session?.user.email);
    });
    return () => { active = false; data.subscription.unsubscribe(); };
  }, []);

  async function authenticate(signUp: boolean) {
    const client = getSupabase();
    if (!client) return;
    setBusy(true);
    setMessage('');
    try {
      const credentials = { email: email.trim(), password };
      const result = signUp ? await client.auth.signUp(credentials) : await client.auth.signInWithPassword(credentials);
      setMessage(result.error?.message ?? (signUp && !result.data.session ? 'Check your email to confirm your account, then sign in.' : 'Signed in to Supabase. The bill is still a local demo.'));
      if (!result.error) setPassword('');
    } catch {
      setMessage('Could not reach Supabase. Check your connection and configuration.');
    } finally { setBusy(false); }
  }

  async function signOut() {
    const result = await getSupabase()?.auth.signOut();
    if (result?.error) setMessage(result.error.message);
    else { reset(); setMessage('Signed out. Local bill reset.'); }
  }

  return <Screen>
    <Text style={styles.title}>Your details.</Text>
    <Text style={styles.subtitle}>A familiar name. An easier split.</Text>
    <Card>
      <Text style={styles.heading}>Profile</Text>
      <Text style={styles.label}>Display name</Text>
      <TextInput accessibilityLabel="Display name" value={profileName} onChangeText={setProfileName} maxLength={30} style={styles.input} placeholder="Your name" />
      <Text style={styles.small}>Used on this device. Reloading resets the demo.</Text>
    </Card>
    <Card>
      <Text style={styles.heading}>Payment method</Text>
      <PaymentMethods />
    </Card>
    <Button title={showConnections ? 'Hide app connections' : 'App connections'} secondary onPress={() => setShowConnections(!showConnections)} />
    {(showConnections || supabaseConfigured) && <>
    <Card>
      <Text style={styles.heading}>Connected account</Text>
      {!supabaseConfigured ? <Text style={styles.small}>Add your Supabase URL and publishable key to apps/mobile/.env, then restart Expo. You can use the demo without an account.</Text> : signedInEmail ? <>
        <Text style={styles.text}>Signed in as {signedInEmail}</Text>
        <Button title="Sign out" secondary onPress={() => void signOut()} />
      </> : <>
        <TextInput accessibilityLabel="Email" autoCapitalize="none" keyboardType="email-address" autoComplete="email" value={email} onChangeText={setEmail} placeholder="Email" style={styles.input} />
        <TextInput accessibilityLabel="Password" autoCapitalize="none" secureTextEntry autoComplete="current-password" value={password} onChangeText={setPassword} placeholder="Password" style={styles.input} />
        <Button title={busy ? 'Please wait…' : 'Sign in'} disabled={busy || !email.trim() || !password} onPress={() => void authenticate(false)} />
        <Button title="Create account" secondary disabled={busy || !email.trim() || password.length < 8} onPress={() => void authenticate(true)} />
        <Text style={styles.small}>Use at least 8 characters for a new account. Sign-in is real when configured; groups and payments remain demo data.</Text>
      </>}
      {!!message && <Text style={styles.small}>{message}</Text>}
    </Card>
    </>}
    {showConnections &&
    <Card>
      <Text style={styles.heading}>Backend connection</Text>
      <Text style={styles.small}>{apiUrl || 'No API configured. The demo works independently.'}</Text>
      <Button title={health.isFetching ? 'Checking…' : 'Check API connection'} disabled={!apiUrl || health.isFetching} secondary onPress={() => void health.refetch()} />
      {health.data && <Text style={styles.small}>{health.data}</Text>}
      {health.error && <Text style={styles.small}>{health.error.message} On a phone, use your computer’s LAN IP and allow port 3001 through the firewall.</Text>}
    </Card>
    }
    <Button title="Reset local demo" secondary onPress={reset} />
    <DemoNote />
  </Screen>;
}

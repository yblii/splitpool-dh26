import { useEffect, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { MemberAvatar } from '../components/people';
import { AppHeader, Button, Card, Screen, colors, styles } from '../components/ui';
import { DEMO_CARDS, useDemo } from '../state/demo';
import { apiUrl, checkApi } from '../lib/api';
import { getSupabase, supabaseConfigured } from '../lib/supabase';

export default function ProfileScreen() {
  const demo = useDemo();
  const [editing, setEditing] = useState(false);
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
    else { demo.reset(); setMessage('Signed out. Local bill reset.'); }
  }

  return <Screen header={<AppHeader title="Profile" onBack={() => router.back()} />}>
    <View style={{ alignItems: 'center', gap: 8, paddingTop: 8 }}>
      <MemberAvatar person={demo.you} size={88} />
      <Text style={styles.title}>{demo.profileName || 'You'}</Text>
      <Text style={styles.subtitle}>@{demo.username} · shown as You on bills</Text>
    </View>
    <Button title={editing ? 'Close editor' : 'Edit profile'} secondary onPress={() => setEditing((open) => !open)} />
    {editing && <Card>
      <Text style={styles.label}>Display name</Text>
      <TextInput accessibilityLabel="Display name" value={demo.profileName} onChangeText={demo.setProfileName} maxLength={30} style={styles.input} />
      <Text style={styles.label}>Username</Text>
      <TextInput accessibilityLabel="Username" autoCapitalize="none" autoCorrect={false} value={demo.username} onChangeText={demo.setUsername} maxLength={24} style={styles.input} />
      <Text style={styles.small}>Stored on this device until you reload. Reloading resets the demo bill.</Text>
    </Card>}
    <Card>
      <Text style={styles.heading}>Payment methods</Text>
      <Text style={styles.small}>These are labeled demo cards. Do not enter a real card number. SplitPool does not store one here.</Text>
      {DEMO_CARDS.map((card) => {
        const selected = demo.selectedCard?.id === card.id;
        return <Pressable
          key={card.id}
          accessibilityRole="button"
          accessibilityState={{ selected }}
          onPress={() => demo.selectCard(selected ? null : card.id)}
          style={{
            minHeight: 72, borderRadius: 16, borderWidth: 1.5, padding: 14, gap: 4,
            borderColor: selected ? colors.primary : colors.border,
            backgroundColor: selected ? colors.light : colors.paper,
          }}
        >
          <Text style={[styles.text, { fontWeight: '700' }]}>{card.brand}</Text>
          <Text style={styles.small}>···· {card.last4} · Demo card{selected ? ' · Selected' : ''}</Text>
        </Pressable>;
      })}
    </Card>
    <Card>
      <Text style={styles.heading}>Settings</Text>
      <Button title={showConnections ? 'Hide app connections' : 'App connections'} secondary onPress={() => setShowConnections((open) => !open)} />
      <Button title="Reset local demo" secondary onPress={() => { demo.reset(); setMessage('Demo reset. Groups, claims, and the sample bill are back to the start.'); }} />
      {!!message && !showConnections && <Text style={styles.small}>{message}</Text>}
    </Card>
    {(showConnections || supabaseConfigured) && <Card>
      <Text style={styles.heading}>Connected account</Text>
      {!supabaseConfigured ? <Text style={styles.small}>Add your Supabase URL and publishable key to apps/mobile/.env, then restart Expo. The demo works without an account.</Text> : signedInEmail ? <>
        <Text style={styles.text}>Signed in as {signedInEmail}</Text>
        <Button title="Sign out" secondary onPress={() => void signOut()} />
      </> : <>
        <TextInput accessibilityLabel="Email" autoCapitalize="none" keyboardType="email-address" autoComplete="email" value={email} onChangeText={setEmail} placeholder="Email" placeholderTextColor={colors.muted} style={styles.input} />
        <TextInput accessibilityLabel="Password" autoCapitalize="none" secureTextEntry autoComplete="current-password" value={password} onChangeText={setPassword} placeholder="Password" placeholderTextColor={colors.muted} style={styles.input} />
        <Button title={busy ? 'Please wait…' : 'Sign in'} disabled={busy || !email.trim() || !password} onPress={() => void authenticate(false)} />
        <Button title="Create account" secondary disabled={busy || !email.trim() || password.length < 8} onPress={() => void authenticate(true)} />
        <Text style={styles.small}>Use at least 8 characters for a new account. Sign-in is real when configured. Groups and payments stay demo data.</Text>
      </>}
      {!!message && <Text style={styles.small}>{message}</Text>}
    </Card>}
    {showConnections && <Card>
      <Text style={styles.heading}>Backend connection</Text>
      <Text style={styles.small}>{apiUrl || 'No API configured. The demo works on its own.'}</Text>
      <Button title={health.isFetching ? 'Checking…' : 'Check API connection'} disabled={!apiUrl || health.isFetching} secondary onPress={() => void health.refetch()} />
      {health.data && <Text style={styles.small}>{health.data}</Text>}
      {health.error && <Text style={styles.small}>{health.error.message}</Text>}
    </Card>}
  </Screen>;
}

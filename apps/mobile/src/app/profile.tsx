import { useEffect, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { MemberAvatar } from '../components/people';
import { AppHeader, Button, Card, Screen, colors, styles } from '../components/ui';
import { useDemo } from '../state/demo';
import { getSupabase, supabaseConfigured } from '../lib/supabase';
import { useAuth } from '../state/auth';
import { useAppProfile } from '../state/appProfile';

export default function ProfileScreen() {
  const demo = useDemo();
  const { session } = useAuth();
  const { status } = useAppProfile();
  const [editing, setEditing] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [signedInEmail, setSignedInEmail] = useState<string>();
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

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
      setMessage(result.error?.message ?? (signUp && !result.data.session ? 'Check your email to confirm your account, then sign in.' : 'Signed in.'));
      if (!result.error) setPassword('');
    } catch {
      setMessage('Could not sign in. Check your connection and try again.');
    } finally { setBusy(false); }
  }

  async function signOut() {
    const result = await getSupabase()?.auth.signOut();
    if (result?.error) setMessage(result.error.message);
    else { demo.reset(); setMessage('Signed out.'); }
  }

  return <Screen header={<AppHeader title="Profile" onBack={() => router.back()} />}>
    <View style={{ alignItems: 'center', gap: 8, paddingTop: 8 }}>
      <Text style={[styles.subheading, { textAlign: 'center' }]}>{demo.you.title || 'Your next meal has a title'}</Text>
      {demo.yourTitleSource && <Text style={styles.small}>{demo.yourTitleSource} · Your latest settled meal</Text>}
      <MemberAvatar person={demo.you} size={88} />
      <Text style={styles.title}>{demo.profileName || 'You'}</Text>
      <Text style={styles.subtitle}>@{demo.username} · shown as You on bills</Text>
    </View>
    <Button title={editing ? 'Close editor' : 'Edit profile'} secondary onPress={() => setEditing((open) => !open)} />
    {!!demo.you.title && <Button title="Hide my current title" secondary onPress={demo.dismissTitle} />}
    {editing && <Card>
      <Text style={styles.label}>Display name</Text>
      <TextInput accessibilityLabel="Display name" value={demo.profileName} onChangeText={demo.setProfileName} maxLength={30} style={styles.input} />
      <Text style={styles.label}>Username</Text>
      <TextInput accessibilityLabel="Username" autoCapitalize="none" autoCorrect={false} value={demo.username} onChangeText={demo.setUsername} maxLength={24} style={styles.input} />
    </Card>}
    <Card>
      <Text style={styles.heading}>Payment methods</Text>
      {demo.cards.map((card) => {
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
          <Text style={styles.small}>{card.last4 ? `···· ${card.last4} · ` : ''}Demo card{selected ? ' · Selected' : ''}</Text>
        </Pressable>;
      })}
    </Card>
    <Card>
      <Text style={styles.heading}>Settings</Text>
      <Button title={session ? 'Open shared groups' : 'Sign in for shared bills'} secondary onPress={() => router.push(session ? status === 'ready' ? '/connected' : '/profile-setup' : '/login')} />
      {session && status === 'ready' && <Button title="Edit connected account" secondary onPress={() => router.push('/account')} />}
      <Button title="Reset" secondary onPress={() => { demo.reset(); setMessage('Reset complete.'); }} />
      {!!message && <Text style={styles.small}>{message}</Text>}
    </Card>
    {supabaseConfigured && <Card>
      <Text style={styles.heading}>Account</Text>
      {signedInEmail ? <>
        <Text style={styles.text}>Signed in as {signedInEmail}</Text>
        <Button title="Sign out" secondary onPress={() => void signOut()} />
      </> : <>
        <TextInput accessibilityLabel="Email" autoCapitalize="none" keyboardType="email-address" autoComplete="email" value={email} onChangeText={setEmail} placeholder="Email" placeholderTextColor={colors.muted} style={styles.input} />
        <TextInput accessibilityLabel="Password" autoCapitalize="none" secureTextEntry autoComplete="current-password" value={password} onChangeText={setPassword} placeholder="Password" placeholderTextColor={colors.muted} style={styles.input} />
        <Button title={busy ? 'Please wait…' : 'Sign in'} disabled={busy || !email.trim() || !password} onPress={() => void authenticate(false)} />
        <Button title="Create account" secondary disabled={busy || !email.trim() || password.length < 8} onPress={() => void authenticate(true)} />
        <Text style={styles.small}>Password must be at least 8 characters.</Text>
      </>}
      {!!message && <Text style={styles.small}>{message}</Text>}
    </Card>}
  </Screen>;
}

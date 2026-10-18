import { useState } from 'react';
import { Alert, Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Button, Card, Screen, colors, styles } from '../components/ui';
import { useDemo } from '../state/demo';
import { useAuth, type AuthProfile } from '../state/auth';
import { useAppProfile } from '../state/appProfile';
import { apiUrl, checkApi } from '../lib/api';

export default function ProfileScreen() {
  const { profileName, setProfileName, linked, setLinked, reset } = useDemo();
  const { configured, session, profile, updateProfile, uploadAvatar, signOut } = useAuth();
  const { appProfile } = useAppProfile();
  const [draftProfile, setDraftProfile] = useState<AuthProfile | null>(null);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [showConnections, setShowConnections] = useState(false);
  const health = useQuery({ queryKey: ['health', apiUrl], queryFn: checkApi, enabled: false, retry: false });

  // Sync local form fields from auth profile. Do not call setProfileName here —
  // that updates DemoProvider and React forbids updating another component while rendering.
  if (profile !== draftProfile) {
    setDraftProfile(profile);
    if (profile) {
      setFirstName(profile.firstName);
      setLastName(profile.lastName);
      setPhone(profile.phone);
    } else {
      setFirstName('');
      setLastName('');
      setPhone('');
    }
  }

  async function saveProfile() {
    setBusy(true);
    setMessage('');
    const error = await updateProfile({ firstName, lastName, phone });
    setBusy(false);
    if (error) {
      setMessage(error);
      return;
    }
    const name = `${firstName.trim()} ${lastName.trim()}`.trim();
    if (name) setProfileName(name);
    setMessage('Profile updated.');
  }

  async function pickAvatar() {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Photo access needed', 'Allow photo library access to set a profile picture.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.8,
        allowsEditing: true,
        aspect: [1, 1],
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      setBusy(true);
      setMessage('');
      const error = await uploadAvatar({
        uri: asset.uri,
        mimeType: asset.mimeType ?? undefined,
      });
      setBusy(false);
      setMessage(error ?? 'Profile picture updated.');
    } catch {
      setBusy(false);
      setMessage('Could not open your photo library.');
    }
  }

  async function onSignOut() {
    setBusy(true);
    const error = await signOut();
    setBusy(false);
    if (error) setMessage(error);
    else {
      reset();
      setMessage('Signed out. Local bill reset.');
      router.replace('/login');
    }
  }

  if (!session) {
    return (
      <Screen>
        <View style={{ gap: 10 }}>
          <Text style={styles.title}>Your profile.</Text>
          <Text style={styles.subtitle}>
            Sign in to use SplitPool and manage your name, phone, and photo.
          </Text>
        </View>
        <Card>
          <Text style={styles.heading}>Account</Text>
          {!configured ? (
            <Text style={styles.small}>
              Add your Supabase URL and publishable key to apps/mobile/.env, then restart Expo.
            </Text>
          ) : (
            <Text style={styles.small}>Use your email and password to access profile details across devices.</Text>
          )}
          <Button title="Sign in" disabled={!configured} onPress={() => router.push('/login')} />
          <Button title="Create account" secondary disabled={!configured} onPress={() => router.push('/signup')} />
        </Card>
        <Card>
          <Text style={styles.heading}>Demo display name</Text>
          <Text style={styles.label}>Display name</Text>
          <TextInput
            accessibilityLabel="Display name"
            value={profileName}
            onChangeText={setProfileName}
            maxLength={30}
            style={styles.input}
            placeholder="Your name"
          />
          <Text style={styles.small}>Used only on this device until you sign in.</Text>
        </Card>
        <Card>
          <Text style={styles.heading}>Payment method</Text>
          <Text style={styles.text}>{linked ? 'Demo Visa ···· 4242' : 'No demo method selected'}</Text>
          <Button title={linked ? 'Remove demo card' : 'Use demo card'} secondary onPress={() => setLinked(!linked)} />
          <Text style={styles.small}>A sample card for trying the split. No payment details are collected.</Text>
        </Card>
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={{ gap: 10 }}>
        <Text style={styles.title}>Your details.</Text>
        <Text style={styles.subtitle}>Update your info or add a photo friends will recognize.</Text>
      </View>
      <Card>
        <Text style={styles.heading}>Photo</Text>
        <View style={local.avatarRow}>
          {profile?.avatarUrl ? (
            <Image accessibilityIgnoresInvertColors source={{ uri: profile.avatarUrl }} style={local.avatar} />
          ) : (
            <View style={[local.avatar, local.avatarPlaceholder]}>
              <Text style={local.initials}>
                {(firstName[0] || profileName[0] || '?').toUpperCase()}
              </Text>
            </View>
          )}
          <View style={{ flex: 1, gap: 10 }}>
            <Button title={busy ? 'Please wait…' : 'Upload photo'} secondary disabled={busy} onPress={() => void pickAvatar()} />
            <Text style={styles.small}>Stored in your Supabase “avatars” bucket when configured.</Text>
          </View>
        </View>
      </Card>
      <Card>
        <Text style={styles.heading}>Profile</Text>
        {appProfile && (
          <>
            <Text style={styles.label}>Username</Text>
            <Text style={styles.text}>@{appProfile.username}</Text>
            <Text style={styles.small}>App username in PostgreSQL (used for invites). Display name on bills: {appProfile.displayName}</Text>
          </>
        )}
        <Text style={styles.label}>First name</Text>
        <TextInput
          accessibilityLabel="First name"
          autoComplete="given-name"
          value={firstName}
          onChangeText={setFirstName}
          style={styles.input}
          placeholder="First name"
        />
        <Text style={styles.label}>Last name</Text>
        <TextInput
          accessibilityLabel="Last name"
          autoComplete="family-name"
          value={lastName}
          onChangeText={setLastName}
          style={styles.input}
          placeholder="Last name"
        />
        <Text style={styles.label}>Email</Text>
        <TextInput
          accessibilityLabel="Email"
          editable={false}
          value={profile?.email ?? ''}
          style={[styles.input, local.readOnly]}
        />
        <Text style={styles.label}>Phone number</Text>
        <TextInput
          accessibilityLabel="Phone number"
          autoComplete="tel"
          keyboardType="phone-pad"
          value={phone}
          onChangeText={setPhone}
          style={styles.input}
          placeholder="Phone number"
        />
        <Button
          title={busy ? 'Saving…' : 'Save changes'}
          disabled={busy || !firstName.trim() || !lastName.trim() || !phone.trim()}
          onPress={() => void saveProfile()}
        />
        {!!message && <Text style={styles.small}>{message}</Text>}
      </Card>
      <Card>
        <Text style={styles.heading}>Payment method</Text>
        <Text style={styles.text}>{linked ? 'Demo Visa ···· 4242' : 'No demo method selected'}</Text>
        <Button title={linked ? 'Remove demo card' : 'Use demo card'} secondary onPress={() => setLinked(!linked)} />
        <Text style={styles.small}>A sample card for trying the split. No payment details are collected.</Text>
      </Card>
      <Button title="Sign out" secondary disabled={busy} onPress={() => void onSignOut()} />
      <Button
        title={showConnections ? 'Hide app connections' : 'App connections'}
        secondary
        onPress={() => setShowConnections(!showConnections)}
      />
      {showConnections && (
        <Card>
          <Text style={styles.heading}>Backend connection</Text>
          <Text style={styles.small}>{apiUrl || 'No API configured. The demo works independently.'}</Text>
          <Button
            title={health.isFetching ? 'Checking…' : 'Check API connection'}
            disabled={!apiUrl || health.isFetching}
            secondary
            onPress={() => void health.refetch()}
          />
          {health.data && <Text style={styles.small}>{health.data}</Text>}
          {health.error && (
            <Text style={styles.small}>
              {health.error.message} On a phone, use your computer’s LAN IP and allow port 3001 through the firewall.
            </Text>
          )}
        </Card>
      )}
      <Button title="Reset local demo" secondary onPress={reset} />
      <Pressable onPress={() => router.push('/')} accessibilityRole="button" hitSlop={12}>
        <Text style={[styles.link, { textAlign: 'center' }]}>Back to bill</Text>
      </Pressable>
    </Screen>
  );
}

const local = StyleSheet.create({
  avatarRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  avatar: { width: 84, height: 84, borderRadius: 42, backgroundColor: colors.light },
  avatarPlaceholder: { alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border },
  initials: { color: colors.primary, fontSize: 28, fontWeight: '800' },
  readOnly: { opacity: 0.7 },
});

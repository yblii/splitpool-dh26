import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import { Platform } from 'react-native';
import type { Session, User } from '@supabase/supabase-js';
import { File } from 'expo-file-system';
import { getSupabase, supabaseConfigured } from '../lib/supabase';

export type AuthProfile = {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  avatarUrl?: string;
};

type SignUpInput = {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  phone: string;
};

type UpdateProfileInput = {
  firstName: string;
  lastName: string;
  phone: string;
};

type AuthContextValue = {
  configured: boolean;
  isLoading: boolean;
  session: Session | null;
  user: User | null;
  profile: AuthProfile | null;
  signIn: (email: string, password: string) => Promise<string | undefined>;
  signUp: (input: SignUpInput) => Promise<string | undefined>;
  signOut: () => Promise<string | undefined>;
  updateProfile: (input: UpdateProfileInput) => Promise<string | undefined>;
  uploadAvatar: (image: { uri: string; mimeType?: string }) => Promise<string | undefined>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function readMeta(user: User | undefined | null, key: string) {
  const value = user?.user_metadata?.[key];
  return typeof value === 'string' ? value : '';
}

export function profileFromUser(user: User | undefined | null): AuthProfile | null {
  if (!user) return null;
  const firstName = readMeta(user, 'first_name');
  const lastName = readMeta(user, 'last_name');
  const displayName = readMeta(user, 'display_name');
  const [fallbackFirst = '', ...rest] = displayName.split(/\s+/).filter(Boolean);
  return {
    firstName: firstName || fallbackFirst,
    lastName: lastName || rest.join(' '),
    phone: readMeta(user, 'phone') || user.phone || '',
    email: user.email ?? '',
    avatarUrl: readMeta(user, 'avatar_url') || undefined,
  };
}

export function displayNameFromProfile(profile: AuthProfile | null | undefined) {
  if (!profile) return '';
  return [profile.firstName, profile.lastName].filter(Boolean).join(' ').trim();
}

async function readImageBytes(uri: string) {
  if (Platform.OS === 'web') {
    const response = await fetch(uri);
    if (!response.ok) throw new Error('Could not read the selected photo.');
    return new Uint8Array(await response.arrayBuffer());
  }
  return new File(uri).bytes();
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [isLoading, setIsLoading] = useState(() => getSupabase() != null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<AuthProfile | null>(null);

  useEffect(() => {
    const client = getSupabase();
    if (!client) return;
    let active = true;
    void client.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setProfile(profileFromUser(data.session?.user));
      setIsLoading(false);
    });
    const { data } = client.auth.onAuthStateChange((_event, next) => {
      if (!active) return;
      setSession(next);
      setProfile(profileFromUser(next?.user));
      setIsLoading(false);
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    configured: supabaseConfigured,
    isLoading,
    session,
    user: session?.user ?? null,
    profile,
    async signIn(email, password) {
      const client = getSupabase();
      if (!client) return 'Add your Supabase URL and publishable key to apps/mobile/.env, then restart Expo.';
      try {
        const { error } = await client.auth.signInWithPassword({ email: email.trim(), password });
        return error?.message;
      } catch {
        return 'Could not reach Supabase. Check your connection and configuration.';
      }
    },
    async signUp({ firstName, lastName, email, password, phone }) {
      const client = getSupabase();
      if (!client) return 'Add your Supabase URL and publishable key to apps/mobile/.env, then restart Expo.';
      const trimmedFirst = firstName.trim();
      const trimmedLast = lastName.trim();
      try {
        const { data, error } = await client.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: {
              first_name: trimmedFirst,
              last_name: trimmedLast,
              display_name: `${trimmedFirst} ${trimmedLast}`.trim(),
              phone: phone.trim(),
            },
          },
        });
        if (error) return error.message;
        if (!data.session) return 'Check your email to confirm your account, then sign in.';
        return undefined;
      } catch {
        return 'Could not reach Supabase. Check your connection and configuration.';
      }
    },
    async signOut() {
      const client = getSupabase();
      if (!client) return undefined;
      const { error } = await client.auth.signOut();
      return error?.message;
    },
    async updateProfile({ firstName, lastName, phone }) {
      const client = getSupabase();
      if (!client) return 'Supabase is not configured.';
      const trimmedFirst = firstName.trim();
      const trimmedLast = lastName.trim();
      try {
        const { data, error } = await client.auth.updateUser({
          data: {
            first_name: trimmedFirst,
            last_name: trimmedLast,
            display_name: `${trimmedFirst} ${trimmedLast}`.trim(),
            phone: phone.trim(),
          },
        });
        if (error) return error.message;
        setProfile(profileFromUser(data.user));
        return undefined;
      } catch {
        return 'Could not update your profile. Try again.';
      }
    },
    async uploadAvatar(image) {
      const client = getSupabase();
      const userId = session?.user.id;
      if (!client || !userId) return 'Sign in before uploading a profile photo.';
      const mimeType = image.mimeType || 'image/jpeg';
      const extension = mimeType.includes('png') ? 'png' : mimeType.includes('webp') ? 'webp' : 'jpg';
      const path = `${userId}/avatar.${extension}`;
      try {
        const bytes = await readImageBytes(image.uri);
        const { error: uploadError } = await client.storage.from('avatars').upload(path, bytes, {
          contentType: mimeType,
          upsert: true,
        });
        if (uploadError) {
          return uploadError.message.includes('Bucket not found')
            ? 'Create a public Storage bucket named “avatars” in your Supabase project, then try again.'
            : uploadError.message;
        }
        const { data: publicUrl } = client.storage.from('avatars').getPublicUrl(path);
        const avatarUrl = `${publicUrl.publicUrl}?t=${Date.now()}`;
        const { data, error } = await client.auth.updateUser({ data: { avatar_url: avatarUrl } });
        if (error) return error.message;
        setProfile(profileFromUser(data.user));
        return undefined;
      } catch {
        return 'Could not upload that photo. Try another image.';
      }
    },
  }), [isLoading, profile, session]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be inside AuthProvider');
  return value;
}

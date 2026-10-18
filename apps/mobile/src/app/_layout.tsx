import { useEffect, useState } from 'react';
import { AppState, Platform, Text, View } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { colors } from '../components/ui';
import { ProfileIconButton } from '../components/ProfileIcon';
import { AuthProvider, useAuth } from '../state/auth';
import { AppProfileProvider, useAppProfile } from '../state/appProfile';
import { DemoProvider } from '../state/demo';
import { getSupabase, logSupabaseEnvStatus } from '../lib/supabase';

function RootNavigator() {
  const { session, profile, isLoading: authLoading } = useAuth();
  const { status: appProfileStatus } = useAppProfile();
  const signedIn = Boolean(session);
  const profileReady = signedIn && appProfileStatus === 'ready';
  const needsProfileSetup = signedIn && (appProfileStatus === 'needsSetup' || appProfileStatus === 'unavailable');

  if (authLoading || (signedIn && appProfileStatus === 'loading')) {
    return <View style={{ flex: 1, backgroundColor: colors.background }} />;
  }

  return (
    <Stack screenOptions={{
      headerStyle: { backgroundColor: colors.background },
      headerTintColor: colors.ink,
      headerTitleAlign: 'center',
      headerTitle: ({ children }) => (
        <Text numberOfLines={1} style={{ color: colors.ink, fontSize: 14, fontWeight: '800', letterSpacing: 1.8 }}>
          {children}
        </Text>
      ),
      headerShadowVisible: false,
      contentStyle: { backgroundColor: colors.background },
      headerBackTitle: 'Back',
    }}>
      <Stack.Protected guard={profileReady}>
        <Stack.Screen
          name="index"
          options={{
            title: 'SPLITPOOL',
            headerRight: () => (
              <ProfileIconButton
                avatarUrl={profile?.avatarUrl}
                onPress={() => router.push('/profile')}
              />
            ),
          }}
        />
        <Stack.Screen name="group/[groupId]" options={{ title: 'GROUP' }} />
        <Stack.Screen name="bill/[billId]" options={{ title: 'BILL' }} />
        <Stack.Screen name="invite/[token]" options={{ title: 'JOIN GROUP' }} />
        <Stack.Screen name="receipt" options={{ title: 'RECEIPT' }} />
        <Stack.Screen name="receipt-review" options={{ title: 'REVIEW' }} />
        <Stack.Screen name="profile" options={{ title: 'PROFILE' }} />
        <Stack.Screen name="payment" options={{ title: 'PAYMENT' }} />
      </Stack.Protected>
      <Stack.Protected guard={needsProfileSetup}>
        <Stack.Screen
          name="profile-setup"
          options={{
            title: appProfileStatus === 'unavailable' ? 'API SETUP' : 'PROFILE SETUP',
            headerBackVisible: false,
          }}
        />
      </Stack.Protected>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="login" options={{ title: 'SIGN IN', headerBackVisible: false }} />
        <Stack.Screen name="signup" options={{ title: 'SIGN UP' }} />
        <Stack.Screen name="verify-email" options={{ title: 'VERIFY EMAIL', headerBackVisible: false }} />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  const [queryClient] = useState(() => new QueryClient());
  useEffect(() => {
    logSupabaseEnvStatus('[SplitPool] Supabase env (root layout)');
    const client = getSupabase();
    if (!client || Platform.OS === 'web') return;
    if (AppState.currentState === 'active') client.auth.startAutoRefresh();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') client.auth.startAutoRefresh();
      else client.auth.stopAutoRefresh();
    });
    return () => {
      subscription.remove();
      client.auth.stopAutoRefresh();
    };
  }, []);

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <AppProfileProvider>
            <DemoProvider>
              <StatusBar style="dark" />
              <RootNavigator />
            </DemoProvider>
          </AppProfileProvider>
        </AuthProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

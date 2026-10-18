import { useEffect, useState } from 'react';
import { AppState, Platform, Pressable, Text } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { colors, styles } from '../components/ui';
import { DemoProvider } from '../state/demo';
import { getSupabase } from '../lib/supabase';

export default function RootLayout() {
  const [queryClient] = useState(() => new QueryClient());
  useEffect(() => {
    const client = getSupabase();
    if (!client || Platform.OS === 'web') return;
    if (AppState.currentState === 'active') client.auth.startAutoRefresh();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') client.auth.startAutoRefresh();
      else client.auth.stopAutoRefresh();
    });
    return () => { subscription.remove(); client.auth.stopAutoRefresh(); };
  }, []);
  return <SafeAreaProvider><QueryClientProvider client={queryClient}><DemoProvider>
    <StatusBar style="dark" />
    <Stack screenOptions={{ headerStyle: { backgroundColor: colors.background }, headerTintColor: colors.ink,
      headerTitleAlign: 'center', headerTitle: ({ children }) => <Text numberOfLines={1}
        style={{ color: colors.ink, fontSize: 14, fontWeight: '800', letterSpacing: 1.8 }}>{children}</Text>,
      headerShadowVisible: false, contentStyle: { backgroundColor: colors.background }, headerBackTitle: 'Back' }}>
      <Stack.Screen name="index" options={{ title: 'SPLITPOOL', headerRight: () => <Pressable
        accessibilityRole="button" accessibilityLabel="Open profile" hitSlop={12} onPress={() => router.push('/profile')}
        style={{ paddingVertical: 12, paddingHorizontal: 16 }}><Text style={styles.link}>Profile</Text></Pressable> }} />
      <Stack.Screen name="receipt" options={{ title: 'RECEIPT' }} />
      <Stack.Screen name="receipt-review" options={{ title: 'REVIEW' }} />
      <Stack.Screen name="profile" options={{ title: 'PROFILE' }} />
      <Stack.Screen name="payment" options={{ title: 'PAYMENT' }} />
    </Stack>
  </DemoProvider></QueryClientProvider></SafeAreaProvider>;
}

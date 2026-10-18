import { useEffect, useState } from 'react';
import { AppState, Platform, View } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useInter } from '../fonts';
import { colors } from '../components/ui';
import { DemoProvider } from '../state/demo';
import { getSupabase } from '../lib/supabase';

export default function RootLayout() {
  const [queryClient] = useState(() => new QueryClient());
  const fontsReady = useInter();
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
  if (!fontsReady) return null;
  return <SafeAreaProvider>
    <QueryClientProvider client={queryClient}>
      <DemoProvider>
        <StatusBar style="dark" />
        <View style={{ flex: 1, backgroundColor: Platform.OS === 'web' ? '#D5DEE6' : colors.background, alignItems: 'center' }}>
          <View style={{ flex: 1, width: '100%', maxWidth: Platform.OS === 'web' ? 430 : undefined, backgroundColor: colors.background }}>
            <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }} />
          </View>
        </View>
      </DemoProvider>
    </QueryClientProvider>
  </SafeAreaProvider>;
}

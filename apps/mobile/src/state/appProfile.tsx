import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import type { Profile } from '@splitpool/contracts';
import { ApiClientError, getMe, isApiConfigured, saveAppProfile } from '../lib/apiClient';
import { useAuth } from './auth';

export type AppProfileStatus = 'loading' | 'needsSetup' | 'ready' | 'unavailable';

type RemoteState = {
  loadId: string | null;
  status: AppProfileStatus;
  profile: Profile | null;
  error: string | null;
};

type AppProfileContextValue = {
  status: AppProfileStatus;
  appProfile: Profile | null;
  errorMessage: string | null;
  refresh: () => Promise<void>;
  completeSetup: (input: { username: string; displayName: string }) => Promise<string | undefined>;
};

const AppProfileContext = createContext<AppProfileContextValue | null>(null);

const apiMissingMessage =
  'Set EXPO_PUBLIC_API_URL in apps/mobile/.env (use your computer’s LAN IP on a phone), then restart Expo.';

export function AppProfileProvider({ children }: PropsWithChildren) {
  const { session, isLoading: authLoading } = useAuth();
  const [reloadKey, setReloadKey] = useState(0);
  const [remote, setRemote] = useState<RemoteState>({
    loadId: null,
    status: 'loading',
    profile: null,
    error: null,
  });

  const userId = session?.user.id ?? null;
  const loadId = userId ? `${userId}:${reloadKey}` : null;

  if (!authLoading && loadId !== remote.loadId) {
    if (!loadId) {
      setRemote({ loadId: null, status: 'loading', profile: null, error: null });
    } else if (!isApiConfigured()) {
      setRemote({
        loadId,
        status: 'unavailable',
        profile: null,
        error: apiMissingMessage,
      });
    } else {
      setRemote({ loadId, status: 'loading', profile: null, error: null });
    }
  }

  useEffect(() => {
    if (authLoading || !loadId || !isApiConfigured()) return;
    if (remote.loadId !== loadId || remote.status !== 'loading') return;

    let active = true;
    void getMe()
      .then((profile) => {
        if (!active) return;
        setRemote({
          loadId,
          status: profile ? 'ready' : 'needsSetup',
          profile,
          error: null,
        });
      })
      .catch((error: unknown) => {
        if (!active) return;
        const message = error instanceof ApiClientError
          ? error.message
          : 'Could not reach the API. Is it running and reachable from this device?';
        setRemote({
          loadId,
          status: 'unavailable',
          profile: null,
          error: message,
        });
      });

    return () => {
      active = false;
    };
  }, [authLoading, loadId, remote.loadId, remote.status]);

  const value = useMemo<AppProfileContextValue>(() => ({
    status: remote.status,
    appProfile: remote.profile,
    errorMessage: remote.error,
    async refresh() {
      setReloadKey((current) => current + 1);
    },
    async completeSetup(input) {
      try {
        const profile = await saveAppProfile({
          username: input.username.trim().toLowerCase(),
          displayName: input.displayName.trim(),
        });
        setRemote({
          loadId,
          status: 'ready',
          profile,
          error: null,
        });
        return undefined;
      } catch (error) {
        if (error instanceof ApiClientError) return error.message;
        return 'Could not save your profile. Try again.';
      }
    },
  }), [loadId, remote.error, remote.profile, remote.status]);

  return <AppProfileContext.Provider value={value}>{children}</AppProfileContext.Provider>;
}

export function useAppProfile() {
  const value = useContext(AppProfileContext);
  if (!value) throw new Error('useAppProfile must be inside AppProfileProvider');
  return value;
}

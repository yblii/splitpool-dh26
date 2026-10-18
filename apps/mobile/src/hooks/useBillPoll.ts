import { useCallback, useState } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';
import type { BillResponse, GroupDetail } from '@splitpool/contracts';
import { formatApiError, getBill, getGroup } from '../lib/apiClient';

const POLL_MS = 2000;

type UseBillPollOptions = {
  billId?: string;
};

/**
 * Authoritative bill polling while the screen is focused and the app is foregrounded.
 * Refetch also runs on focus and when callers invoke `refresh` after mutations / 409s.
 */
export function useBillPoll({ billId }: UseBillPollOptions) {
  const [bill, setBill] = useState<BillResponse | null>(null);
  const [group, setGroup] = useState<GroupDetail | null>(null);
  const [message, setMessage] = useState('');
  const [conflict, setConflict] = useState(false);
  const [loading, setLoading] = useState(Boolean(billId));

  const refresh = useCallback(async (options?: { quiet?: boolean; clearConflict?: boolean }) => {
    if (!billId) return null;
    if (!options?.quiet) setLoading(true);
    if (!options?.quiet) setMessage('');
    if (options?.clearConflict) setConflict(false);
    try {
      const nextBill = await getBill(billId);
      setBill(nextBill);
      // Closed bills leave open listings; group remains readable with activeBillId null.
      setGroup(await getGroup(nextBill.groupId));
      return nextBill;
    } catch (error) {
      setMessage(formatApiError(error));
      if (!options?.quiet) {
        setBill(null);
        setGroup(null);
      }
      return null;
    } finally {
      if (!options?.quiet) setLoading(false);
    }
  }, [billId]);

  const markConflict = useCallback(() => {
    setConflict(true);
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (!billId) return undefined;
      let cancelled = false;
      let timer: ReturnType<typeof setInterval> | undefined;

      const tick = () => {
        if (cancelled) return;
        if (AppState.currentState !== 'active') return;
        void refresh({ quiet: true });
      };

      void refresh();
      timer = setInterval(tick, POLL_MS);

      const subscription = AppState.addEventListener('change', (state) => {
        if (state === 'active' && !cancelled) void refresh({ quiet: true });
      });

      return () => {
        cancelled = true;
        if (timer) clearInterval(timer);
        subscription.remove();
      };
    }, [refresh, billId]),
  );

  return {
    bill,
    setBill,
    group,
    message,
    setMessage,
    conflict,
    setConflict,
    markConflict,
    loading,
    refresh,
  };
}

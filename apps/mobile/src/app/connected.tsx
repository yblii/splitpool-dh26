import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import type { Group } from '@splitpool/contracts';
import { Button, Card, DemoNote, Screen, colors, styles } from '../components/ui';
import { closeBill, createGroup, formatApiError, listGroups } from '../lib/apiClient';
import { getBillPayment } from '../lib/paymentApi';
import { useAppProfile } from '../state/appProfile';

export default function LandingScreen() {
  const { appProfile } = useAppProfile();
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const loadGroups = useCallback(async () => {
    setLoading(true);
    setMessage('');
    try {
      let next = await listGroups();
      const userId = appProfile?.userId;
      if (userId) {
        for (const group of next) {
          if (!group.activeBillId) continue;
          try {
            const payment = await getBillPayment(group.activeBillId, userId);
            const phase = payment?.session?.phase;
            if (phase === 'paid' || phase === 'canceled') {
              await closeBill(group.activeBillId, phase === 'paid' ? 'PAID' : 'CANCELLED');
            }
          } catch {
            // Ignore per-group payment reads; listing still renders.
          }
        }
        next = await listGroups();
      }
      setGroups(next);
    } catch (error) {
      setMessage(formatApiError(error));
    } finally {
      setLoading(false);
    }
  }, [appProfile]);

  useFocusEffect(
    useCallback(() => {
      void loadGroups();
    }, [loadGroups]),
  );

  async function onCreateGroup() {
    if (!appProfile) return;
    const name = groupName.trim();
    if (!name) return;
    setBusy(true);
    setMessage('');
    try {
      const group = await createGroup(name);
      if (!group.activeBillId) throw new Error('Group was created without a bill.');
      setGroupName('');
      setShowCreate(false);
      router.push({ pathname: '/bill/[billId]', params: { billId: group.activeBillId } });
    } catch (error) {
      setMessage(formatApiError(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <View style={styles.row}>
        <Button title="Back to demo" secondary onPress={() => router.replace('/')} />
        <Button title="Account" secondary onPress={() => router.push('/account')} />
      </View>
      <View style={{ gap: 10 }}>
        <Text style={styles.title}>Your groups.</Text>
        <Text style={styles.subtitle}>
          {appProfile
            ? `Signed in as @${appProfile.username}. Each group is one open bill.`
            : 'Create a group to open a bill.'}
        </Text>
      </View>

      {!showCreate ? (
        <Button title="New group" onPress={() => { setShowCreate(true); setMessage(''); }} />
      ) : (
        <Card>
          <Text style={styles.heading}>New group</Text>
          <Text style={styles.label}>Group name</Text>
          <TextInput
            accessibilityLabel="Group name"
            value={groupName}
            onChangeText={setGroupName}
            placeholder="e.g. Friday dinner"
            style={styles.input}
            maxLength={100}
            autoFocus
          />
          <Button
            title={busy ? 'Creating…' : 'Create group & bill'}
            disabled={busy || !groupName.trim() || !appProfile}
            onPress={() => void onCreateGroup()}
          />
          <Button
            title="Cancel"
            secondary
            disabled={busy}
            onPress={() => { setShowCreate(false); setGroupName(''); }}
          />
        </Card>
      )}

      {!!message && <Text style={[styles.small, { color: colors.warning }]}>{message}</Text>}

      <View style={{ gap: 12 }}>
        <View style={styles.row}>
          <Text style={styles.heading}>Open bills</Text>
          <Pressable accessibilityRole="button" hitSlop={12} onPress={() => void loadGroups()}>
            <Text style={styles.link}>{loading ? 'Loading…' : 'Refresh'}</Text>
          </Pressable>
        </View>

        {!loading && groups.length === 0 && (
          <Text style={styles.small}>No open bills. Tap New group to start one.</Text>
        )}

        {groups.map((group) => (
          <Pressable
            key={group.id}
            accessibilityRole="button"
            accessibilityLabel={`Open bill ${group.name}`}
            onPress={() => {
              if (!group.activeBillId) return;
              router.push({ pathname: '/bill/[billId]', params: { billId: group.activeBillId } });
            }}
            style={({ pressed }) => [local.groupRow, pressed && { opacity: 0.75 }]}
          >
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={local.groupName}>{group.name}</Text>
              <Text style={styles.small}>
                Open bill
                {group.hostId === appProfile?.userId ? ' · You are host' : ''}
              </Text>
            </View>
            <Text style={styles.link}>Open</Text>
          </Pressable>
        ))}
      </View>

      <DemoNote />
    </Screen>
  );
}

const local = StyleSheet.create({
  groupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  groupName: {
    color: colors.ink,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '700',
  },
});

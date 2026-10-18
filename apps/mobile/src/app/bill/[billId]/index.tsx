import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams, type Href } from 'expo-router';
import { formatMoney, type BillResponse, type GroupDetail } from '@splitpool/contracts';
import { Button, Card, DemoNote, Screen, colors, styles } from '../../../components/ui';
import { formatApiError, getBill, getGroup } from '../../../lib/apiClient';
import { useAppProfile } from '../../../state/appProfile';

export default function BillScreen() {
  const { billId } = useLocalSearchParams<{ billId: string }>();
  const { appProfile } = useAppProfile();
  const [bill, setBill] = useState<BillResponse | null>(null);
  const [group, setGroup] = useState<GroupDetail | null>(null);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!billId) return;
    setLoading(true);
    setMessage('');
    try {
      const nextBill = await getBill(billId);
      setBill(nextBill);
      setGroup(await getGroup(nextBill.groupId));
    } catch (error) {
      setMessage(formatApiError(error));
      setBill(null);
      setGroup(null);
    } finally {
      setLoading(false);
    }
  }, [billId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (!billId) {
    return (
      <Screen>
        <Text style={styles.subtitle}>Missing bill id.</Text>
      </Screen>
    );
  }

  const isHost = Boolean(bill && group && appProfile && group.hostId === appProfile.userId);
  const canScan = Boolean(isHost && bill?.state === 'EDITING');

  return (
    <Screen>
      <View style={{ gap: 10 }}>
        <Text style={styles.title}>{bill?.merchant || 'New bill'}</Text>
        <Text style={styles.subtitle}>
          {loading
            ? 'Loading…'
            : bill
              ? `${bill.state} · v${bill.version} · ${bill.participants.length} payer${bill.participants.length === 1 ? '' : 's'}`
              : 'Could not load bill'}
        </Text>
      </View>

      {bill && (
        <>
          <View style={local.totalRow}>
            <View style={{ gap: 5 }}>
              <Text style={styles.label}>Bill total</Text>
              <Text style={local.total}>{formatMoney(bill.summary.totalCents)}</Text>
            </View>
            <Text style={[styles.label, { color: bill.summary.complete ? colors.success : colors.warning }]}>
              {bill.summary.complete ? 'Ready' : `${bill.summary.blockers.length} blocker${bill.summary.blockers.length === 1 ? '' : 's'}`}
            </Text>
          </View>

          <Card>
            <Text style={styles.heading}>Payers</Text>
            {bill.participants.map((participant) => (
              <Text key={participant.userId} style={styles.text}>
                {participant.displayName}
                {participant.userId === appProfile?.userId ? ' · you' : ''}
                {participant.tipCents > 0 ? ` · tip ${formatMoney(participant.tipCents)}` : ''}
              </Text>
            ))}
          </Card>

          <Card>
            <Text style={styles.heading}>Items</Text>
            {bill.items.length === 0 ? (
              <Text style={styles.small}>
                {canScan
                  ? 'No items yet. Scan a receipt to load a draft for host review.'
                  : 'No items yet. The group host scans and confirms the receipt first. Concurrent claims follow in Phase D.'}
              </Text>
            ) : (
              bill.items.map((item) => (
                <View key={item.id} style={styles.row}>
                  <Text style={[styles.text, { flex: 1 }]}>
                    {item.name}
                    {item.quantity > 1 ? ` ×${item.quantity}` : ''}
                  </Text>
                  <Text style={styles.text}>{formatMoney(item.netLineTotalCents)}</Text>
                </View>
              ))
            )}
          </Card>

          {bill.summary.blockers.length > 0 && (
            <Card>
              <Text style={styles.heading}>Blockers</Text>
              {bill.summary.blockers.map((blocker, index) => (
                <Text key={`${blocker.code}-${index}`} style={[styles.small, { color: colors.warning }]}>
                  {blocker.code}
                </Text>
              ))}
            </Card>
          )}
        </>
      )}

      {!!message && <Text style={[styles.small, { color: colors.warning }]}>{message}</Text>}

      {canScan && bill && (
        <Button
          title={bill.items.length ? 'Rescan receipt' : 'Scan receipt'}
          onPress={() => router.push({
            pathname: '/bill/[billId]/receipt',
            params: { billId: bill.id, expectedVersion: String(bill.version) },
          } as unknown as Href)}
        />
      )}
      <Button title="Refresh" secondary disabled={loading} onPress={() => void load()} />
      {bill && (
        <Button
          title="Group details"
          secondary
          onPress={() => router.push({ pathname: '/group/[groupId]', params: { groupId: bill.groupId } })}
        />
      )}
      <Button title="Back to groups" secondary onPress={() => router.replace('/')} />
      <DemoNote />
    </Screen>
  );
}

const local = StyleSheet.create({
  totalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 20,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.border,
    gap: 12,
  },
  total: {
    color: colors.ink,
    fontSize: 34,
    lineHeight: 41,
    letterSpacing: -0.8,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
});

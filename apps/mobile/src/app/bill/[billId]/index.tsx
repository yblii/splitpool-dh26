import { useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { formatMoney, type BillItem, type BillResponse, type Fraction } from '@splitpool/contracts';
import { Button, Card, DemoNote, Screen, SegmentedControl, colors, styles } from '../../../components/ui';
import { useBillPoll } from '../../../hooks/useBillPoll';
import {
  formatApiError,
  isApiClientError,
  setItemClaim,
} from '../../../lib/apiClient';
import {
  claimForUser,
  claimMinePlusRemaining,
  equalPayerShare,
  formatFraction,
  fractionsEqual,
  remainingForItem,
} from '../../../lib/claims';
import { useAppProfile } from '../../../state/appProfile';

function ClaimControls({
  bill,
  item,
  userId,
  busy,
  onClaim,
}: {
  bill: BillResponse;
  item: BillItem;
  userId: string;
  busy: boolean;
  onClaim: (fraction: Fraction) => void;
}) {
  const mine = claimForUser(bill.claims, item.id, userId)?.fraction;
  const remaining = remainingForItem(bill, item.id);
  const equal = equalPayerShare(bill.participants.length);
  const takeRest = claimMinePlusRemaining(mine, remaining);
  const others = bill.claims.filter((claim) => claim.itemId === item.id && claim.userId !== userId);

  const selected: 'none' | 'half' | 'equal' | 'all' | 'custom' = !mine || mine.numerator === 0
    ? 'none'
    : fractionsEqual(mine, { numerator: 1, denominator: 2 })
      ? 'half'
      : fractionsEqual(mine, equal)
        ? 'equal'
        : fractionsEqual(mine, { numerator: 1, denominator: 1 })
          ? 'all'
          : 'custom';

  return (
    <View style={{ gap: 10 }}>
      <View style={styles.row}>
        <Text style={[styles.text, { flex: 1 }]}>
          {item.name}
          {item.quantity > 1 ? ` ×${item.quantity}` : ''}
        </Text>
        <Text style={styles.text}>{formatMoney(item.netLineTotalCents)}</Text>
      </View>
      <Text style={styles.small}>
        Your claim · {mine && mine.numerator > 0 ? formatFraction(mine) : 'none'}
        {' · '}
        Left · {remaining.numerator}/{remaining.denominator}
      </Text>
      {others.length > 0 && (
        <Text style={styles.small}>
          Others · {others.map((claim) => {
            const person = bill.participants.find((participant) => participant.userId === claim.userId);
            return `${person?.displayName ?? 'Payer'} ${formatFraction(claim.fraction)}`;
          }).join(' · ')}
        </Text>
      )}
      <SegmentedControl
        label={`Claim ${item.name}`}
        disabled={busy || bill.state !== 'EDITING'}
        value={selected === 'custom' ? '' : selected}
        onChange={(value) => {
          if (value === 'none') onClaim({ numerator: 0, denominator: 1 });
          else if (value === 'half') onClaim({ numerator: 1, denominator: 2 });
          else if (value === 'equal') onClaim(equal);
          else if (value === 'all') onClaim({ numerator: 1, denominator: 1 });
        }}
        options={[
          { value: 'none', label: 'None' },
          { value: 'half', label: '½' },
          { value: 'equal', label: `1/${bill.participants.length}` },
          { value: 'all', label: 'All' },
        ]}
      />
      {takeRest && takeRest.numerator > 0 && !(mine && fractionsEqual(mine, takeRest)) && (
        <Button
          title={`Take remaining (${formatFraction(takeRest)})`}
          secondary
          disabled={busy || bill.state !== 'EDITING'}
          onPress={() => onClaim(takeRest)}
        />
      )}
      {selected === 'custom' && mine && (
        <Text style={styles.small}>Custom claim {formatFraction(mine)} is set. Choose a preset to change it.</Text>
      )}
    </View>
  );
}

export default function BillScreen() {
  const { billId } = useLocalSearchParams<{ billId: string }>();
  const { appProfile } = useAppProfile();
  const {
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
  } = useBillPoll({ billId });
  const [busy, setBusy] = useState(false);

  const userId = appProfile?.userId;
  const isHost = Boolean(bill && group && userId && group.hostId === userId);
  const canEdit = bill?.state === 'EDITING';
  const canScan = Boolean(isHost && canEdit);
  const myShare = useMemo(
    () => (bill && userId ? bill.summary.shares.find((share) => share.userId === userId) : undefined),
    [bill, userId],
  );

  async function handleMutationError(error: unknown) {
    if (isApiClientError(error) && error.code === 'VERSION_CONFLICT') {
      markConflict();
      await refresh({ quiet: true });
      Alert.alert('Someone else updated — retry.', 'The bill changed. Your last edit was not applied.');
      return;
    }
    setMessage(formatApiError(error));
  }

  async function onClaim(itemId: string, fraction: Fraction) {
    if (!bill || !canEdit) return;
    setBusy(true);
    setMessage('');
    setConflict(false);
    try {
      const next = await setItemClaim(bill.id, itemId, {
        expectedVersion: bill.version,
        fraction,
      });
      setBill(next);
    } catch (error) {
      await handleMutationError(error);
    } finally {
      setBusy(false);
    }
  }

  if (!billId) {
    return (
      <Screen>
        <Text style={styles.subtitle}>Missing bill id.</Text>
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={{ gap: 10 }}>
        <Text style={styles.title}>{bill?.merchant || 'New bill'}</Text>
        <Text style={styles.subtitle}>
          {loading && !bill
            ? 'Loading…'
            : bill
              ? `${bill.state} · v${bill.version} · ${bill.participants.length} payer${bill.participants.length === 1 ? '' : 's'}`
              : 'Could not load bill'}
        </Text>
      </View>

      {conflict && (
        <View style={local.banner}>
          <Text style={[styles.label, { color: colors.warning }]}>Someone else updated — retry.</Text>
          <Text style={styles.small}>Pull the latest bill state, then try your claim again.</Text>
          <Button title="Refresh now" secondary disabled={busy} onPress={() => void refresh({ clearConflict: true })} />
        </View>
      )}

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

          {myShare && (
            <Card>
              <Text style={styles.heading}>Your share</Text>
              <Text style={styles.small}>
                {bill.summary.complete
                  ? 'Tax and tip are split from your claimed items.'
                  : 'Tax and tip appear here once every item is claimed.'}
              </Text>
              <View style={styles.row}>
                <Text style={styles.text}>Items</Text>
                <Text style={styles.text}>{formatMoney(myShare.itemsCents)}</Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.text}>Tax</Text>
                <Text style={styles.text}>{formatMoney(myShare.taxCents)}</Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.text}>Tip / service</Text>
                <Text style={styles.text}>{formatMoney(myShare.serviceChargeCents)}</Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.heading}>You owe</Text>
                <Text style={styles.heading}>{formatMoney(myShare.totalCents)}</Text>
              </View>
            </Card>
          )}

          <Card>
            <Text style={styles.heading}>Items</Text>
            {bill.items.length === 0 ? (
              <Text style={styles.small}>
                {canScan
                  ? 'No items yet. Scan a receipt to load a draft for host review.'
                  : 'No items yet. The group host scans and confirms the receipt first.'}
              </Text>
            ) : userId ? (
              bill.items.map((item) => (
                <View key={item.id} style={{ gap: 10, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                  <ClaimControls
                    bill={bill}
                    item={item}
                    userId={userId}
                    busy={busy}
                    onClaim={(fraction) => void onClaim(item.id, fraction)}
                  />
                </View>
              ))
            ) : null}
          </Card>

          <Card>
            <Text style={styles.heading}>Members</Text>
            <Text style={styles.small}>Everyone in the group is a payer on this bill.</Text>
            {bill.participants.map((participant) => (
              <Text key={participant.userId} style={styles.text}>
                {participant.displayName}
                {participant.userId === userId ? ' · you' : ''}
              </Text>
            ))}
          </Card>

          {bill.summary.blockers.length > 0 && (
            <Card>
              <Text style={styles.heading}>Blockers</Text>
              {bill.summary.blockers.map((blocker, index) => (
                <Text key={`${blocker.code}-${index}`} style={[styles.small, { color: colors.warning }]}>
                  {blocker.code}
                  {blocker.itemId ? ` · ${bill.items.find((item) => item.id === blocker.itemId)?.name ?? blocker.itemId}` : ''}
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
          disabled={busy}
          onPress={() => router.push({
            pathname: '/bill/[billId]/receipt',
            params: { billId: bill.id, expectedVersion: String(bill.version) },
          } as unknown as Href)}
        />
      )}
      {bill?.state === 'PAID' && (
        <Text style={styles.small}>This bill is paid and no longer open.</Text>
      )}
      {bill && bill.state !== 'PAID' && bill.state !== 'CANCELLED' && bill.summary.complete && (
        <Button
          title={isHost ? 'Confirm Payment' : 'Continue to payment'}
          disabled={busy}
          onPress={() => router.push({
            pathname: '/bill/[billId]/payment',
            params: { billId: bill.id },
          } as unknown as Href)}
        />
      )}
      {bill && bill.state !== 'PAID' && bill.state !== 'CANCELLED' && !bill.summary.complete && bill.items.length > 0 && (
        <Text style={[styles.small, { color: colors.warning }]}>
          Claim every item before the host can confirm payment.
        </Text>
      )}
      <Button title="Refresh" secondary disabled={loading || busy} onPress={() => void refresh({ clearConflict: true })} />
      {bill && bill.state !== 'PAID' && bill.state !== 'CANCELLED' && (
        <Button
          title="Group details"
          secondary
          disabled={busy}
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
  banner: {
    backgroundColor: colors.light,
    borderWidth: 1,
    borderColor: colors.warning,
    padding: 14,
    gap: 8,
  },
});

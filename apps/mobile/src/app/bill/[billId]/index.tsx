import { useMemo, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { formatMoney, type Fraction } from '@splitpool/contracts';
import { AvatarStack } from '../../../components/people';
import { BillSummary, ReceiptItemCard, ReceiptPaper } from '../../../components/split-ui';
import { AppHeader, Button, Card, ErrorBanner, ReadyReviewNote, Screen, colors, styles } from '../../../components/ui';
import { useBillPoll } from '../../../hooks/useBillPoll';
import {
  formatApiError,
  isApiClientError,
  setItemClaim,
} from '../../../lib/apiClient';
import {
  billItemToSplitLine,
  claimJoinFraction,
  customizeClaimFraction,
  resolveBillItem,
} from '../../../lib/claims';
import { avatarFromProfile } from '../../../lib/peopleUi';
import { useAppProfile } from '../../../state/appProfile';

function stateLabel(state: string) {
  return state.replace(/_/g, ' ');
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
  const [percentId, setPercentId] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [alert, setAlert] = useState<string | null>(null);

  const userId = appProfile?.userId;
  const isHost = Boolean(bill && group && userId && group.hostId === userId);
  const closed = bill?.state === 'PAID' || bill?.state === 'CANCELLED';
  const canEdit = bill?.state === 'EDITING' && !closed;
  const canScan = Boolean(isHost && canEdit);
  const people = useMemo(
    () => (bill ? bill.participants.map((participant) => avatarFromProfile(participant)) : []),
    [bill],
  );
  const roster = useMemo(
    () => (bill ? bill.participants.map((participant) => participant.userId) : []),
    [bill],
  );
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
      <Screen header={<AppHeader title="Bill" onBack={() => router.replace('/connected')} />}>
        <Text style={styles.subtitle}>Missing bill id.</Text>
      </Screen>
    );
  }

  const overflow = bill?.items
    .map((item) => ({ item, resolution: resolveBillItem(bill, item) }))
    .find((entry) => entry.resolution.status === 'overallocated' || entry.resolution.status === 'incomplete');
  const overflowMessage = overflow
    ? overflow.resolution.message ?? `${overflow.item.name} still has an open portion.`
    : null;
  const partial = bill
    ? bill.items.filter((item) => resolveBillItem(bill, item).status === 'incomplete').length
    : 0;
  const allocated = bill
    ? bill.items.filter((item) => resolveBillItem(bill, item).status === 'complete').length
    : 0;
  const yourCents = myShare?.totalCents ?? myShare?.itemsCents ?? 0;
  const tipServiceCents = (myShare?.serviceChargeCents ?? 0) + (myShare?.tipCents ?? 0);

  return (
    <Screen
      header={(
        <AppHeader
          title={group?.name ?? 'Bill'}
          onBack={() => (bill
            ? router.push({ pathname: '/group/[groupId]', params: { groupId: bill.groupId } })
            : router.replace('/connected'))}
          right={people.length > 0 ? <AvatarStack people={people} /> : undefined}
        />
      )}
      footer={(
        <View style={{ gap: 10 }}>
          {closed ? (
            <>
              {bill?.state === 'PAID' && (
                <Button
                  title="View summary"
                  onPress={() => router.push({
                    pathname: '/bill/[billId]/payment',
                    params: { billId: bill.id },
                  } as unknown as Href)}
                />
              )}
              <Button title="Return to groups" secondary onPress={() => router.replace('/connected')} />
            </>
          ) : (
            <>
              {bill?.summary.complete && <ReadyReviewNote />}
              {bill && (
                <BillSummary
                  yourLabel={bill.summary.complete ? 'Your total' : 'Your items'}
                  yourCents={yourCents}
                  totalCents={bill.summary.totalCents}
                  allocated={allocated}
                  partial={partial}
                  count={bill.items.length}
                  actionLabel={bill.summary.complete
                    ? (isHost ? 'Confirm Payment' : 'Continue to payment')
                    : canScan
                      ? (bill.items.length ? 'Rescan receipt' : 'Scan receipt')
                      : 'Refresh'}
                  onAction={() => {
                    if (bill.summary.complete) {
                      router.push({
                        pathname: '/bill/[billId]/payment',
                        params: { billId: bill.id },
                      } as unknown as Href);
                      return;
                    }
                    if (canScan) {
                      router.push({
                        pathname: '/bill/[billId]/receipt',
                        params: { billId: bill.id, expectedVersion: String(bill.version) },
                      } as unknown as Href);
                      return;
                    }
                    void refresh({ clearConflict: true });
                  }}
                  note={bill.summary.complete
                    ? 'Tax and tip are split in proportion to your items.'
                    : bill.items.length === 0
                      ? (canScan ? 'Scan a receipt to add items.' : 'Waiting for the host to scan a receipt.')
                      : 'Tax and tip appear once every item is claimed.'}
                />
              )}
              <Button title="Return to groups" secondary onPress={() => router.replace('/connected')} />
            </>
          )}
        </View>
      )}
    >
      <Text style={styles.subtitle}>
        {loading && !bill
          ? 'Loading…'
          : bill
            ? closed
              ? `Closed · ${stateLabel(bill.state)}`
              : `${stateLabel(bill.state)} · Tap a line to claim it. Slide it left, then enter your %.`
            : 'Could not load bill'}
      </Text>

      {closed && bill && (
        <ErrorBanner
          tone={bill.state === 'PAID' ? 'success' : 'warning'}
          title="Closed bill"
          message={bill.state === 'PAID'
            ? 'This bill is paid and can’t be reopened.'
            : 'This bill was canceled and can’t be reopened.'}
        />
      )}

      {conflict && (
        <ErrorBanner
          title="Someone else updated — retry"
          message="Refresh, then try your claim again."
        />
      )}

      {!canEdit && bill && !closed && (
        <ErrorBanner
          title="Claims are locked"
          message="This bill can’t be edited right now."
        />
      )}

      {myShare && bill && (
        <Card>
          <Text style={styles.heading}>Your share</Text>
          <Text style={styles.small}>
            {bill.summary.complete
              ? 'Tax and tip follow your share of the claimed items.'
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
            <Text style={styles.text}>{formatMoney(tipServiceCents)}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.heading}>You owe</Text>
            <Text style={styles.heading}>{formatMoney(myShare.totalCents)}</Text>
          </View>
          {bill.summary.complete && (
            <Text style={styles.small}>
              Receipt tax {formatMoney(bill.taxCents)} · tip/service {formatMoney(bill.serviceChargeCents)}
            </Text>
          )}
        </Card>
      )}

      {bill && userId && (
        <ReceiptPaper title={bill.merchant || 'New bill'} alert={alert ?? overflowMessage}>
          {bill.items.length === 0 ? (
            <Text style={[styles.small, { paddingVertical: 12 }]}>
              {canScan ? 'No items yet. Scan a receipt.' : 'No items yet. Waiting for the host.'}
            </Text>
          ) : bill.items.map((item) => {
            const line = billItemToSplitLine(bill, item);
            const resolution = resolveBillItem(bill, item);
            const mine = resolution.portions.some((portion) => portion.personId === userId);
            return (
              <ReceiptItemCard
                key={item.id}
                item={line}
                resolution={resolution}
                people={people}
                roster={roster}
                viewerId={userId}
                editable={canEdit && !busy}
                faded={closed}
                percentOpen={!closed && percentId === item.id}
                expanded={!closed && openId === item.id && percentId !== item.id}
                onClaim={() => {
                  const next = claimJoinFraction(bill, item.id, userId);
                  if ('error' in next) {
                    setAlert(next.error);
                    return;
                  }
                  setAlert(null);
                  setOpenId(item.id);
                  void onClaim(item.id, next);
                }}
                onOpen={() => setOpenId(openId === item.id ? null : item.id)}
                onEditPercent={() => {
                  if (!mine) {
                    const next = claimJoinFraction(bill, item.id, userId);
                    if ('error' in next) {
                      setAlert(next.error);
                      return;
                    }
                    void onClaim(item.id, next);
                  }
                  setOpenId(null);
                  setAlert(null);
                  setPercentId(item.id);
                }}
                onSavePercent={(basisPoints) => {
                  const next = customizeClaimFraction(bill, item, userId, basisPoints);
                  if ('error' in next) {
                    setAlert(next.error);
                    return next.error;
                  }
                  setAlert(null);
                  setPercentId(null);
                  setOpenId(item.id);
                  void onClaim(item.id, next);
                  return null;
                }}
                onCancelPercent={() => { setPercentId(null); setAlert(null); }}
                onLeave={() => {
                  setOpenId(null);
                  setPercentId(null);
                  setAlert(null);
                  void onClaim(item.id, { numerator: 0, denominator: 1 });
                }}
              />
            );
          })}
        </ReceiptPaper>
      )}

      {!!message && <ErrorBanner message={message} />}
      {!closed && bill && !bill.summary.complete && bill.items.length > 0 && (
        <Text style={[styles.small, { color: colors.warning }]}>
          Claim every item before payment.
        </Text>
      )}
      {canScan && bill && bill.items.length > 0 && !bill.summary.complete && (
        <Button
          title="Rescan receipt"
          secondary
          disabled={busy}
          onPress={() => router.push({
            pathname: '/bill/[billId]/receipt',
            params: { billId: bill.id, expectedVersion: String(bill.version) },
          } as unknown as Href)}
        />
      )}
    </Screen>
  );
}

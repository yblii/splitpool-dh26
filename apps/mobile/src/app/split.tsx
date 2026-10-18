import { useState } from 'react';
import { Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { AvatarStack, PersonSwitcher } from '../components/people';
import { BillSummary, ReceiptItemCard, ReceiptPaper } from '../components/split-ui';
import { AppHeader, EmptyState, ErrorBanner, FadingNotice, ReadyReviewNote, Screen, styles } from '../components/ui';
import { billStatusLabel, useDemo } from '../state/demo';

export default function SplitScreen() {
  const demo = useDemo();
  const bill = demo.currentBill;
  const summary = demo.summary;
  const [percentId, setPercentId] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [alert, setAlert] = useState<string | null>(null);
  const [scopedPerson, setScopedPerson] = useState(demo.personId);
  if (scopedPerson !== demo.personId) {
    setScopedPerson(demo.personId);
    setPercentId(null);
    setAlert(null);
  }
  const params = useLocalSearchParams<{ item?: string | string[]; open?: string | string[] }>();
  const focusId = Array.isArray(params.item) ? params.item[0] : params.item;
  const openToken = Array.isArray(params.open) ? params.open[0] : params.open;
  const [seenToken, setSeenToken] = useState<string | null>(null);
  if (openToken && focusId && seenToken !== openToken) {
    setSeenToken(openToken);
    setOpenId(focusId);
  }
  const editable = bill?.phase === 'editing';
  const viewerTotal = summary?.people.find((person) => person.id === demo.personId);

  if (!bill || !summary) {
    return <Screen header={<AppHeader title="Split" onBack={() => router.back()} />}>
      <EmptyState title="No bill yet" body="Scan a sample receipt from the group to start splitting." />
    </Screen>;
  }

  const yourCents = viewerTotal?.totalCents ?? 0;
  const overflow = summary.resolutions.find((entry) => entry.resolution.status === 'overallocated' || entry.resolution.status === 'incomplete');
  const overflowName = bill.items.find((item) => item.id === overflow?.itemId)?.name;
  const overflowMessage = overflow
    ? overflow.resolution.message ?? `${overflowName ?? 'An item'} still has an open portion.`
    : null;

  return <Screen
    header={<AppHeader
      title={demo.viewingGroup.name}
      onBack={() => {
        if (router.canGoBack()) router.back();
        else router.replace({ pathname: '/group', params: { id: demo.viewingGroup.id } });
      }}
      right={<AvatarStack people={demo.members} />}
    />}
    footer={<View style={{ gap: 10 }}>
      {demo.quietNotices.map((notice) => <FadingNotice key={notice.id} id={notice.id} message={notice.message} onDismiss={demo.dismissNotice} />)}
      {summary.itemsComplete && <ReadyReviewNote />}
      <BillSummary
        yourLabel={summary.itemsComplete ? 'Your total' : 'Your items'}
        yourCents={yourCents}
        totalCents={summary.computedTotalCents}
        allocated={summary.fullyAllocated}
        partial={summary.resolutions.filter((entry) => entry.resolution.status === 'incomplete').length}
        count={summary.itemCount}
        actionLabel="Review split"
        onAction={() => router.push('/overview')}
        note={undefined}
      />
    </View>}
  >
    <Text style={styles.subtitle}>{billStatusLabel(bill.phase)} · Tap a line to claim it. Slide it left, then enter your %.</Text>
    {!editable && <ErrorBanner title="Claims are locked" message="This bill can’t be edited right now." />}
    <PersonSwitcher people={demo.members} value={demo.personId} onChange={demo.setPerson} />
    <ReceiptPaper title={bill.merchant} alert={alert ?? overflowMessage}>
      {bill.items.map((item) => {
        const resolution = summary.resolutions.find((entry) => entry.itemId === item.id)?.resolution;
        if (!resolution) return null;
        const mine = resolution.portions.some((portion) => portion.personId === demo.personId);
        return <ReceiptItemCard
          key={item.id}
          item={item}
          resolution={resolution}
          people={demo.members}
          roster={demo.viewingGroup.memberIds}
          viewerId={demo.personId}
          editable={!!editable}
          faded={false}
          percentOpen={percentId === item.id}
          expanded={openId === item.id && percentId !== item.id}
          onClaim={() => {
            demo.claimItem(item.id);
            setOpenId(item.id);
          }}
          onOpen={() => setOpenId(openId === item.id ? null : item.id)}
          onEditPercent={() => {
            if (!mine) demo.claimItem(item.id);
            setOpenId(null);
            setAlert(null);
            setPercentId(item.id);
          }}
          onSavePercent={(basisPoints) => {
            const message = demo.customizeItem(item.id, basisPoints);
            if (message) {
              setAlert(message);
              return message;
            }
            setAlert(null);
            setPercentId(null);
            setOpenId(item.id);
            return null;
          }}
          onCancelPercent={() => { setPercentId(null); setAlert(null); }}
          onLeave={() => {
            demo.unclaimItem(item.id);
            setOpenId(null);
            setPercentId(null);
          }}
        />;
      })}
    </ReceiptPaper>
  </Screen>;
}

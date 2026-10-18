import { useState } from 'react';
import { Text, View } from 'react-native';
import { router } from 'expo-router';
import { AvatarStack, PersonSwitcher } from '../components/people';
import { BillSummary, CustomSplitSheet, ReceiptItemCard } from '../components/split-ui';
import { AppHeader, EmptyState, ErrorBanner, Screen, styles } from '../components/ui';
import { billStatusLabel, useDemo } from '../state/demo';

export default function SplitScreen() {
  const demo = useDemo();
  const bill = demo.currentBill;
  const summary = demo.summary;
  const [customId, setCustomId] = useState<string | null>(null);
  const editable = bill?.phase === 'editing';
  const viewerTotal = summary?.people.find((person) => person.id === demo.personId);

  if (!bill || !summary) {
    return <Screen header={<AppHeader title="Split" onBack={() => router.back()} />}>
      <EmptyState title="No bill yet" body="Scan a sample receipt from the group to start splitting." />
    </Screen>;
  }

  const customItem = bill.items.find((item) => item.id === customId) ?? null;
  const yourCents = viewerTotal?.totalCents ?? 0;

  return <Screen
    header={<AppHeader
      title={demo.viewingGroup.name}
      onBack={() => router.back()}
      right={<AvatarStack people={demo.members} />}
    />}
    footer={<BillSummary
      yourLabel={summary.itemsComplete ? 'Your total' : 'Your items'}
      yourCents={yourCents}
      totalCents={summary.computedTotalCents}
      allocated={summary.fullyAllocated}
      count={summary.itemCount}
      actionLabel="Review split"
      onAction={() => router.push('/overview')}
      note={summary.itemsComplete ? undefined : 'Tax and tip join your total once every item is fully allocated.'}
    />}
  >
    <View style={{ gap: 4 }}>
      <Text style={styles.title}>{bill.merchant}</Text>
      <Text style={styles.subtitle}>{billStatusLabel(bill.phase)} · Tap an item to claim it. Another person splits it evenly. Swipe left to customize your share.</Text>
    </View>
    {!editable && <ErrorBanner title="Claims are locked" message="This bill is past editing. Reopen it from review, before collection, if you still need to change shares." />}
    <PersonSwitcher people={demo.members} value={demo.personId} onChange={demo.setPerson} />
    <View style={{ gap: 12 }}>
      {bill.items.map((item) => {
        const resolution = summary.resolutions.find((entry) => entry.itemId === item.id)?.resolution;
        if (!resolution) return null;
        return <ReceiptItemCard
          key={item.id}
          item={item}
          resolution={resolution}
          people={demo.members}
          viewerId={demo.personId}
          editable={!!editable}
          onClaim={() => demo.claimItem(item.id)}
          onCustomize={() => setCustomId(item.id)}
          onLeave={() => demo.unclaimItem(item.id)}
        />;
      })}
    </View>
    <CustomSplitSheet
      visible={!!customItem && !!editable}
      item={customItem}
      people={demo.members}
      roster={demo.viewingGroup.memberIds}
      viewerId={demo.personId}
      onClose={() => setCustomId(null)}
      onSave={(basisPoints) => customItem ? demo.customizeItem(customItem.id, basisPoints) : 'That item is gone.'}
      onReset={() => { if (customItem) demo.resetItem(customItem.id); }}
      onLeave={() => { if (customItem) demo.unclaimItem(customItem.id); }}
    />
  </Screen>;
}

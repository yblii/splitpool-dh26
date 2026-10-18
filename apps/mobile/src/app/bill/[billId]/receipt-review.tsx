import { useMemo, useState } from 'react';
import { Alert, Pressable, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import {
  extractedToEditable,
  formatMoney,
  makeSampleExtractedReceipt,
  reconcileReceipt,
  verifyReceipt,
  type ExtractedReceipt,
  type ReceiptDraftInput,
} from '@splitpool/contracts';
import { Button, Card, colors, Screen, styles } from '../../../components/ui';
import {
  formatApiError,
  saveBillItems,
  saveItemsFromVerifiedReceipt,
} from '../../../lib/apiClient';
import { useReceiptSession } from '../../../state/receiptSession';

function centsToInput(cents: number): string {
  return (Math.max(0, cents) / 100).toFixed(2);
}

function inputToCents(value: string): number {
  const normalized = value.trim().replace(/[^0-9.]/g, '');
  if (!normalized) return 0;
  const amount = Number.parseFloat(normalized);
  if (!Number.isFinite(amount)) return 0;
  return Math.max(0, Math.round(amount * 100));
}

function inputToQuantity(value: string): number {
  const quantity = Number.parseInt(value.replace(/[^0-9]/g, ''), 10);
  if (!Number.isFinite(quantity) || quantity < 1) return 1;
  return quantity;
}

type MoneyFields = {
  tax: string;
  tip: string;
  printedTotal: string;
  itemTotals: string[];
  itemQuantities: string[];
};

function moneyFieldsFromDraft(draft: ReceiptDraftInput): MoneyFields {
  return {
    tax: centsToInput(draft.taxCents),
    tip: centsToInput(draft.tipCents),
    printedTotal: centsToInput(draft.printedTotalCents),
    itemTotals: draft.items.map((item) => centsToInput(item.netLineTotalCents)),
    itemQuantities: draft.items.map((item) => String(item.quantity)),
  };
}

function ReceiptReviewEditor({
  seed,
  sourceLabel,
  busy,
  onCancel,
  onSave,
}: {
  seed: ExtractedReceipt;
  sourceLabel: string;
  busy: boolean;
  onCancel: () => void;
  onSave: (draft: ReceiptDraftInput) => void;
}) {
  const [draft, setDraft] = useState<ReceiptDraftInput>(() => extractedToEditable(seed));
  const [money, setMoney] = useState<MoneyFields>(() => moneyFieldsFromDraft(extractedToEditable(seed)));
  const reconciliation = useMemo(() => reconcileReceipt(draft), [draft]);

  function syncItemTotal(index: number, value: string) {
    setMoney((current) => ({
      ...current,
      itemTotals: current.itemTotals.map((entry, itemIndex) => (itemIndex === index ? value : entry)),
    }));
    setDraft((current) => ({
      ...current,
      items: current.items.map((item, itemIndex) => (itemIndex === index
        ? { ...item, netLineTotalCents: inputToCents(value) }
        : item)),
    }));
  }

  function syncItemQuantity(index: number, value: string) {
    setMoney((current) => ({
      ...current,
      itemQuantities: current.itemQuantities.map((entry, itemIndex) => (itemIndex === index ? value : entry)),
    }));
    setDraft((current) => ({
      ...current,
      items: current.items.map((item, itemIndex) => (itemIndex === index
        ? { ...item, quantity: inputToQuantity(value) }
        : item)),
    }));
  }

  function updateItemName(index: number, name: string) {
    setDraft((current) => ({
      ...current,
      items: current.items.map((item, itemIndex) => (itemIndex === index ? { ...item, name } : item)),
    }));
  }

  function addItem() {
    setDraft((current) => ({
      ...current,
      items: [...current.items, {
        id: `item-${current.items.length + 1}`,
        name: '',
        quantity: 1,
        netLineTotalCents: 0,
      }],
    }));
    setMoney((current) => ({
      ...current,
      itemTotals: [...current.itemTotals, '0.00'],
      itemQuantities: [...current.itemQuantities, '1'],
    }));
  }

  function removeItem(index: number) {
    setDraft((current) => ({
      ...current,
      items: current.items.filter((_, itemIndex) => itemIndex !== index),
    }));
    setMoney((current) => ({
      ...current,
      itemTotals: current.itemTotals.filter((_, itemIndex) => itemIndex !== index),
      itemQuantities: current.itemQuantities.filter((_, itemIndex) => itemIndex !== index),
    }));
  }

  function save() {
    if (!draft.items.length) {
      Alert.alert('Add at least one item', 'A receipt needs itemized rows before it can be saved.');
      return;
    }
    onSave(draft);
  }

  return (
    <Screen footer={<>
      <Button title={busy ? 'Saving…' : 'Save to bill'} disabled={busy} onPress={save} />
      <Button title="Cancel" secondary disabled={busy} onPress={onCancel} />
    </>}>
      <View style={{ gap: 10 }}>
        <Text style={styles.title}>Review items.</Text>
        <Text style={styles.subtitle}>Fix names and prices before anyone starts claiming.</Text>
      </View>

      <Card>
        <Text style={styles.label}>Parse source · {sourceLabel}</Text>
        <Text style={styles.label}>Merchant</Text>
        <TextInput
          accessibilityLabel="Merchant"
          value={draft.merchant}
          onChangeText={(merchant) => setDraft((current) => ({ ...current, merchant }))}
          style={styles.input}
          placeholder="Merchant"
        />
      </Card>

      {!reconciliation.matchesPrintedTotal && (
        <View style={{ backgroundColor: colors.light, borderWidth: 1, borderColor: colors.warning, padding: 14, gap: 6 }}>
          <Text style={[styles.label, { color: colors.warning }]}>Total mismatch</Text>
          <Text style={styles.text}>
            Items + tax + tip = {formatMoney(reconciliation.computedTotalCents)}, but printed total is {formatMoney(draft.printedTotalCents)}.
          </Text>
        </View>
      )}

      <Card>
        <Text style={styles.heading}>Items</Text>
        {draft.items.map((item, index) => (
          <View key={`${item.id ?? 'row'}-${index}`} style={{ gap: 10, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <Text style={styles.label}>Item {index + 1}</Text>
            <TextInput
              accessibilityLabel={`Item ${index + 1} name`}
              value={item.name}
              onChangeText={(name) => updateItemName(index, name)}
              style={styles.input}
              placeholder="Item name"
            />
            <View style={styles.row}>
              <View style={{ flex: 1, gap: 6 }}>
                <Text style={styles.label}>Qty</Text>
                <TextInput
                  accessibilityLabel={`Item ${index + 1} quantity`}
                  keyboardType="number-pad"
                  value={money.itemQuantities[index] ?? '1'}
                  onChangeText={(value) => syncItemQuantity(index, value)}
                  style={styles.input}
                />
              </View>
              <View style={{ flex: 2, gap: 6 }}>
                <Text style={styles.label}>Line total</Text>
                <TextInput
                  accessibilityLabel={`Item ${index + 1} line total`}
                  keyboardType="decimal-pad"
                  value={money.itemTotals[index] ?? '0.00'}
                  onChangeText={(value) => syncItemTotal(index, value)}
                  style={styles.input}
                />
              </View>
            </View>
            <Pressable accessibilityRole="button" onPress={() => removeItem(index)} hitSlop={8}>
              <Text style={styles.link}>Remove item</Text>
            </Pressable>
          </View>
        ))}
        <Button title="Add item" secondary disabled={busy} onPress={addItem} />
      </Card>

      <Card>
        <Text style={styles.heading}>Totals</Text>
        <Text style={styles.label}>Tax</Text>
        <TextInput
          accessibilityLabel="Tax"
          keyboardType="decimal-pad"
          value={money.tax}
          onChangeText={(value) => {
            setMoney((current) => ({ ...current, tax: value }));
            setDraft((current) => ({ ...current, taxCents: inputToCents(value) }));
          }}
          style={styles.input}
        />
        <Text style={styles.label}>Tip (printed)</Text>
        <TextInput
          accessibilityLabel="Tip"
          keyboardType="decimal-pad"
          value={money.tip}
          onChangeText={(value) => {
            setMoney((current) => ({ ...current, tip: value }));
            setDraft((current) => ({ ...current, tipCents: inputToCents(value) }));
          }}
          style={styles.input}
        />
        <Text style={styles.label}>Printed total</Text>
        <TextInput
          accessibilityLabel="Printed total"
          keyboardType="decimal-pad"
          value={money.printedTotal}
          onChangeText={(value) => {
            setMoney((current) => ({ ...current, printedTotal: value }));
            setDraft((current) => ({ ...current, printedTotalCents: inputToCents(value) }));
          }}
          style={styles.input}
        />
        <View style={styles.divider} />
        <View style={styles.row}>
          <Text style={styles.text}>Items subtotal</Text>
          <Text style={styles.text}>{formatMoney(reconciliation.itemsSubtotalCents)}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.heading}>Computed</Text>
          <Text style={styles.heading}>{formatMoney(reconciliation.computedTotalCents)}</Text>
        </View>
      </Card>
    </Screen>
  );
}

export default function BillReceiptReviewScreen() {
  const { billId } = useLocalSearchParams<{ billId: string }>();
  const { session, setSession } = useReceiptSession();
  const [busy, setBusy] = useState(false);

  const seed = session?.billId === billId ? session.draft : makeSampleExtractedReceipt();
  const expectedVersion = session?.billId === billId ? session.expectedVersion : 1;
  const editorKey = `${seed.source}:${seed.items.map((item) => item.clientId).join(',')}:${seed.printedTotalCents}`;

  async function persist(verified: ReturnType<typeof verifyReceipt>) {
    if (!billId) {
      Alert.alert('Missing bill', 'Go back and open the bill again.');
      return;
    }
    setBusy(true);
    try {
      await saveBillItems(billId, saveItemsFromVerifiedReceipt(verified, expectedVersion));
      setSession(null);
      router.replace({ pathname: '/bill/[billId]', params: { billId } } as Href);
    } catch (error) {
      Alert.alert('Could not save receipt', formatApiError(error));
    } finally {
      setBusy(false);
    }
  }

  function commitDraft(draft: ReceiptDraftInput) {
    const verified = verifyReceipt(draft);
    if (!verified.reconciliation.matchesPrintedTotal) {
      Alert.alert(
        'Totals do not match',
        `Computed ${formatMoney(verified.reconciliation.computedTotalCents)} vs printed ${formatMoney(verified.printedTotalCents)}. Save anyway?`,
        [
          { text: 'Keep editing', style: 'cancel' },
          { text: 'Save anyway', style: 'destructive', onPress: () => void persist(verified) },
        ],
      );
      return;
    }
    void persist(verified);
  }

  return (
    <ReceiptReviewEditor
      key={editorKey}
      seed={seed}
      sourceLabel={seed.source}
      busy={busy}
      onCancel={() => {
        setSession(null);
        router.back();
      }}
      onSave={commitDraft}
    />
  );
}

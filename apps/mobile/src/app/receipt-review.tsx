import { useMemo, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import {
  extractedToEditable,
  formatMoney,
  makeSplitDemoReceipt,
  reconcileReceipt,
  verifyReceipt,
  type ExtractedReceipt,
  type ReceiptDraftInput,
} from '@splitpool/contracts';
import { AppHeader, Button, Card, ErrorBanner, Screen, colors, styles } from '../components/ui';
import { useDemo } from '../state/demo';

function centsToInput(cents: number) {
  return (Math.max(0, cents) / 100).toFixed(2);
}

function inputToCents(value: string) {
  const normalized = value.trim().replace(/[^0-9.]/g, '');
  if (!normalized) return 0;
  const amount = Number.parseFloat(normalized);
  if (!Number.isFinite(amount)) return 0;
  return Math.max(0, Math.round(amount * 100));
}

function inputToQuantity(value: string) {
  const quantity = Number.parseInt(value.replace(/[^0-9]/g, ''), 10);
  if (!Number.isFinite(quantity) || quantity < 1) return 1;
  return quantity;
}

type MoneyFields = { tax: string; tip: string; service: string; printedTotal: string; itemTotals: string[]; itemQuantities: string[] };

function moneyFieldsFromDraft(draft: ReceiptDraftInput): MoneyFields {
  return {
    tax: centsToInput(draft.taxCents),
    tip: centsToInput(draft.tipCents),
    service: centsToInput(draft.serviceChargeCents ?? 0),
    printedTotal: centsToInput(draft.printedTotalCents),
    itemTotals: draft.items.map((item) => centsToInput(item.netLineTotalCents)),
    itemQuantities: draft.items.map((item) => String(item.quantity)),
  };
}

function ReviewEditor({ seed, onCancel, onSave }: {
  seed: ExtractedReceipt;
  onCancel: () => void;
  onSave: (draft: ReceiptDraftInput) => void;
}) {
  const [draft, setDraft] = useState<ReceiptDraftInput>(() => extractedToEditable(seed));
  const [money, setMoney] = useState<MoneyFields>(() => moneyFieldsFromDraft(extractedToEditable(seed)));
  const [openIndex, setOpenIndex] = useState(0);
  const reconciliation = useMemo(() => reconcileReceipt(draft), [draft]);
  const sample = seed.source === 'sample-demo' || seed.source === 'sample-fallback' || seed.warnings.includes('provider_unavailable') || seed.warnings.includes('parse_failed');

  function patchItem(index: number, patch: Partial<ReceiptDraftInput['items'][number]>) {
    setDraft((current) => ({
      ...current,
      items: current.items.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item),
    }));
  }

  function addItem() {
    setDraft((current) => ({
      ...current,
      items: [...current.items, { id: `item-${Date.now().toString(36)}`, name: '', quantity: 1, netLineTotalCents: 0 }],
    }));
    setMoney((current) => ({ ...current, itemTotals: [...current.itemTotals, '0.00'], itemQuantities: [...current.itemQuantities, '1'] }));
    setOpenIndex(draft.items.length);
  }

  function removeItem(index: number) {
    setDraft((current) => ({ ...current, items: current.items.filter((_, itemIndex) => itemIndex !== index) }));
    setMoney((current) => ({
      ...current,
      itemTotals: current.itemTotals.filter((_, itemIndex) => itemIndex !== index),
      itemQuantities: current.itemQuantities.filter((_, itemIndex) => itemIndex !== index),
    }));
    setOpenIndex(0);
  }

  return <Screen
    header={<AppHeader title="Review" onBack={onCancel} />}
    footer={<Button title="Start splitting" disabled={draft.items.length === 0} onPress={() => onSave(draft)} />}
  >
    <View style={{ gap: 6 }}>
      <Text style={styles.title}>Check the items</Text>
      <Text style={styles.subtitle}>Fix names and prices before anyone claims them.</Text>
    </View>
    {sample && <ErrorBanner title="Sample receipt" message="These rows are a demo fixture. They were not extracted by a scanner or an OCR service." />}
    {!reconciliation.matchesPrintedTotal && <ErrorBanner
      title="Total does not match"
      message={`Items, tax, tip, and service come to ${formatMoney(reconciliation.computedTotalCents)}. The printed total is ${formatMoney(draft.printedTotalCents)}. You can still start splitting, but the bill cannot be finalized until they match.`}
    />}
    <Card>
      <Text style={styles.label}>Restaurant</Text>
      <TextInput accessibilityLabel="Restaurant" value={draft.merchant} onChangeText={(merchant) => setDraft((current) => ({ ...current, merchant }))} style={styles.input} />
    </Card>
    <View style={{ gap: 10 }}>
      {draft.items.map((item, index) => {
        const open = openIndex === index;
        return <View key={`${item.id ?? 'row'}-${index}`} style={{ backgroundColor: colors.paper, borderRadius: 18, borderWidth: 1, borderColor: colors.border, padding: 14, gap: 10 }}>
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.text, { fontWeight: '700' }]}>{item.name || 'New item'}</Text>
              <Text style={styles.small}>Qty {item.quantity} · {formatMoney(item.netLineTotalCents)}</Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel={`Edit ${item.name || 'item'}`} hitSlop={8} onPress={() => setOpenIndex(open ? -1 : index)}>
              <Text style={styles.link}>{open ? 'Close' : 'Edit'}</Text>
            </Pressable>
          </View>
          {open && <>
            <TextInput accessibilityLabel={`Item ${index + 1} name`} value={item.name} onChangeText={(name) => patchItem(index, { name })} placeholder="Item name" placeholderTextColor={colors.muted} style={styles.input} />
            <View style={styles.row}>
              <View style={{ flex: 1, gap: 6 }}>
                <Text style={styles.label}>Quantity</Text>
                <TextInput accessibilityLabel={`Item ${index + 1} quantity`} keyboardType="number-pad" value={money.itemQuantities[index] ?? '1'} onChangeText={(value) => {
                  setMoney((current) => ({ ...current, itemQuantities: current.itemQuantities.map((entry, itemIndex) => itemIndex === index ? value : entry) }));
                  patchItem(index, { quantity: inputToQuantity(value) });
                }} style={styles.input} />
              </View>
              <View style={{ flex: 1.4, gap: 6 }}>
                <Text style={styles.label}>Price</Text>
                <TextInput accessibilityLabel={`Item ${index + 1} price`} keyboardType="decimal-pad" value={money.itemTotals[index] ?? '0.00'} onChangeText={(value) => {
                  setMoney((current) => ({ ...current, itemTotals: current.itemTotals.map((entry, itemIndex) => itemIndex === index ? value : entry) }));
                  patchItem(index, { netLineTotalCents: inputToCents(value) });
                }} style={styles.input} />
              </View>
            </View>
            <Pressable accessibilityRole="button" onPress={() => removeItem(index)} hitSlop={8}><Text style={[styles.link, { color: colors.danger }]}>Delete item</Text></Pressable>
          </>}
        </View>;
      })}
      <Button title="Add missing item" secondary onPress={addItem} />
    </View>
    <Card>
      <Text style={styles.heading}>Receipt totals</Text>
      <MoneyRow label="Subtotal" value={formatMoney(reconciliation.itemsSubtotalCents)} />
      <LabeledMoney label="Tax" accessibilityLabel="Tax" value={money.tax} onChange={(value) => {
        setMoney((current) => ({ ...current, tax: value }));
        setDraft((current) => ({ ...current, taxCents: inputToCents(value) }));
      }} />
      <LabeledMoney label="Tip already on the receipt" accessibilityLabel="Tip" value={money.tip} onChange={(value) => {
        setMoney((current) => ({ ...current, tip: value }));
        setDraft((current) => ({ ...current, tipCents: inputToCents(value) }));
      }} />
      <LabeledMoney label="Service charge" accessibilityLabel="Service charge" value={money.service} onChange={(value) => {
        setMoney((current) => ({ ...current, service: value }));
        setDraft((current) => ({ ...current, serviceChargeCents: inputToCents(value) }));
      }} />
      <LabeledMoney label="Printed total" accessibilityLabel="Printed total" value={money.printedTotal} onChange={(value) => {
        setMoney((current) => ({ ...current, printedTotal: value }));
        setDraft((current) => ({ ...current, printedTotalCents: inputToCents(value) }));
      }} />
      <MoneyRow label="Computed total" value={formatMoney(reconciliation.computedTotalCents)} strong />
    </Card>
  </Screen>;
}

function LabeledMoney({ label, value, onChange, accessibilityLabel }: { label: string; value: string; onChange: (value: string) => void; accessibilityLabel: string }) {
  return <View style={{ gap: 6 }}>
    <Text style={styles.label}>{label}</Text>
    <TextInput accessibilityLabel={accessibilityLabel} keyboardType="decimal-pad" value={value} onChangeText={onChange} style={styles.input} />
  </View>;
}

function MoneyRow({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return <View style={styles.row}>
    <Text style={strong ? styles.heading : styles.text}>{label}</Text>
    <Text style={strong ? styles.heading : styles.text}>{value}</Text>
  </View>;
}

export default function ReceiptReviewScreen() {
  const { pendingReceipt, setPendingReceipt, applyVerifiedReceipt } = useDemo();
  const seed = pendingReceipt ?? makeSplitDemoReceipt();
  const editorKey = `${seed.source}:${seed.items.map((item) => item.clientId).join(',')}:${seed.printedTotalCents}`;
  return <ReviewEditor
    key={editorKey}
    seed={seed}
    onCancel={() => { setPendingReceipt(null); router.back(); }}
    onSave={(draft) => {
      applyVerifiedReceipt(verifyReceipt(draft));
      router.replace('/split');
    }}
  />;
}

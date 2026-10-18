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
import { CenterDialog } from '../components/sheets';
import { ReceiptPaper } from '../components/split-ui';
import { monoFamily } from '../fonts';
import { AppHeader, Button, Screen, colors, moneyMark, styles } from '../components/ui';
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
  const [openIndex, setOpenIndex] = useState(-1);
  const [chargesOpen, setChargesOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
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

  const mismatch = !reconciliation.matchesPrintedTotal
    ? `Items, tax, and tip come to ${formatMoney(reconciliation.computedTotalCents)}. The printed total is ${formatMoney(draft.printedTotalCents)}.`
    : null;

  return <Screen
    header={<AppHeader title="Receipt" onBack={onCancel} />}
    footer={<Button title="Confirm" disabled={draft.items.length === 0 || !!mismatch} onPress={() => setConfirming(true)} />}
  >
    {sample && <Text style={styles.small}>Sample items for the demo. They were not read by a scanner.</Text>}
    <ReceiptPaper title={draft.merchant} onChangeTitle={(merchant) => setDraft((current) => ({ ...current, merchant }))} alert={mismatch}>
      {draft.items.map((item, index) => {
        const open = openIndex === index;
        return <View key={`${item.id ?? 'row'}-${index}`} style={line}>
          <Pressable accessibilityRole="button" accessibilityLabel={`${item.name || 'Item'}, ${formatMoney(item.netLineTotalCents)}. Edit.`} onPress={() => setOpenIndex(open ? -1 : index)} style={styles.row}>
            <Text style={[styles.text, { flex: 1, fontWeight: '700' }]} numberOfLines={1}>{item.name || 'New item'}</Text>
            <Text {...moneyMark} style={price}>{formatMoney(item.netLineTotalCents)}</Text>
          </Pressable>
          {open && <View style={editor}>
            <TextInput accessibilityLabel={`Item ${index + 1} name`} value={item.name} onChangeText={(name) => patchItem(index, { name })} placeholder="Item name" placeholderTextColor={colors.muted} style={styles.input} />
            <View style={editorRow}>
              <TextInput accessibilityLabel={`Item ${index + 1} quantity`} keyboardType="number-pad" value={money.itemQuantities[index] ?? '1'} onChangeText={(value) => {
                setMoney((current) => ({ ...current, itemQuantities: current.itemQuantities.map((entry, itemIndex) => itemIndex === index ? value : entry) }));
                patchItem(index, { quantity: inputToQuantity(value) });
              }} style={[styles.input, quantityInput]} />
              <TextInput accessibilityLabel={`Item ${index + 1} price`} keyboardType="decimal-pad" value={money.itemTotals[index] ?? '0.00'} onChangeText={(value) => {
                setMoney((current) => ({ ...current, itemTotals: current.itemTotals.map((entry, itemIndex) => itemIndex === index ? value : entry) }));
                patchItem(index, { netLineTotalCents: inputToCents(value) });
              }} {...moneyMark} style={[styles.input, priceInput]} />
            </View>
            <Pressable accessibilityRole="button" onPress={() => removeItem(index)} hitSlop={8}><Text style={[styles.link, { color: colors.danger }]}>Delete</Text></Pressable>
          </View>}
        </View>;
      })}
      <Pressable accessibilityRole="button" onPress={addItem} style={{ minHeight: 44, justifyContent: 'center' }}>
        <Text style={styles.link}>Add item</Text>
      </Pressable>
      <View style={[styles.row, { paddingVertical: 8 }]}>
        <Text style={styles.text}>Group total</Text>
        <Text {...moneyMark} style={[styles.heading, { fontFamily: monoFamily }]}>{formatMoney(reconciliation.computedTotalCents)}</Text>
      </View>
    </ReceiptPaper>
    <Pressable accessibilityRole="button" accessibilityState={{ expanded: chargesOpen }} onPress={() => setChargesOpen((current) => !current)} style={{ minHeight: 44, justifyContent: 'center' }}>
      <Text style={styles.text}>{chargesOpen ? '⌄' : '›'} Tax and tip</Text>
    </Pressable>
    {chargesOpen && <View style={{ gap: 10 }}>
      <LabeledMoney label="Tax" accessibilityLabel="Tax" value={money.tax} onChange={(value) => {
        setMoney((current) => ({ ...current, tax: value }));
        setDraft((current) => ({ ...current, taxCents: inputToCents(value) }));
      }} />
      <LabeledMoney label="Tip" accessibilityLabel="Tip" value={money.tip} onChange={(value) => {
        setMoney((current) => ({ ...current, tip: value }));
        setDraft((current) => ({ ...current, tipCents: inputToCents(value) }));
      }} />
      <LabeledMoney label="Service" accessibilityLabel="Service charge" value={money.service} onChange={(value) => {
        setMoney((current) => ({ ...current, service: value }));
        setDraft((current) => ({ ...current, serviceChargeCents: inputToCents(value) }));
      }} />
      <LabeledMoney label="Printed total" accessibilityLabel="Printed total" value={money.printedTotal} onChange={(value) => {
        setMoney((current) => ({ ...current, printedTotal: value }));
        setDraft((current) => ({ ...current, printedTotalCents: inputToCents(value) }));
      }} />
    </View>}
    <CenterDialog visible={confirming} title="Once confirmed" onClose={() => setConfirming(false)}>
      <Text style={styles.text}>Prices lock. The group can claim items.</Text>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1 }}><Button title="Go back" secondary onPress={() => setConfirming(false)} /></View>
        <View style={{ flex: 1 }}><Button title="Confirm" onPress={() => { setConfirming(false); onSave(draft); }} /></View>
      </View>
    </CenterDialog>
  </Screen>;
}

const line = { borderTopWidth: 1, borderStyle: 'dashed' as const, borderColor: '#E4D5C2', paddingTop: 8, width: '100%' as const, minWidth: 0, maxWidth: '100%' as const };
const price = { fontFamily: monoFamily, color: colors.ink, fontWeight: '700' as const, fontSize: 16 };
const editor = { gap: 8, paddingBottom: 8, width: '100%' as const, minWidth: 0, maxWidth: '100%' as const };
const editorRow = { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8, width: '100%' as const, minWidth: 0 };
const quantityInput = { width: 56, maxWidth: 56, flexGrow: 0, flexShrink: 0, minHeight: 40, paddingHorizontal: 6, textAlign: 'center' as const };
const priceInput = { flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0, maxWidth: '100%' as const, fontFamily: monoFamily };

function LabeledMoney({ label, value, onChange, accessibilityLabel }: { label: string; value: string; onChange: (value: string) => void; accessibilityLabel: string }) {
  return <View style={{ gap: 6 }}>
    <Text style={styles.label}>{label}</Text>
    <TextInput {...moneyMark} accessibilityLabel={accessibilityLabel} keyboardType="decimal-pad" value={value} onChangeText={onChange} style={[styles.input, { fontFamily: monoFamily }]} />
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

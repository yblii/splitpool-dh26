import { useState } from 'react';
import { Alert, Image, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { makeSplitDemoReceipt } from '@splitpool/contracts';
import { monoFamily } from '../fonts';
import { AppHeader, ErrorBanner, Screen, colors, moneyMark } from '../components/ui';
import { apiUrl, extractReceiptFromImage } from '../lib/api';
import { useDemo } from '../state/demo';

type PickedReceipt = { uri: string; mimeType?: string; fileName?: string };

export default function ReceiptScreen() {
  const demo = useDemo();
  const [picked, setPicked] = useState<PickedReceipt>();
  const [sampleArmed, setSampleArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const group = demo.groups.find((entry) => entry.id === demo.receiptGroupId) ?? demo.viewingGroup;
  const groupIndex = Math.max(0, demo.groups.findIndex((entry) => entry.id === group.id));

  function shiftGroup(direction: -1 | 1) {
    if (demo.groups.length < 2) return;
    const next = demo.groups[(groupIndex + direction + demo.groups.length) % demo.groups.length];
    demo.selectReceiptGroup(next.id);
    demo.selectGroup(next.id);
  }

  async function pick(camera: boolean) {
    try {
      if (camera) {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          setNote('Camera access is off. Use the sample receipt, or choose a photo.');
          setSampleArmed(true);
          setPicked(undefined);
          return;
        }
      }
      const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.7 };
      const result = camera ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
      if (!result.canceled) {
        const asset = result.assets[0];
        const photo = { uri: asset.uri, mimeType: asset.mimeType ?? undefined, fileName: asset.fileName ?? undefined };
        setPicked(photo);
        setSampleArmed(false);
        await continueReview(photo);
      }
    } catch {
      setSampleArmed(true);
      setPicked(undefined);
      setNote('Photos could not be opened. A sample receipt is ready instead.');
      openSample();
    }
  }

  function useSample() {
    if (Platform.OS === 'web') {
      openSample();
      return;
    }
    void pick(true);
  }

  function openSample() {
    demo.setPendingReceipt(makeSplitDemoReceipt());
    router.push('/receipt-review');
  }

  async function continueReview(photo: PickedReceipt | undefined = picked) {
    const existing = demo.billFor(group.id);
    if (existing && existing.phase !== 'editing' && existing.phase !== 'paid') {
      Alert.alert('Bill locked', 'Finish the current demo payment, or reset the demo, before replacing this bill.');
      return;
    }
    if (!photo) {
      openSample();
      return;
    }
    if (!apiUrl) {
      setNote('No parser is configured. The next screen uses the sample receipt, not this photo.');
      openSample();
      return;
    }
    setBusy(true);
    try {
      const { draft, usedFallback } = await extractReceiptFromImage(photo);
      if (usedFallback) {
        setNote('Live parsing was unavailable. Sample items were loaded, and they were not read from your photo.');
        demo.setPendingReceipt(draft.source === 'sample-fallback' ? { ...makeSplitDemoReceipt(), warnings: draft.warnings } : draft);
        router.push('/receipt-review');
        return;
      }
      demo.setPendingReceipt(draft);
      router.push('/receipt-review');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not reach the API.';
      setNote(`${message} Sample items were loaded instead. They were not read from your photo.`);
      openSample();
    } finally {
      setBusy(false);
    }
  }

  return <Screen
    fill
    header={<AppHeader title="Scan" onBack={() => router.back()} />}
    footer={<View style={local.controls}>
      <Pressable accessibilityRole="button" accessibilityLabel="Choose from photo album" disabled={busy} onPress={() => void pick(false)} style={local.sideButton}>
        <Text style={local.sideText}>Album</Text>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Capture receipt" disabled={busy} onPress={useSample} style={local.shutter}>
        <View style={local.shutterInner} />
      </Pressable>
      <View style={local.groupSwitch}>
        <Pressable accessibilityRole="button" accessibilityLabel="Previous group" disabled={busy || demo.groups.length < 2} hitSlop={8} onPress={() => shiftGroup(-1)} style={local.chevronHit}>
          <Text style={local.chevron}>‹</Text>
        </Pressable>
        <Text accessibilityRole="text" numberOfLines={2} style={local.groupName}>{group.name}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Next group" disabled={busy || demo.groups.length < 2} hitSlop={8} onPress={() => shiftGroup(1)} style={local.chevronHit}>
          <Text style={local.chevron}>›</Text>
        </Pressable>
      </View>
    </View>}
  >
    <View style={local.finder}>
      {picked ? <Image source={{ uri: picked.uri }} accessibilityLabel="Selected receipt preview" style={local.preview} resizeMode="contain" /> : sampleArmed ? <View style={local.sample}>
        <Text style={local.sampleKicker}>Sample receipt</Text>
        <Text style={local.sampleTitle}>The Little Table</Text>
        {['Pizza          30.00', 'Ice Cream      15.00', 'Drinks          12.00', 'Appetizer       18.00', 'Tax              6.00', 'Tip             13.50'].map((line) => <Text {...moneyMark} key={line} style={local.sampleLine}>{line}</Text>)}
        <Text {...moneyMark} style={local.sampleTotal}>Total           94.50</Text>
        <Text style={local.sampleNote}>Not from a camera or a scanner.</Text>
      </View> : <View style={local.emptyFinder}>
        <Text style={local.finderLabel}>Camera preview</Text>
        <Text style={local.finderHint}>The capture button loads a sample if the camera is unavailable.</Text>
      </View>}
    </View>
    {note && <ErrorBanner title="Demo receipt" message={note} />}
    {busy && <Text style={local.busy}>Reading the photo…</Text>}
  </Screen>;
}

const local = StyleSheet.create({
  finder: { flexGrow: 1, flexShrink: 1, minHeight: 280, borderRadius: 24, overflow: 'hidden', backgroundColor: '#1B3346' },
  preview: { width: '100%', flexGrow: 1, minHeight: 280, backgroundColor: '#1B3346' },
  emptyFinder: { flexGrow: 1, minHeight: 280, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 8 },
  finderLabel: { color: '#FFFFFF', fontSize: 18, fontWeight: '700' },
  finderHint: { color: 'rgba(255,255,255,0.76)', fontSize: 14, lineHeight: 20, textAlign: 'center' },
  sample: { flexGrow: 1, justifyContent: 'center', padding: 22, gap: 6 },
  sampleKicker: { color: '#F3D7A1', fontSize: 12, fontWeight: '700', letterSpacing: 0.6 },
  sampleTitle: { color: '#FFFFFF', fontSize: 22, fontWeight: '700', marginBottom: 8 },
  sampleLine: { color: 'rgba(255,255,255,0.86)', fontFamily: monoFamily, fontSize: 14, lineHeight: 22 },
  sampleTotal: { color: '#FFFFFF', fontFamily: monoFamily, fontSize: 14, lineHeight: 22, fontWeight: '700', marginTop: 8 },
  sampleNote: { color: 'rgba(255,255,255,0.7)', fontSize: 13, marginTop: 10 },
  busy: { color: colors.ink, fontSize: 14, fontWeight: '600' },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8 },
  groupSwitch: { width: 132, minHeight: 64, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 2 },
  chevronHit: { minWidth: 36, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  chevron: { color: colors.primary, fontSize: 28, lineHeight: 32, fontWeight: '600' },
  groupName: { flexShrink: 1, color: colors.ink, fontWeight: '700', textAlign: 'center', fontSize: 15, lineHeight: 18 },
  sideButton: { width: 88, minHeight: 64, borderRadius: 16, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  sideText: { color: colors.ink, fontWeight: '700', textAlign: 'center', fontSize: 13, lineHeight: 18 },
  shutter: { width: 78, height: 78, borderRadius: 39, borderWidth: 4, borderColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  shutterInner: { width: 60, height: 60, borderRadius: 30, backgroundColor: colors.primary },
});

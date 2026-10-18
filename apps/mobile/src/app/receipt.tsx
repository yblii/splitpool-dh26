import { useState } from 'react';
import { Alert, Image, Platform, StyleSheet, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { makeSampleExtractedReceipt } from '@splitpool/contracts';
import { Button, Card, colors, DemoNote, Screen, styles } from '../components/ui';
import { apiUrl, extractReceiptFromImage } from '../lib/api';
import { useDemo } from '../state/demo';

type PickedReceipt = {
  uri: string;
  mimeType?: string;
  fileName?: string;
};

export default function ReceiptScreen() {
  const [picked, setPicked] = useState<PickedReceipt>();
  const [busy, setBusy] = useState(false);
  const { setPendingReceipt, phase } = useDemo();

  async function pick(camera: boolean) {
    try {
      if (camera) {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          Alert.alert('Camera access needed', 'Choose an existing photo instead, or enable camera access in settings.');
          return;
        }
      }
      const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.7 };
      const result = camera
        ? await ImagePicker.launchCameraAsync(options)
        : await ImagePicker.launchImageLibraryAsync(options);
      if (!result.canceled) {
        const asset = result.assets[0];
        setPicked({
          uri: asset.uri,
          mimeType: asset.mimeType ?? undefined,
          fileName: asset.fileName ?? undefined,
        });
      }
    } catch {
      Alert.alert('Could not open photos', 'Try again or use the sample receipt below.');
    }
  }

  function openReview(draft = makeSampleExtractedReceipt()) {
    setPendingReceipt(draft);
    router.push('/receipt-review');
  }

  async function parseSelected() {
    if (!picked) {
      Alert.alert('Add a photo first', 'Take or choose a receipt photo, or use the sample receipt.');
      return;
    }
    if (phase !== 'editing') {
      Alert.alert('Bill locked', 'Reset the local demo before scanning a new receipt.');
      return;
    }
    if (!apiUrl) {
      Alert.alert(
        'API not configured',
        'Set EXPO_PUBLIC_API_URL in apps/mobile/.env and run the API, or continue with the sample receipt.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Use sample', onPress: () => openReview() },
        ],
      );
      return;
    }

    setBusy(true);
    try {
      const { draft, usedFallback, reason, errorDetail } = await extractReceiptFromImage(picked);
      if (usedFallback) {
        const detail = reason === 'provider_unavailable'
          ? 'GEMINI_API_KEY missing on the API. Set it in apps/api/.env and restart npm run api. Check GET /api/v1/health for geminiKeyPresent.'
          : (errorDetail
            ? `Gemini error: ${errorDetail}`
            : 'Gemini parsing failed. Check the API terminal logs for status/message.');
        Alert.alert(
          'Using sample parse',
          `Live parsing was unavailable, so labeled sample items were loaded for review.\n\n${detail}`,
          [{ text: 'Review', onPress: () => openReview(draft) }],
        );
        return;
      }
      openReview(draft);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not reach the API.';
      Alert.alert('Could not parse receipt', `${message}\n\nYou can still continue with the sample receipt.`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Use sample', onPress: () => openReview() },
      ]);
    } finally {
      setBusy(false);
    }
  }

  return <Screen footer={<>
    <Button
      title={busy ? 'Parsing…' : picked ? 'Parse receipt' : Platform.OS === 'web' ? 'Choose a photo' : 'Take a photo'}
      disabled={busy}
      onPress={() => {
        if (!picked) void pick(Platform.OS !== 'web');
        else void parseSelected();
      }}
    />
    <DemoNote />
  </>}>
    <View style={{ gap: 10 }}><Text style={styles.title}>Add your receipt.</Text>
      <Text style={styles.subtitle}>One clear photo. Every item accounted for.</Text></View>
    {picked ? <Image source={{ uri: picked.uri }} accessibilityLabel="Selected receipt preview" style={local.preview} resizeMode="contain" /> :
      <View style={local.placeholder}>
        <View style={local.receiptMark}><View style={local.markLine} /><View style={local.markLine} /><View style={[local.markLine, { width: 18 }]} /></View>
        <Text style={styles.label}>Your receipt goes here</Text>
        <Text style={styles.small}>Include every item and the total.</Text>
      </View>}
    <Card>
      <Text style={styles.heading}>Keep it simple</Text>
      <Text style={styles.text}>Lay the receipt flat and make sure the text is easy to read.</Text>
      {Platform.OS !== 'web' && <Button title="Choose from photos" secondary disabled={busy} onPress={() => void pick(false)} />}
      {picked && Platform.OS === 'web' && <Button title="Choose another photo" secondary disabled={busy} onPress={() => void pick(false)} />}
      <Text style={styles.small}>
        Photos upload to your local API for Gemini parsing. Without an API key the server returns a labeled sample draft.
      </Text>
    </Card>
    <Button title="Use sample receipt" secondary disabled={busy} onPress={() => openReview()} />
  </Screen>;
}

const local = StyleSheet.create({
  preview: { width: '100%', height: 260, backgroundColor: colors.subtle },
  placeholder: { minHeight: 210, backgroundColor: colors.subtle, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border, alignItems: 'center', justifyContent: 'center', gap: 10 },
  receiptMark: { width: 38, height: 46, borderWidth: 1.5, borderColor: colors.primary, padding: 8, gap: 6, marginBottom: 6 },
  markLine: { height: 1.5, width: 20, backgroundColor: colors.primary },
});

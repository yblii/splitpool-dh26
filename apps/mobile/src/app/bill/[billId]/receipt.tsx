import { useState } from 'react';
import { Alert, Image, Platform, StyleSheet, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { makeSampleExtractedReceipt, type ExtractedReceipt } from '@splitpool/contracts';
import { Button, Card, colors, Screen, styles } from '../../../components/ui';
import { extractBillReceipt, formatApiError, isApiConfigured } from '../../../lib/apiClient';
import { useReceiptSession } from '../../../state/receiptSession';

type PickedReceipt = {
  uri: string;
  mimeType?: string;
  fileName?: string;
};

export default function BillReceiptScreen() {
  const { billId, expectedVersion } = useLocalSearchParams<{
    billId: string;
    expectedVersion?: string;
  }>();
  const version = Number.parseInt(expectedVersion ?? '', 10);
  const { setSession } = useReceiptSession();
  const [picked, setPicked] = useState<PickedReceipt>();
  const [busy, setBusy] = useState(false);

  function openReview(draft: ExtractedReceipt) {
    if (!billId || !Number.isFinite(version) || version < 1) {
      Alert.alert('Missing bill', 'Go back to the bill and try scanning again.');
      return;
    }
    setSession({ billId, expectedVersion: version, draft });
    router.push({
      pathname: '/bill/[billId]/receipt-review',
      params: { billId },
    } as unknown as Href);
  }

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

  async function parseSelected() {
    if (!billId) {
      Alert.alert('Missing bill', 'Go back and open the bill again.');
      return;
    }
    if (!picked) {
      Alert.alert('Add a photo first', 'Take or choose a receipt photo, or use the sample receipt.');
      return;
    }
    if (!isApiConfigured()) {
      Alert.alert(
        'API not configured',
        'Set EXPO_PUBLIC_API_URL in apps/mobile/.env and run the API, or continue with the sample receipt.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Use sample', onPress: () => openReview(makeSampleExtractedReceipt()) },
        ],
      );
      return;
    }

    setBusy(true);
    try {
      const { draft, usedFallback, reason, errorDetail } = await extractBillReceipt(billId, picked);
      if (usedFallback) {
        const detail = reason === 'provider_unavailable'
          ? 'GEMINI_API_KEY missing on the API. Set it in apps/api/.env and restart npm run api.'
          : (errorDetail
            ? `Gemini error: ${errorDetail}`
            : 'Gemini parsing failed. Check the API terminal logs.');
        Alert.alert(
          'Using sample parse',
          `Live parsing was unavailable, so labeled sample items were loaded for review.\n\n${detail}`,
          [{ text: 'Review', onPress: () => openReview(draft) }],
        );
        return;
      }
      openReview(draft);
    } catch (error) {
      Alert.alert('Could not parse receipt', `${formatApiError(error)}\n\nYou can still continue with the sample receipt.`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Use sample', onPress: () => openReview(makeSampleExtractedReceipt()) },
      ]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen footer={<>
      <Button
        title={busy ? 'Parsing…' : picked ? 'Parse receipt' : Platform.OS === 'web' ? 'Choose a photo' : 'Take a photo'}
        disabled={busy}
        onPress={() => {
          if (!picked) void pick(Platform.OS !== 'web');
          else void parseSelected();
        }}
      />
    </>}>
      <View style={{ gap: 10 }}>
        <Text style={styles.title}>Add your receipt.</Text>
        <Text style={styles.subtitle}>One clear photo. Host reviews before anyone claims.</Text>
      </View>
      {picked ? (
        <Image source={{ uri: picked.uri }} accessibilityLabel="Selected receipt preview" style={local.preview} resizeMode="contain" />
      ) : (
        <View style={local.placeholder}>
          <View style={local.receiptMark}>
            <View style={local.markLine} />
            <View style={local.markLine} />
            <View style={[local.markLine, { width: 18 }]} />
          </View>
          <Text style={styles.label}>Your receipt goes here</Text>
          <Text style={styles.small}>Include every item and the total.</Text>
        </View>
      )}
      <Card>
        <Text style={styles.heading}>Keep it simple</Text>
        <Text style={styles.text}>Lay the receipt flat and make sure the text is easy to read.</Text>
        {Platform.OS !== 'web' && (
          <Button title="Choose from photos" secondary disabled={busy} onPress={() => void pick(false)} />
        )}
        {picked && Platform.OS === 'web' && (
          <Button title="Choose another photo" secondary disabled={busy} onPress={() => void pick(false)} />
        )}
        <Text style={styles.small}>
          Photos upload to your API for Gemini parsing and are stored with this bill. Without an API key the server returns a labeled sample draft.
        </Text>
      </Card>
      <Button
        title="Use sample receipt"
        secondary
        disabled={busy}
        onPress={() => openReview(makeSampleExtractedReceipt())}
      />
    </Screen>
  );
}

const local = StyleSheet.create({
  preview: { width: '100%', height: 260, backgroundColor: colors.subtle },
  placeholder: {
    minHeight: 210,
    backgroundColor: colors.subtle,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  receiptMark: {
    width: 38,
    height: 46,
    borderWidth: 1.5,
    borderColor: colors.primary,
    padding: 8,
    gap: 6,
    marginBottom: 6,
  },
  markLine: { height: 1.5, width: 20, backgroundColor: colors.primary },
});

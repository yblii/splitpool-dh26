import { useState } from 'react';
import { Alert, Image, Platform, StyleSheet, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { formatMoney } from '@splitpool/contracts';
import { Button, Card, colors, DemoNote, Screen, styles } from '../components/ui';
import { useDemo } from '../state/demo';

export default function ReceiptScreen() {
  const [uri, setUri] = useState<string>();
  const [showSample, setShowSample] = useState(false);
  const { bill, summary } = useDemo();
  async function pick(camera: boolean) {
    try {
      if (camera) {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) { Alert.alert('Camera access needed', 'Choose an existing photo instead, or enable camera access in settings.'); return; }
      }
      const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.7 };
      const result = camera ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
      if (!result.canceled) setUri(result.assets[0].uri);
    } catch {
      Alert.alert('Could not open photos', 'Try again or use the sample receipt below.');
    }
  }
  return <Screen footer={<>
    <Button title={Platform.OS === 'web' ? 'Choose a photo' : 'Take a photo'} onPress={() => void pick(Platform.OS !== 'web')} />
    <DemoNote />
  </>}>
    <View style={{ gap: 10 }}><Text style={styles.title}>Add your receipt.</Text>
      <Text style={styles.subtitle}>One clear photo. Every item accounted for.</Text></View>
    {uri ? <Image source={{ uri }} accessibilityLabel="Selected receipt preview" style={local.preview} resizeMode="contain" /> :
      <View style={local.placeholder}>
        <View style={local.receiptMark}><View style={local.markLine} /><View style={local.markLine} /><View style={[local.markLine, { width: 18 }]} /></View>
        <Text style={styles.label}>Your receipt goes here</Text>
        <Text style={styles.small}>Include every item and the total.</Text>
      </View>}
    <Card>
      <Text style={styles.heading}>Keep it simple</Text>
      <Text style={styles.text}>Lay the receipt flat and make sure the text is easy to read.</Text>
      {Platform.OS !== 'web' && <Button title="Choose from photos" secondary onPress={() => void pick(false)} />}
      <Text style={styles.small}>Photos stay on your device. Receipt parsing is coming next; try the sample below.</Text>
    </Card>
    <Button title="Use sample receipt" secondary onPress={() => setShowSample(true)} />
    {showSample && <Card>
      <Text style={styles.label}>Sample data · not parsed from your photo</Text>
      <Text style={styles.heading}>{bill.merchant}</Text>
      {bill.items.map((item) => <View key={item.id} style={styles.row}><Text style={[styles.text, { flex: 1 }]}>{item.name}</Text><Text style={styles.text}>{formatMoney(item.cents)}</Text></View>)}
      <View style={styles.divider} />
      <View style={styles.row}><Text style={styles.text}>Tax</Text><Text style={styles.text}>{formatMoney(bill.taxCents)}</Text></View>
      <View style={styles.row}><Text style={styles.text}>Tip</Text><Text style={styles.text}>{formatMoney(bill.tipCents)}</Text></View>
      <View style={styles.row}><Text style={styles.heading}>Total</Text><Text style={styles.heading}>{formatMoney(summary.total)}</Text></View>
    </Card>}
  </Screen>;
}

const local = StyleSheet.create({
  preview: { width: '100%', height: 260, backgroundColor: colors.subtle },
  placeholder: { minHeight: 210, backgroundColor: colors.subtle, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border, alignItems: 'center', justifyContent: 'center', gap: 10 },
  receiptMark: { width: 38, height: 46, borderWidth: 1.5, borderColor: colors.primary, padding: 8, gap: 6, marginBottom: 6 },
  markLine: { height: 1.5, width: 20, backgroundColor: colors.primary },
});

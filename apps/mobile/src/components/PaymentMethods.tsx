import { Alert, Image, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { demoMethodLabel, demoMethods, isCardWallet, people, type DemoMethodId } from '@splitpool/contracts';
import { useDemo } from '../state/demo';
import { colors, SegmentedControl, styles } from './ui';

const tint: Record<DemoMethodId, string> = {
  'apple-pay': '#1C1C1E',
  'google-pay': '#1A3A5C',
  link: '#0A2540',
  visa: '#12344A',
  'visa-debit': '#1B4332',
  mastercard: '#6B2D3C',
};

export function PaymentMethods({ readonly = false }: { readonly?: boolean }) {
  const { person, setPerson, methods, setPersonMethod, payment } = useDemo();
  const mine = methods[person];
  const seat = payment?.session?.seats.find((entry) => entry.userId === person);
  const locked = readonly || seat?.status === 'authorized' || seat?.status === 'captured' || seat?.status === 'refunded';
  const name = people.find((entry) => entry.id === person)?.name ?? 'You';

  async function upload(camera: boolean) {
    try {
      if (camera) {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          Alert.alert('Camera access needed', 'Choose an existing photo instead, or enable camera access in settings.');
          return;
        }
      }
      const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.7 };
      const result = camera ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
      if (!result.canceled) setPersonMethod({ methodId: mine.methodId ?? 'visa', imageUri: result.assets[0].uri });
    } catch {
      Alert.alert('Could not open photos', 'Choose one of the demo cards below.');
    }
  }

  return <View style={{ gap: 16 }}>
    {!readonly && <>
      <Text style={styles.label}>Card for</Text>
      <SegmentedControl label="Card for" options={people.map((entry) => ({ value: entry.id, label: entry.name }))} value={person} onChange={setPerson} />
    </>}
    <View style={[local.preview, { backgroundColor: mine.methodId ? tint[mine.methodId] : colors.subtle }]}
      accessibilityLabel={mine.methodId ? `${name}'s ${demoMethodLabel(mine.methodId)}` : `${name} has no payment method`}>
      {mine.imageUri ? <Image source={{ uri: mine.imageUri }} accessibilityLabel={`${name}'s uploaded card photo`} style={local.photo} resizeMode="cover" /> : null}
      <View style={{ gap: 4 }}>
        <Text style={[local.brand, !mine.methodId && { color: colors.ink }]}>{mine.methodId ? demoMethods.find((entry) => entry.id === mine.methodId)?.label : 'No card yet'}</Text>
        <Text style={[local.digits, !mine.methodId && { color: colors.muted }]}>{mine.methodId ? (isCardWallet(mine.methodId) ? 'Pays with a card' : `•••• •••• •••• ${demoMethods.find((entry) => entry.id === mine.methodId)?.last4}`) : 'Choose a card'}</Text>
      </View>
      <Text style={[local.sim, !mine.methodId && { color: colors.muted }]}>Simulated</Text>
    </View>
    {!locked && <>
      <View style={{ gap: 8 }}>
        {demoMethods.map((method) => {
          const selected = mine.methodId === method.id;
          return <Pressable key={method.id} accessibilityRole="button" accessibilityState={{ selected, disabled: locked }}
            accessibilityLabel={`${name}: ${demoMethodLabel(method.id)}`} disabled={locked}
            onPress={() => setPersonMethod({ methodId: method.id })}
            style={[local.choice, selected && local.choiceSelected]}>
            <Text style={[styles.text, selected && { fontWeight: '700' }]}>{method.label}</Text>
            <Text style={styles.small}>{method.last4 ? `···· ${method.last4}` : 'Pays with a card'}</Text>
          </Pressable>;
        })}
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel={`Upload card photo for ${name}`} onPress={() => void upload(false)} style={local.upload}>
        <Text style={styles.link}>{mine.imageUri ? 'Replace photo' : 'Upload card photo'}</Text>
      </Pressable>
      {Platform.OS !== 'web' && <Pressable accessibilityRole="button" accessibilityLabel={`Take card photo for ${name}`} onPress={() => void upload(true)} style={local.upload}>
        <Text style={styles.link}>Take a photo</Text>
      </Pressable>}
      {mine.methodId && <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${name}'s card`} onPress={() => setPersonMethod({ methodId: null, imageUri: null })} style={local.upload}>
        <Text style={styles.link}>Remove card</Text>
      </Pressable>}
    </>}
    <View style={{ gap: 8 }}>
      <Text style={styles.label}>On this bill</Text>
      {people.map((entry) => {
        const chosen = methods[entry.id].methodId;
        return <View key={entry.id} style={styles.row}>
          <Text style={[styles.text, entry.id === person && { fontWeight: '700' }]}>{entry.name}</Text>
          <Text style={styles.small}>{chosen ? demoMethodLabel(chosen) : 'No card yet'}</Text>
        </View>;
      })}
    </View>
    <Text style={styles.small}>Apple Pay, Google Pay, and Link pay with a card. A bank-funded Link payment is declined. Nothing is charged until the pooled card is used.</Text>
  </View>;
}

const local = StyleSheet.create({
  preview: { minHeight: 148, borderRadius: 16, padding: 18, justifyContent: 'space-between', overflow: 'hidden', gap: 16 },
  photo: { width: '100%', height: 120, borderRadius: 10 },
  brand: { color: '#F4F7FA', fontSize: 18, fontWeight: '800' },
  digits: { color: '#F4F7FA', fontSize: 16, letterSpacing: 1.4, fontVariant: ['tabular-nums'] },
  sim: { color: '#D5E2EC', fontSize: 11, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase' },
  choice: { minHeight: 48, paddingHorizontal: 14, paddingVertical: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 3, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  choiceSelected: { borderColor: colors.primary, backgroundColor: colors.light },
  upload: { minHeight: 44, justifyContent: 'center' },
});

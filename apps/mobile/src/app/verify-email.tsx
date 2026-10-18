import { Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Button, Card, Screen, styles } from '../components/ui';

export default function VerifyEmailScreen() {
  const { email } = useLocalSearchParams<{ email?: string }>();
  const address = typeof email === 'string' ? email : undefined;

  return (
    <Screen>
      <View style={{ gap: 10 }}>
        <Text style={styles.title}>Verify your email.</Text>
        <Text style={styles.subtitle}>
          We sent a confirmation link{address ? ` to ${address}` : ''}. Open it to activate your account, then sign in.
        </Text>
      </View>
      <Card>
        <Text style={styles.small}>
          Check spam if you do not see the message. After you confirm, use the same email and password to sign in.
        </Text>
        <Button title="Go to sign in" onPress={() => router.replace('/login')} />
      </Card>
    </Screen>
  );
}

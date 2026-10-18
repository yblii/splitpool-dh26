import { Text, View } from 'react-native';
import { router } from 'expo-router';
import { Button, Card, DemoNote, Screen, styles } from '../components/ui';
import { useDemo } from '../state/demo';

function formatSettledAt(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function HistoryScreen() {
  const { mealHistory, profileName } = useDemo();

  return (
    <Screen>
      <View style={{ gap: 10 }}>
        <Text style={styles.title}>Meal history.</Text>
        <Text style={styles.subtitle}>
          Positive food titles from settled splits{profileName ? ` for ${profileName}` : ''}.
        </Text>
      </View>

      {mealHistory.length === 0 ? (
        <Card>
          <Text style={styles.heading}>No meals yet</Text>
          <Text style={styles.small}>
            Finish a demo payment and Gemini (or the local fallback) will invent titles for everyone based on what they ate.
          </Text>
          <Button title="Go to payment" secondary onPress={() => router.push('/payment')} />
        </Card>
      ) : (
        mealHistory.map((entry) => (
          <Card key={entry.id}>
            <Text style={styles.heading}>{entry.groupName}</Text>
            <Text style={styles.small}>
              {entry.merchant} · {formatSettledAt(entry.settledAt)}
            </Text>
            {entry.titles.map((title) => (
              <View key={`${entry.id}-${title.id}`} style={{ gap: 2 }}>
                <View style={styles.row}>
                  <Text style={[styles.text, { flex: 1 }]}>{title.name}</Text>
                  <Text style={[styles.text, { fontWeight: '800', color: '#326B60', maxWidth: '55%', textAlign: 'right' }]}>
                    {title.title}
                  </Text>
                </View>
                <Text style={styles.small}>
                  {title.items.length ? title.items.join(' · ') : 'No items claimed'}
                </Text>
              </View>
            ))}
          </Card>
        ))
      )}

      <Button title="Back to profile" secondary onPress={() => router.push('/profile')} />
      <DemoNote />
    </Screen>
  );
}

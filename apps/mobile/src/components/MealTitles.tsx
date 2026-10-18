import { Text, View } from 'react-native';
import type { MealTitlesResponse } from '@splitpool/contracts';
import { Card, colors, styles } from './ui';

export function MealTitles({ result, loading }: { result?: MealTitlesResponse; loading?: boolean }) {
  return <Card>
    <Text style={styles.heading}>Your table, titled</Text>
    {loading ? <Text accessibilityLiveRegion="polite" style={styles.text}>Creating food-inspired titles… Checkout is already complete.</Text>
      : !result ? <Text style={styles.small}>Titles were skipped for this meal. Payment completion never depends on AI.</Text>
        : <>
          <Text style={styles.small}>{result.usedFallback ? 'Keyword fallback · AI was unavailable or output was filtered' : 'AI-generated food wordplay'} · No health judgments</Text>
          {result.titles.map(row => <View key={row.id} style={{ gap: 4, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <Text style={styles.label}>{row.name}</Text>
            <Text style={[styles.subheading, { color: colors.primary }]}>{row.title}</Text>
            <Text style={styles.small}>{row.items.length ? `Inspired by ${row.items.join(', ')}` : 'Here for the company'}</Text>
          </View>)}
          <Text style={styles.small}>Your title stays on this device until your next settled restaurant bill. You can hide it from your profile.</Text>
        </>}
  </Card>;
}

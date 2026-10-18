import { Text, View } from 'react-native';
import type { MealTitlesResponse } from '@splitpool/contracts';
import { Card, colors, styles } from './ui';

export function MealTitles({ result, loading }: { result?: MealTitlesResponse; loading?: boolean }) {
  return <Card>
    <Text style={styles.heading}>Your table, titled</Text>
    {loading ? <Text accessibilityLiveRegion="polite" style={styles.text}>Creating food-inspired titles…</Text>
      : !result ? <Text style={styles.small}>Titles were skipped for this meal.</Text>
        : <>
          {result.titles.map(row => <View key={row.id} style={{ gap: 4, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <Text style={styles.label}>{row.name}</Text>
            <Text style={[styles.subheading, { color: colors.primary }]}>{row.title}</Text>
            <Text style={styles.small}>{row.items.length ? `Inspired by ${row.items.join(', ')}` : 'Here for the company'}</Text>
          </View>)}
        </>}
  </Card>;
}

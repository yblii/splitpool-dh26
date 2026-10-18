import { StyleSheet, Text, View } from 'react-native';
import type { MealTitleAssignment } from '@splitpool/contracts';
import { Button, Card, colors, styles } from './ui';

type Props = {
  titles: MealTitleAssignment[] | null;
  loading?: boolean;
  source?: string | null;
  groupName?: string;
  merchant?: string;
  onReturnToGroups: () => void;
  onViewHistory?: () => void;
};

/** Post-payment summary of positive food titles for each diner. */
export function MealTitlesSummary({
  titles,
  loading = false,
  source,
  groupName,
  merchant,
  onReturnToGroups,
  onViewHistory,
}: Props) {
  return (
    <View style={{ gap: 24 }}>
      <View style={{ gap: 10 }}>
        <Text style={styles.title}>All settled.</Text>
        <Text style={styles.subtitle}>
          {[groupName, merchant].filter(Boolean).join(' · ') || 'Your group'}
          {' · meal titles'}
        </Text>
      </View>

      <Card>
        <Text style={styles.heading}>Meal titles</Text>
        <Text style={styles.small}>
          Positive nicknames inspired by what each person ate
          {source ? ` · ${source}` : ''}.
        </Text>
        {loading && !titles && (
          <Text accessibilityLiveRegion="polite" style={styles.small}>Crafting titles…</Text>
        )}
        {titles?.map((entry) => (
          <View key={entry.id} style={local.titleBlock}>
            <View style={styles.row}>
              <Text style={[styles.text, { flex: 1 }]}>{entry.name}</Text>
              <Text style={local.titleBadge}>{entry.title}</Text>
            </View>
            <Text style={styles.small}>
              {entry.items.length ? entry.items.join(' · ') : 'No items claimed'}
            </Text>
          </View>
        ))}
      </Card>

      <Button title="Return to groups" onPress={onReturnToGroups} />
      {onViewHistory && <Button title="View history" secondary onPress={onViewHistory} />}
    </View>
  );
}

const local = StyleSheet.create({
  titleBlock: { gap: 4 },
  titleBadge: {
    color: colors.success,
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    maxWidth: '58%',
    textAlign: 'right',
  },
});

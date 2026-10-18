import { Pressable, Text, View } from 'react-native';
import { AvatarStack, type AvatarPerson } from './people';
import { colors, styles } from './ui';

export function GroupCard({ name, members, meta, detail, onPress }: {
  name: string;
  members: AvatarPerson[];
  meta: string;
  detail?: string;
  onPress: () => void;
}) {
  return <Pressable
    accessibilityRole="button"
    accessibilityLabel={`${name}, ${meta}${detail ? `, ${detail}` : ''}`}
    onPress={onPress}
    style={({ pressed }) => [{
      backgroundColor: colors.paper, borderRadius: 20, borderWidth: 1, borderColor: colors.border,
      padding: 16, gap: 12, opacity: pressed ? 0.86 : 1,
    }]}
  >
    <View style={styles.row}>
      <Text style={[styles.heading, { flex: 1 }]}>{name}</Text>
      <Text style={{ color: colors.muted, fontSize: 22, lineHeight: 24 }} accessibilityElementsHidden importantForAccessibility="no">›</Text>
    </View>
    <View style={[styles.row, { justifyContent: 'flex-start' }]}>
      <AvatarStack people={members} />
      <Text style={styles.small}>{meta}</Text>
    </View>
    {detail ? <Text style={styles.text}>{detail}</Text> : null}
  </Pressable>;
}

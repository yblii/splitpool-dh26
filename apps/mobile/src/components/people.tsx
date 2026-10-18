import { Pressable, ScrollView, Text, View } from 'react-native';
import { colors, styles } from './ui';

export type AvatarPerson = {
  id: string;
  name: string;
  initial: string;
  color: string;
};

export function MemberAvatar({ person, size = 36 }: { person: AvatarPerson; size?: number }) {
  return <View
    accessibilityLabel={person.name}
    style={{
      width: size, height: size, borderRadius: size / 2, backgroundColor: person.color,
      alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.paper,
    }}
  >
    <Text style={{ fontFamily: 'Inter', color: '#FFFFFF', fontWeight: '700', fontSize: Math.max(11, size * 0.38) }}>{person.initial}</Text>
  </View>;
}

export function AvatarStack({ people, max = 4, size = 28 }: { people: AvatarPerson[]; max?: number; size?: number }) {
  const shown = people.slice(0, max);
  const extra = people.length - shown.length;
  return <View accessibilityLabel={people.map((person) => person.name).join(', ')} style={{ flexDirection: 'row', alignItems: 'center' }}>
    {shown.map((person, index) => <View key={person.id} style={{ marginLeft: index === 0 ? 0 : -8 }}>
      <MemberAvatar person={person} size={size} />
    </View>)}
    {extra > 0 && <Text style={[styles.small, { marginLeft: 6 }]}>+{extra}</Text>}
  </View>;
}

export function PersonSwitcher({ people, value, onChange }: {
  people: AvatarPerson[]; value: string; onChange: (id: string) => void;
}) {
  return <View style={{ gap: 8 }}>
    <Text style={styles.label}>Demo · viewing as</Text>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
      {people.map((person) => {
        const selected = person.id === value;
        return <Pressable
          key={person.id}
          accessibilityRole="button"
          accessibilityState={{ selected }}
          accessibilityLabel={`View as ${person.name}`}
          onPress={() => onChange(person.id)}
          style={{
            minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8,
            paddingLeft: 6, paddingRight: 12, borderRadius: 22,
            backgroundColor: selected ? colors.paper : colors.subtle,
            borderWidth: 1.5, borderColor: selected ? person.color : colors.border,
          }}
        >
          <MemberAvatar person={person} size={28} />
          <Text style={{ color: colors.ink, fontWeight: '700', fontSize: 14 }}>{person.name}</Text>
        </Pressable>;
      })}
    </ScrollView>
    <Text style={styles.small}>Switch people on this device to claim, approve, and pay as them.</Text>
  </View>;
}

import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { AvatarStack, type AvatarPerson } from './people';
import { colors, styles } from './ui';

const PAPER = '#FFFDF8';
const TOOTH = 22;

export function GroupCard({ name, members, pinned, hideLabel = 'Hide', onPress, onPin, onHide }: {
  name: string;
  members: AvatarPerson[];
  pinned?: boolean;
  hideLabel?: string;
  onPress: () => void;
  onPin: () => void;
  onHide: () => void;
}) {
  return <View>
    <View style={{ backgroundColor: PAPER, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10, gap: 10 }}>
      <View style={styles.row}>
        <Pressable accessibilityRole="button" accessibilityLabel={`Open ${name}${pinned ? ', pinned' : ''}`} onPress={onPress} style={{ flex: 1, minHeight: 36, justifyContent: 'center' }}>
          <Text style={styles.heading}>{name}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={pinned ? `Unpin ${name}` : `Pin ${name}`} hitSlop={8} onPress={onPin} style={{ minHeight: 36, justifyContent: 'center', paddingHorizontal: 4 }}>
          <Text style={{ color: pinned ? colors.primary : colors.muted, fontWeight: '700', fontSize: 13 }}>{pinned ? 'Pinned' : 'Pin'}</Text>
        </Pressable>
      </View>
      <View style={[styles.row, { justifyContent: 'flex-start' }]}>
        <Pressable accessibilityRole="button" accessibilityLabel={`Open ${name}`} onPress={onPress}>
          <AvatarStack people={members} />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={`${hideLabel} ${name}`} hitSlop={8} onPress={onHide}>
          <Text style={[styles.small, { fontWeight: '700' }]}>{hideLabel}</Text>
        </Pressable>
      </View>
    </View>
    <ReceiptTeeth />
  </View>;
}

function ReceiptTeeth() {
  const [count, setCount] = useState(24);
  return <View
    onLayout={(event) => {
      const next = Math.max(10, Math.floor(event.nativeEvent.layout.width / TOOTH));
      setCount((current) => current === next ? current : next);
    }}
    style={{ flexDirection: 'row', height: 16, overflow: 'hidden', backgroundColor: '#E7D3B8' }}
  >
    {Array.from({ length: count }, (_, index) => <View key={index} style={{
      width: 0, height: 0,
      borderLeftWidth: TOOTH / 2, borderRightWidth: TOOTH / 2, borderTopWidth: 16,
      borderLeftColor: 'transparent', borderRightColor: 'transparent', borderTopColor: PAPER,
    }} />)}
  </View>;
}

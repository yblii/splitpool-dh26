import { useState } from 'react';
import { Animated, PanResponder, Pressable, Text, View } from 'react-native';
import { AvatarStack, type AvatarPerson } from './people';
import { colors, styles } from './ui';

const PAPER = '#FFFDF8';

const cardDrag = new Map<string, { editing: boolean; dragging: boolean; onDrag: (slots: number) => void }>();

function dragFor(id: string) {
  const existing = cardDrag.get(id);
  if (existing) return existing;
  const created = { editing: false, dragging: false, onDrag: (_slots: number) => {} };
  cardDrag.set(id, created);
  return created;
}

export function GroupCard({ id, name, members, recent, editing, selected, onPress, onDrag }: {
  id: string;
  name: string;
  members: AvatarPerson[];
  recent?: string;
  editing?: boolean;
  selected?: boolean;
  onPress: () => void;
  onDrag?: (slots: number) => void;
}) {
  const motion = dragFor(id);
  motion.editing = !!editing;
  motion.onDrag = onDrag ?? (() => {});
  const [offset] = useState(() => new Animated.Value(0));
  const [lifted, setLifted] = useState(false);
  const [pan] = useState(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesture) => motion.editing && Math.abs(gesture.dy) > 8 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: () => {
      motion.dragging = true;
      setLifted(true);
    },
    onPanResponderMove: (_, gesture) => {
      offset.setValue(gesture.dy);
    },
    onPanResponderRelease: (_, gesture) => {
      const slots = Math.round(gesture.dy / 96);
      offset.setValue(0);
      setLifted(false);
      if (slots !== 0) motion.onDrag(slots);
      setTimeout(() => { motion.dragging = false; }, 80);
    },
  }));

  return <Animated.View
    style={{ transform: [{ translateY: offset }], zIndex: lifted ? 2 : 0 }}
    {...(editing ? pan.panHandlers : {})}
  >
    <View style={{ borderRadius: 20, overflow: 'hidden', borderWidth: selected ? 1.5 : 0, borderColor: colors.primary, backgroundColor: PAPER }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={editing ? `${name}. ${selected ? 'Selected. ' : ''}Drag up or down to reorder.` : `Open ${name}${recent ? `. Last split ${recent}` : ''}`}
        accessibilityHint={editing ? 'Drag up or down to reorder. Hide is at the top.' : undefined}
        onPress={() => {
          if (motion.dragging) return;
          onPress();
        }}
        style={{ backgroundColor: PAPER, paddingHorizontal: 16, paddingVertical: 14, gap: 10 }}
      >
        <View style={[styles.row, { justifyContent: 'flex-start', gap: 10 }]}>
          {editing ? <Text accessibilityElementsHidden importantForAccessibility="no" style={{ color: colors.muted, fontSize: 18, lineHeight: 20 }}>≡</Text> : null}
          <Text style={styles.heading}>{name}</Text>
        </View>
        <AvatarStack people={members} />
        {recent ? <Text style={styles.small} numberOfLines={1}>{recent}</Text> : null}
      </Pressable>
    </View>
  </Animated.View>;
}

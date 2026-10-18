import { useEffect, useState, type PropsWithChildren, type ReactNode } from 'react';
import { Animated, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, styles, useReduceMotion } from './ui';

export function BottomSheet({
  visible, title, onClose, children, footer,
}: PropsWithChildren<{ visible: boolean; title: string; onClose: () => void; footer?: ReactNode }>) {
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();
  const [scale] = useState(() => new Animated.Value(0.8));
  const [opacity] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (!visible) {
      scale.setValue(reduceMotion ? 1 : 0.8);
      opacity.setValue(0);
      return;
    }
    if (reduceMotion) {
      scale.setValue(1);
      opacity.setValue(1);
      return;
    }
    scale.setValue(0.8);
    opacity.setValue(0);
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, friction: 6, tension: 180 }),
      Animated.timing(opacity, { toValue: 1, duration: 140, useNativeDriver: true }),
    ]).start();
  }, [opacity, reduceMotion, scale, visible]);
  return <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={sheetStyles.flex}>
      <View style={sheetStyles.backdrop}>
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, sheetStyles.dim, { opacity }]} />
        <Pressable accessibilityLabel="Close sheet" style={sheetStyles.dismiss} onPress={onClose} />
        <Animated.View style={[sheetStyles.sheet, { paddingBottom: Math.max(insets.bottom, 16), opacity, transform: [{ scale }] }]}>
          <View style={sheetStyles.handle} />
          <Text accessibilityRole="header" style={styles.heading}>{title}</Text>
          {children}
          {footer}
        </Animated.View>
      </View>
    </KeyboardAvoidingView>
  </Modal>;
}

export function CenterDialog({
  visible, title, children, onClose,
}: PropsWithChildren<{ visible: boolean; title: string; onClose: () => void }>) {
  const reduceMotion = useReduceMotion();
  return <Modal visible={visible} transparent animationType={reduceMotion ? 'none' : 'fade'} onRequestClose={onClose}>
    <View style={sheetStyles.centerBackdrop}>
      <View style={sheetStyles.dialog}>
        <Text accessibilityRole="header" style={styles.heading}>{title}</Text>
        {children}
      </View>
    </View>
  </Modal>;
}

const sheetStyles = StyleSheet.create({
  flex: { flex: 1 },
  backdrop: { flex: 1, justifyContent: 'flex-end' },
  dim: { backgroundColor: 'rgba(22, 50, 74, 0.45)' },
  dismiss: { flex: 1 },
  sheet: {
    backgroundColor: colors.paper, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 20, paddingTop: 10, gap: 14, maxHeight: '88%',
  },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, marginBottom: 4 },
  centerBackdrop: {
    flex: 1, backgroundColor: 'rgba(22, 50, 74, 0.45)', alignItems: 'center', justifyContent: 'center', padding: 24,
  },
  dialog: {
    width: '100%', maxWidth: 420, backgroundColor: colors.paper, borderRadius: 24, padding: 20, gap: 12,
  },
});

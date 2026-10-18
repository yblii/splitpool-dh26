import type { PropsWithChildren, ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, styles, useReduceMotion } from './ui';

export function BottomSheet({
  visible, title, onClose, children, footer,
}: PropsWithChildren<{ visible: boolean; title: string; onClose: () => void; footer?: ReactNode }>) {
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();
  return <Modal visible={visible} transparent animationType={reduceMotion ? 'none' : 'slide'} onRequestClose={onClose}>
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={sheetStyles.flex}>
      <View style={sheetStyles.backdrop}>
        <Pressable accessibilityLabel="Close sheet" style={sheetStyles.dismiss} onPress={onClose} />
        <View style={[sheetStyles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <View style={sheetStyles.handle} />
          <Text accessibilityRole="header" style={styles.heading}>{title}</Text>
          {children}
          {footer}
        </View>
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
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(22, 50, 74, 0.45)' },
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

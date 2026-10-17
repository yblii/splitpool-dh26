import type { PropsWithChildren, ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export const colors = {
  background: '#FFFFFF', paper: '#FFFFFF', ink: '#17354B', muted: '#637383',
  primary: '#214F72', light: '#EDF3F8', subtle: '#F5F7F9', border: '#DFE6EC',
  success: '#326B60', warning: '#8A5C28', disabled: '#E9EEF2',
};

export function Screen({ children, footer }: PropsWithChildren<{ footer?: ReactNode }>) {
  const insets = useSafeAreaInsets();
  return <View style={styles.screen}>
    <ScrollView contentContainerStyle={[styles.content, { paddingBottom: 28 + (footer ? 0 : insets.bottom) }]}
      keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
      {children}
    </ScrollView>
    {footer && <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
      <View style={styles.footerContent}>{footer}</View>
    </View>}
  </View>;
}

export function Card({ children }: PropsWithChildren) {
  return <View style={styles.section}>{children}</View>;
}

export function Button({ title, onPress, secondary = false, disabled = false }: {
  title: string; onPress: () => void; secondary?: boolean; disabled?: boolean;
}) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [styles.button, secondary && styles.secondary, disabled && styles.buttonDisabled, pressed && { opacity: 0.75 }]}>
    <Text style={[styles.buttonText, secondary && { color: colors.primary }, disabled && { color: colors.muted }]}>{title}</Text>
  </Pressable>;
}

export function SegmentedControl<T extends string | number>({ options, value, onChange, disabled = false, label }: {
  options: { value: T; label: string }[]; value: T; onChange: (value: T) => void; disabled?: boolean; label: string;
}) {
  return <View style={styles.segments}>{options.map((option) => <Pressable key={option.value}
    accessibilityRole="button" accessibilityLabel={`${label}: ${option.label}`}
    accessibilityState={{ selected: value === option.value, disabled }} disabled={disabled}
    onPress={() => onChange(option.value)} style={({ pressed }) => [styles.segment,
      value === option.value && styles.segmentSelected, disabled && { opacity: 0.6 }, pressed && { opacity: 0.65 }]}>
    <Text style={[styles.segmentText, value === option.value && { color: colors.ink }]}>{option.label}</Text>
  </Pressable>)}</View>;
}

export function DemoNote() {
  return <View style={styles.notice}>
    <View style={styles.noticeDot} />
    <Text style={styles.noticeText}>Demo mode · No real money moves</Text>
  </View>;
}

export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: 24, paddingTop: 28, gap: 24, width: '100%', maxWidth: 600, alignSelf: 'center' },
  section: { paddingVertical: 8, paddingBottom: 24, borderBottomWidth: 1, borderColor: colors.border, gap: 16 },
  title: { fontSize: 30, lineHeight: 36, fontWeight: '800', color: colors.ink, letterSpacing: 0.4, textTransform: 'uppercase' },
  subtitle: { fontSize: 15, lineHeight: 23, color: colors.muted },
  heading: { fontSize: 18, lineHeight: 24, fontWeight: '800', color: colors.ink, letterSpacing: 0.8, textTransform: 'uppercase' },
  text: { fontSize: 16, lineHeight: 24, color: colors.ink },
  small: { fontSize: 12, lineHeight: 19, color: colors.muted },
  label: { fontSize: 10, lineHeight: 16, letterSpacing: 1.5, fontWeight: '700', color: colors.muted, textTransform: 'uppercase' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  button: { minHeight: 54, paddingVertical: 16, paddingHorizontal: 20, borderRadius: 28, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'transparent' },
  secondary: { backgroundColor: colors.paper, borderColor: colors.border },
  buttonDisabled: { backgroundColor: colors.disabled, borderColor: colors.disabled },
  buttonText: { fontSize: 12, lineHeight: 19, letterSpacing: 1.1, textTransform: 'uppercase', textAlign: 'center', fontWeight: '700', color: '#FFFFFF' },
  segments: { flexDirection: 'row', borderWidth: 1, borderColor: colors.border, backgroundColor: colors.subtle, borderRadius: 3, overflow: 'hidden' },
  segment: { flex: 1, minHeight: 46, paddingVertical: 13, paddingHorizontal: 6, borderBottomWidth: 2, borderBottomColor: 'transparent', alignItems: 'center', justifyContent: 'center' },
  segmentSelected: { backgroundColor: colors.paper, borderBottomColor: colors.primary },
  segmentText: { color: colors.muted, fontSize: 11, lineHeight: 18, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', textAlign: 'center' },
  notice: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  noticeDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: colors.muted },
  noticeText: { color: colors.muted, fontSize: 10, lineHeight: 16, letterSpacing: 0.2 },
  input: { borderBottomWidth: 1, borderColor: colors.border, backgroundColor: colors.subtle, borderRadius: 3, padding: 14, fontSize: 16, color: colors.ink, minHeight: 50 },
  divider: { height: 1, backgroundColor: colors.border },
  link: { color: colors.primary, fontSize: 11, lineHeight: 18, letterSpacing: 0.7, fontWeight: '700', textTransform: 'uppercase' },
  footer: { backgroundColor: colors.paper, borderTopWidth: 1, borderColor: colors.border, paddingTop: 14, paddingHorizontal: 24 },
  footerContent: { width: '100%', maxWidth: 552, alignSelf: 'center', gap: 10 },
});

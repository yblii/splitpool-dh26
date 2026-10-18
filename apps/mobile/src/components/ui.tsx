import { useEffect, useState, type PropsWithChildren, type ReactNode } from 'react';
import {
  AccessibilityInfo,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { inter, monoFamily } from '../fonts';

export const colors = {
  background: '#F3F6F8',
  paper: '#FFFFFF',
  ink: '#16324A',
  muted: '#5C6E7E',
  primary: '#1F4E72',
  light: '#E7F0F7',
  subtle: '#F7F9FB',
  border: '#E1E8EE',
  success: '#1E7A4D',
  successSoft: '#E7F6EE',
  warning: '#8A5A24',
  warningSoft: '#FBF4EA',
  danger: '#9E3B3B',
  dangerSoft: '#FDEEEE',
  disabled: '#E6ECF1',
  shadow: 'rgba(22, 50, 74, 0.08)',
};

export function useReduceMotion() {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((value) => { if (active) setReduce(value); });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce);
    return () => { active = false; subscription.remove(); };
  }, []);
  return reduce;
}

export function Screen({
  children,
  header,
  footer,
  demoNote = true,
  fill = false,
}: PropsWithChildren<{ header?: ReactNode; footer?: ReactNode; demoNote?: boolean; fill?: boolean }>) {
  const insets = useSafeAreaInsets();
  return <View style={styles.screen}>
    {header}
    <ScrollView
      style={fill ? styles.fill : undefined}
      contentContainerStyle={[styles.content, fill && styles.fill, { paddingBottom: footer ? 24 : 32 }]}
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets
    >
      {children}
    </ScrollView>
    <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
      {footer}
      {demoNote && <DemoNote />}
    </View>
  </View>;
}

export function AppHeader({ title, onBack, right }: { title: string; onBack?: () => void; right?: ReactNode }) {
  const insets = useSafeAreaInsets();
  return <View style={[styles.header, { paddingTop: Math.max(insets.top, 12) }]}>
    {onBack ? <Pressable accessibilityRole="button" accessibilityLabel="Go back" hitSlop={10} onPress={onBack} style={styles.headerSide}>
      <Text style={styles.headerAction}>Back</Text>
    </Pressable> : <View style={styles.headerSide} />}
    <Text accessibilityRole="header" numberOfLines={1} style={styles.headerTitle}>{title}</Text>
    <View style={[styles.headerSide, styles.headerRight]}>{right}</View>
  </View>;
}

export function Card({ children, style }: PropsWithChildren<{ style?: StyleProp<ViewStyle> }>) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Button({ title, onPress, secondary = false, disabled = false, compact = false, style }: {
  title: string; onPress: () => void; secondary?: boolean; disabled?: boolean; compact?: boolean; style?: StyleProp<ViewStyle>;
}) {
  return <Pressable
    accessibilityRole="button"
    accessibilityState={{ disabled }}
    disabled={disabled}
    onPress={onPress}
    style={({ pressed }) => [
      styles.button,
      compact && styles.buttonCompact,
      secondary && styles.secondary,
      disabled && styles.buttonDisabled,
      pressed && !disabled && styles.pressed,
      style,
    ]}
  >
    <Text style={[styles.buttonText, secondary && styles.secondaryText, disabled && styles.disabledText]}>{title}</Text>
  </Pressable>;
}

export function SegmentedControl<T extends string | number>({ options, value, onChange, disabled = false, label }: {
  options: { value: T; label: string }[]; value: T; onChange: (value: T) => void; disabled?: boolean; label: string;
}) {
  return <View style={styles.segments}>{options.map((option) => <Pressable key={String(option.value)}
    accessibilityRole="button" accessibilityLabel={`${label}: ${option.label}`}
    accessibilityState={{ selected: value === option.value, disabled }} disabled={disabled}
    onPress={() => onChange(option.value)} style={({ pressed }) => [
      styles.segment,
      value === option.value && styles.segmentSelected,
      disabled && styles.dimmed,
      pressed && styles.pressed,
    ]}>
    <Text style={[styles.segmentText, value === option.value && styles.segmentTextSelected]}>{option.label}</Text>
  </Pressable>)}</View>;
}

export function TextField({ label, style, ...props }: { label: string } & TextInputProps) {
  return <View style={styles.field}>
    <Text style={styles.label}>{label}</Text>
    <TextInput
      {...props}
      placeholderTextColor={colors.muted}
      style={[styles.input, style]}
    />
  </View>;
}

export function DemoNote() {
  return <View style={styles.notice}>
    <View style={styles.noticeDot} />
    <Text style={styles.noticeText}>Demo mode · No real money moves</Text>
  </View>;
}

export function ErrorBanner({ title, message, tone = 'warning' }: {
  title?: string; message: string; tone?: 'warning' | 'danger' | 'success';
}) {
  const palette = tone === 'danger'
    ? { background: colors.dangerSoft, text: colors.danger }
    : tone === 'success'
      ? { background: colors.successSoft, text: colors.success }
      : { background: colors.warningSoft, text: colors.warning };
  return <View accessibilityLiveRegion="polite" style={[styles.banner, { backgroundColor: palette.background }]}>
    {title ? <Text style={[styles.bannerTitle, { color: palette.text }]}>{title}</Text> : null}
    <Text style={[styles.bannerBody, { color: palette.text }]}>{message}</Text>
  </View>;
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  return <View style={styles.empty}>
    <Text style={styles.heading}>{title}</Text>
    <Text style={styles.subtitle}>{body}</Text>
  </View>;
}

export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  fill: { flexGrow: 1 },
  content: { paddingHorizontal: 20, paddingTop: 8, gap: 16, width: '100%', minWidth: 0 },
  header: {
    paddingHorizontal: 12, paddingBottom: 10, flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: colors.background,
  },
  headerSide: { width: 76, minHeight: 44, justifyContent: 'center' },
  headerRight: { alignItems: 'flex-end' },
  headerTitle: { ...inter, flex: 1, textAlign: 'center', color: colors.ink, fontSize: 17, lineHeight: 22, fontWeight: '700' },
  headerAction: { ...inter, color: colors.primary, fontSize: 16, lineHeight: 22, fontWeight: '600', paddingHorizontal: 8 },
  card: {
    backgroundColor: colors.paper, borderRadius: 20, padding: 16, gap: 12,
    borderWidth: 1, borderColor: colors.border,
    ...Platform.select({
      web: { boxShadow: '0 8px 24px rgba(22, 50, 74, 0.06)' },
      default: {
        shadowColor: '#16324A', shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 2,
      },
    }),
  },
  title: { ...inter, fontSize: 30, lineHeight: 36, fontWeight: '700', color: colors.ink, letterSpacing: -0.4 },
  subtitle: { ...inter, fontSize: 15, lineHeight: 22, color: colors.muted },
  heading: { ...inter, fontSize: 18, lineHeight: 24, fontWeight: '700', color: colors.ink },
  text: { ...inter, fontSize: 16, lineHeight: 23, color: colors.ink },
  small: { ...inter, fontSize: 13, lineHeight: 18, color: colors.muted },
  label: { ...inter, fontSize: 12, lineHeight: 16, letterSpacing: 0.4, fontWeight: '700', color: colors.muted },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  button: {
    minHeight: 52, paddingVertical: 14, paddingHorizontal: 18, borderRadius: 16,
    backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: colors.primary,
  },
  buttonCompact: { minHeight: 44, paddingVertical: 10 },
  secondary: { backgroundColor: colors.paper, borderColor: colors.border },
  buttonDisabled: { backgroundColor: colors.disabled, borderColor: colors.disabled },
  buttonText: { ...inter, fontSize: 16, lineHeight: 21, textAlign: 'center', fontWeight: '700', color: '#FFFFFF' },
  secondaryText: { ...inter, color: colors.primary },
  disabledText: { ...inter, color: colors.muted },
  pressed: { opacity: 0.82 },
  dimmed: { opacity: 0.55 },
  segments: { flexDirection: 'row', backgroundColor: colors.subtle, borderRadius: 14, padding: 4, gap: 4 },
  segment: { flex: 1, minHeight: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  segmentSelected: { backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.border },
  segmentText: { ...inter, color: colors.muted, fontSize: 13, lineHeight: 18, fontWeight: '700', textAlign: 'center' },
  segmentTextSelected: { ...inter, color: colors.ink },
  notice: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingTop: 2 },
  noticeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.warning },
  noticeText: { ...inter, color: colors.muted, fontSize: 12, lineHeight: 16, fontWeight: '600' },
  input: {
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.paper, borderRadius: 14,
    paddingHorizontal: 14, paddingVertical: 12, ...inter, fontSize: 16, color: colors.ink, minHeight: 48,
  },
  field: { gap: 6 },
  divider: { height: 1, backgroundColor: colors.border },
  link: { ...inter, color: colors.primary, fontSize: 15, lineHeight: 20, fontWeight: '700' },
  footer: {
    backgroundColor: colors.background, borderTopWidth: 1, borderColor: colors.border,
    paddingTop: 12, paddingHorizontal: 20, gap: 10,
  },
  banner: { borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12, gap: 4 },
  bannerTitle: { ...inter, fontSize: 14, lineHeight: 18, fontWeight: '700' },
  bannerBody: { ...inter, fontSize: 14, lineHeight: 20 },
  empty: {
    backgroundColor: colors.paper, borderRadius: 20, borderWidth: 1, borderColor: colors.border,
    padding: 20, gap: 6,
  },
});

export const moneyMark = { dataSet: { money: '1' } };

export function moneyStyle(extra?: TextStyle): TextStyle {
  return { fontFamily: monoFamily, fontVariant: ['tabular-nums'], fontWeight: '700', color: colors.ink, ...extra };
}

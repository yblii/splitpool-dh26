import { useEffect, useRef, useState, type PropsWithChildren, type ReactNode } from 'react';
import {
  AccessibilityInfo,
  Animated,
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
import { inter, interFace, monoFamily } from '../fonts';

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

export const typeScale = {
  pageTitle: { ...interFace(700), fontSize: 30, lineHeight: 36, color: colors.ink },
  subheading: { ...interFace(600), fontSize: 21, lineHeight: 26, color: colors.ink },
  section: { ...interFace(600), fontSize: 21, lineHeight: 26, color: colors.ink },
  itemName: { ...interFace(600), fontSize: 18, lineHeight: 23, color: colors.ink },
  itemPrice: { fontFamily: monoFamily, fontSize: 18, lineHeight: 23, fontWeight: '700' as const, color: colors.ink },
  person: { ...interFace(600), fontSize: 16, lineHeight: 21, color: colors.ink },
  percent: { ...interFace(600), fontSize: 17, lineHeight: 22, color: colors.ink },
  description: { ...interFace(400), fontSize: 14, lineHeight: 19, color: colors.muted },
  amount: { fontFamily: monoFamily, fontSize: 16, lineHeight: 21, fontWeight: '600' as const, color: colors.ink },
  status: { ...interFace(500), fontSize: 12, lineHeight: 16, color: colors.muted },
  button: { ...interFace(600), fontSize: 16, lineHeight: 21 },
  helper: { ...interFace(400), fontSize: 13, lineHeight: 18, color: colors.muted },
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

export function FadingNotice({ id, message, onDismiss }: { id: string; message: string; onDismiss: (id: string) => void }) {
  const reduceMotion = useReduceMotion();
  const [opacity] = useState(() => new Animated.Value(1));
  const dismiss = useRef(onDismiss);
  useEffect(() => { dismiss.current = onDismiss; });
  useEffect(() => {
    const timer = setTimeout(() => {
      if (reduceMotion) {
        dismiss.current(id);
        return;
      }
      Animated.timing(opacity, { toValue: 0, duration: 400, useNativeDriver: true }).start(() => dismiss.current(id));
    }, 3000);
    return () => clearTimeout(timer);
  }, [id, opacity, reduceMotion]);
  return <Animated.View style={{ opacity }}>
    <Pressable accessibilityRole="button" accessibilityLabel={`${message} Dismiss.`} onPress={() => dismiss.current(id)}>
      <ErrorBanner message={message} />
    </Pressable>
  </Animated.View>;
}

export function ReadyReviewNote() {
  return <View accessibilityRole="text" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
    <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: colors.success, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: '#FFFFFF', fontSize: 13, lineHeight: 16, fontWeight: '800' }}>✓</Text>
    </View>
    <Text style={[styles.text, { flex: 1, fontSize: 15, lineHeight: 20 }]}>All items are claimed. Ready for review.</Text>
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
  content: { paddingHorizontal: 16, paddingTop: 4, gap: 12, width: '100%', minWidth: 0 },
  header: {
    paddingHorizontal: 12, paddingBottom: 10, flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: colors.background,
  },
  headerSide: { width: 76, minHeight: 44, justifyContent: 'center' },
  headerRight: { alignItems: 'flex-end' },
  headerTitle: { ...interFace(600), flex: 1, textAlign: 'center', color: colors.ink, fontSize: 17, lineHeight: 22 },
  headerAction: { ...typeScale.button, color: colors.primary, paddingHorizontal: 8 },
  card: {
    backgroundColor: colors.paper, borderRadius: 16, padding: 12, gap: 8,
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border,
    ...Platform.select({
      web: { boxShadow: '0 8px 24px rgba(22, 50, 74, 0.06)' },
      default: {
        shadowColor: '#16324A', shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 2,
      },
    }),
  },
  title: typeScale.pageTitle,
  subheading: typeScale.subheading,
  subtitle: typeScale.description,
  heading: typeScale.section,
  text: { ...interFace(400), fontSize: 16, lineHeight: 22, color: colors.ink },
  small: typeScale.helper,
  label: typeScale.status,
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  button: {
    minHeight: 48, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 14,
    backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center',
  },
  buttonCompact: { minHeight: 40, paddingVertical: 8 },
  secondary: { backgroundColor: colors.paper, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  buttonDisabled: { backgroundColor: colors.disabled },
  buttonText: { ...typeScale.button, textAlign: 'center', color: '#FFFFFF' },
  secondaryText: { color: colors.primary },
  disabledText: { color: colors.muted },
  pressed: { opacity: 0.82 },
  dimmed: { opacity: 0.55 },
  segments: { flexDirection: 'row', backgroundColor: colors.subtle, borderRadius: 14, padding: 4, gap: 4 },
  segment: { flex: 1, minHeight: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  segmentSelected: { backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.border },
  segmentText: { ...typeScale.status, fontSize: 13, lineHeight: 18, textAlign: 'center' },
  segmentTextSelected: { ...interFace(600), color: colors.ink },
  notice: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingTop: 2 },
  noticeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.warning },
  noticeText: typeScale.helper,
  input: {
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.paper, borderRadius: 14,
    paddingHorizontal: 14, paddingVertical: 12, ...inter, fontSize: 16, color: colors.ink, minHeight: 48,
  },
  field: { gap: 6 },
  divider: { height: 1, backgroundColor: colors.border },
  link: { ...typeScale.button, color: colors.primary },
  footer: {
    backgroundColor: colors.background, borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border,
    paddingTop: 8, paddingHorizontal: 16, gap: 8,
  },
  banner: { borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, gap: 2 },
  bannerTitle: { ...interFace(600), fontSize: 14, lineHeight: 18 },
  bannerBody: typeScale.description,
  empty: {
    backgroundColor: colors.paper, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border,
    padding: 16, gap: 6,
  },
});

export const moneyMark = { dataSet: { money: '1' } };

export function moneyStyle(extra?: TextStyle): TextStyle {
  return { fontFamily: monoFamily, fontVariant: ['tabular-nums'], fontWeight: '700', color: colors.ink, ...extra };
}

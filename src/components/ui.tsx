import { useEffect, useState, type ReactNode } from 'react';
import {
  ActivityIndicator, FlatList, Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
  type StyleProp, type TextStyle, type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts, radius } from '@/lib/theme';

/* ---------------------------------------------------------------- text */
type W = 'regular' | 'medium' | 'semibold' | 'bold' | 'display';
export function T({ children, w = 'regular', size = 15, color = colors.ink, center, style, selectable, numberOfLines }: {
  children: ReactNode; w?: W; size?: number; color?: string; center?: boolean;
  style?: StyleProp<TextStyle>; selectable?: boolean; numberOfLines?: number;
}) {
  return (
    <Text selectable={selectable} numberOfLines={numberOfLines}
      style={[{ fontFamily: fonts[w], fontSize: size, color, lineHeight: Math.round(size * 1.65) }, center && { textAlign: 'center' }, style]}>
      {children}
    </Text>
  );
}
export const Muted = (p: { children: ReactNode; size?: number; center?: boolean; style?: StyleProp<TextStyle> }) =>
  <T size={p.size ?? 13} color={colors.muted} center={p.center} style={p.style}>{p.children}</T>;

/* ---------------------------------------------------------------- layout */
export function Screen({ children, header }: { children: ReactNode; header?: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: colors.ground }}>
      <View style={{ backgroundColor: colors.brand, paddingTop: insets.top }}>
        <View style={s.column}>{header}</View>
      </View>
      <ScrollView style={{ backgroundColor: colors.ground }} contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
        <View style={[s.column, s.body, { paddingBottom: insets.bottom + 48 }]}>{children}</View>
      </ScrollView>
      <ToastHost />
    </View>
  );
}

export function Row({ children, style, gap = 10 }: { children: ReactNode; style?: StyleProp<ViewStyle>; gap?: number }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap }, style]}>{children}</View>;
}

export function Card({ children, onPress, style }: { children: ReactNode; onPress?: () => void; style?: StyleProp<ViewStyle> }) {
  if (onPress) {
    return (
      <Pressable onPress={onPress} accessibilityRole="button"
        style={({ pressed, hovered }: any) => [s.card, (pressed || hovered) && { borderColor: colors.muted }, style]}>
        {children}
      </Pressable>
    );
  }
  return <View style={[s.card, style]}>{children}</View>;
}

export function BackBar({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <Row>
      <Pressable onPress={onBack} accessibilityRole="button" accessibilityLabel="رجوع" style={s.back}>
        <T size={18} w="bold">→</T>
      </Pressable>
      <T w="bold" size={18} style={{ flex: 1 }}>{title}</T>
    </Row>
  );
}

/* ---------------------------------------------------------------- buttons */
type Kind = 'primary' | 'secondary' | 'dark' | 'danger' | 'small';
export function Btn({ title, onPress, kind = 'primary', disabled, loading, style }: {
  title: string; onPress: () => void; kind?: Kind; disabled?: boolean; loading?: boolean; style?: StyleProp<ViewStyle>;
}) {
  const k = btnStyles[kind];
  return (
    <Pressable onPress={onPress} disabled={disabled || loading} accessibilityRole="button"
      style={({ pressed }) => [k.box, (disabled || loading) && { opacity: 0.5 }, pressed && { opacity: 0.85 }, style]}>
      {loading ? <ActivityIndicator color={k.color} /> : <T w={kind === 'primary' ? 'bold' : 'semibold'} size={k.size} color={k.color} center>{title}</T>}
    </Pressable>
  );
}

/* ---------------------------------------------------------------- inputs */
export function Field({ label, value, onChangeText, placeholder, keyboardType, ltr, multiline, secure, hint, nativeID }: {
  label: string; value: string; onChangeText: (t: string) => void; placeholder?: string;
  keyboardType?: 'default' | 'phone-pad' | 'number-pad' | 'email-address'; ltr?: boolean; multiline?: boolean; secure?: boolean; hint?: string; nativeID?: string;
}) {
  return (
    <View style={{ gap: 6 }}>
      <T w="semibold" size={13}>{label}</T>
      <TextInput
        nativeID={nativeID}
        value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor="#8A96A3"
        keyboardType={keyboardType} secureTextEntry={secure} multiline={multiline}
        autoCapitalize="none" autoCorrect={!ltr}
        style={[s.input, multiline && { minHeight: 72, textAlignVertical: 'top' }, ltr ? { writingDirection: 'ltr', textAlign: 'right' } : null]}
      />
      {hint ? <Muted size={12}>{hint}</Muted> : null}
    </View>
  );
}

export function Chips<V extends string | number>({ options, selected, onPick }: {
  options: { v: V; label: string }[]; selected: V[]; onPick: (v: V) => void;
}) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
      {options.map((o) => {
        const on = selected.includes(o.v);
        return (
          <Pressable key={String(o.v)} onPress={() => onPick(o.v)} accessibilityRole="button" accessibilityState={{ selected: on }}
            style={[s.chip, on && { backgroundColor: colors.brand, borderColor: colors.brand }]}>
            <T size={13} w="medium" color={on ? colors.brandInk : colors.ink}>{o.label}</T>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Seg<V extends string | number>({ options, value, onPick }: { options: { v: V; label: string }[]; value: V; onPick: (v: V) => void }) {
  return (
    <View style={s.seg}>
      {options.map((o) => {
        const on = o.v === value;
        return (
          <Pressable key={String(o.v)} onPress={() => onPick(o.v)} accessibilityRole="button" accessibilityState={{ selected: on }}
            style={[s.segBtn, on && s.segOn]}>
            <T size={13} w="semibold" color={on ? colors.ink : colors.muted} center>{o.label}</T>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Labeled({ label, children }: { label: string; children: ReactNode }) {
  return <View style={{ gap: 6 }}><T w="semibold" size={13}>{label}</T>{children}</View>;
}

/** A tap-to-open list picker that works the same on web and phones. */
export function Select<V extends string | number>({ label, value, options, onPick }: {
  label: string; value: V; options: { v: V; label: string }[]; onPick: (v: V) => void;
}) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.v === value);
  return (
    <View style={{ gap: 6, flex: 1 }}>
      <T w="semibold" size={13}>{label}</T>
      <Pressable onPress={() => setOpen(true)} accessibilityRole="button" style={[s.input, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]}>
        <T>{current?.label ?? '—'}</T><T color={colors.muted}>▾</T>
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={s.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={s.sheet} onPress={() => {}}>
            <T w="bold" size={16} style={{ marginBottom: 8 }}>{label}</T>
            <FlatList data={options} keyExtractor={(o) => String(o.v)} style={{ maxHeight: 420 }}
              renderItem={({ item }) => (
                <Pressable onPress={() => { onPick(item.v); setOpen(false); }} style={[s.option, item.v === value && { backgroundColor: colors.soft }]}>
                  <T w={item.v === value ? 'semibold' : 'regular'}>{item.label}</T>
                </Pressable>
              )} />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

/* ---------------------------------------------------------------- bits */
type Tone = 'new' | 'good' | 'wait' | 'plain';
export function Pill({ label, tone = 'plain' }: { label: string; tone?: Tone }) {
  const bg = { new: colors.accent, good: colors.goodSoft, wait: colors.accentSoft, plain: colors.soft }[tone];
  const fg = { new: colors.accentInk, good: colors.good, wait: colors.ink, plain: colors.ink }[tone];
  return <View style={{ backgroundColor: bg, borderRadius: radius.pill, paddingHorizontal: 9, paddingVertical: 2 }}><T size={11.5} w="semibold" color={fg}>{label}</T></View>;
}

export const Notice = ({ children }: { children: ReactNode }) => (
  <View style={{ backgroundColor: colors.accentSoft, borderRadius: radius.md, padding: 12 }}>{typeof children === 'string' ? <T size={13}>{children}</T> : children}</View>
);

export const Empty = ({ text }: { text: string }) => (
  <View style={{ borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.line, borderRadius: radius.lg, padding: 28 }}><Muted center size={14}>{text}</Muted></View>
);

export const ErrorText = ({ text }: { text?: string | null }) => (text ? <T size={13} w="medium" color={colors.bad}>{text}</T> : null);

export function Stat({ value, label }: { value: string; label: string }) {
  return <View style={[s.card, { flex: 1, padding: 10, gap: 2 }]}><T w="bold" size={19}>{value}</T><Muted size={11.5}>{label}</Muted></View>;
}

export function Photo({ uri, size = 72 }: { uri?: string | null; size?: number }) {
  const [big, setBig] = useState(false);
  if (!uri) return <View style={[s.photo, { width: size, height: size }]}><T color={colors.muted} size={size / 3}>⚙︎</T></View>;
  return (
    <>
      <Pressable onPress={() => setBig(true)} accessibilityRole="imagebutton" accessibilityLabel="كبّر الصورة">
        <Image source={{ uri }} style={[s.photo, { width: size, height: size }]} accessibilityLabel="صورة القطعة" />
      </Pressable>
      <Modal visible={big} transparent animationType="fade" onRequestClose={() => setBig(false)}>
        <Pressable style={[s.backdrop, { backgroundColor: 'rgba(0,0,0,.85)' }]} onPress={() => setBig(false)}>
          <Image source={{ uri }} style={{ width: '92%', height: '80%' }} resizeMode="contain" accessibilityLabel="صورة القطعة" />
        </Pressable>
      </Modal>
    </>
  );
}

export function PhotoPicker({ uri, onPick, hint }: { uri: string | null; onPick: () => void; hint: string }) {
  return (
    <Pressable onPress={onPick} accessibilityRole="button" style={s.upload}>
      {uri ? <Image source={{ uri }} style={[s.photo, { width: 52, height: 52 }]} /> : <T size={24} color={colors.muted}>📷</T>}
      <Muted style={{ flex: 1 }}>{uri ? 'الصورة اتضافت. اضغط تاني لو عايز تغيّرها.' : hint}</Muted>
    </Pressable>
  );
}

export function Loading() {
  return <View style={{ padding: 60, alignItems: 'center', gap: 12 }}><ActivityIndicator color={colors.accent} /><Muted>بنحمّل…</Muted></View>;
}

export function Steps({ items }: { items: string[] }) {
  return (
    <View style={{ gap: 10 }}>
      {items.map((t, i) => (
        <Row key={i} style={{ alignItems: 'flex-start' }}>
          <View style={s.stepNum}><T w="bold" size={12}>{['١', '٢', '٣', '٤', '٥'][i]}</T></View>
          <T size={14} style={{ flex: 1 }}>{t}</T>
        </Row>
      ))}
    </View>
  );
}

export function Plate({ top, bottom }: { top: string; bottom: string }) {
  return (
    <View style={s.plate} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={s.plateTop}><T size={9} w="semibold" color="#fff">مصر</T><T size={9} w="semibold" color="#fff">EGYPT</T></View>
      <View style={{ flexDirection: 'row' }}>
        <View style={{ flex: 1, alignItems: 'center' }}><T w="bold" size={14} color="#111">{top}</T></View>
        <View style={{ flex: 1, alignItems: 'center', borderStartWidth: 1.5, borderColor: '#111' }}><T w="bold" size={14} color="#111">{bottom}</T></View>
      </View>
    </View>
  );
}

export function Lines({ rows, total }: { rows: [string, string][]; total?: [string, string] }) {
  return (
    <View style={{ gap: 8 }}>
      {rows.map(([a, b], i) => <Row key={i} style={{ justifyContent: 'space-between' }}><T size={14}>{a}</T><T size={14}>{b}</T></Row>)}
      {total ? <Row style={{ justifyContent: 'space-between', borderTopWidth: 1, borderColor: colors.line, paddingTop: 8 }}><T w="bold">{total[0]}</T><T w="bold">{total[1]}</T></Row> : null}
    </View>
  );
}

/* ---------------------------------------------------------------- toast */
let pushToast: ((m: string) => void) | null = null;
export const toast = (m: string) => pushToast?.(m);

function ToastHost() {
  const [msg, setMsg] = useState('');
  const insets = useSafeAreaInsets();
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    pushToast = (m) => { setMsg(m); clearTimeout(t); t = setTimeout(() => setMsg(''), 3500); };
    return () => { pushToast = null; clearTimeout(t); };
  }, []);
  if (!msg) return null;
  return (
    <View pointerEvents="none" style={[s.toast, { bottom: insets.bottom + 16 }]} accessibilityLiveRegion="polite">
      <T color={colors.surface} w="medium" size={14}>{msg}</T>
    </View>
  );
}

/* ---------------------------------------------------------------- styles */
const btnStyles: Record<Kind, { box: ViewStyle; color: string; size: number }> = {
  primary: { box: { backgroundColor: colors.accent, borderRadius: 14, paddingVertical: 14, alignItems: 'center' }, color: colors.accentInk, size: 17 },
  secondary: { box: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, paddingVertical: 11, alignItems: 'center' }, color: colors.ink, size: 14 },
  dark: { box: { backgroundColor: colors.brand, borderRadius: radius.md, paddingVertical: 11, alignItems: 'center' }, color: colors.brandInk, size: 14 },
  danger: { box: { borderWidth: 1, borderColor: colors.bad, borderRadius: radius.md, paddingVertical: 10, alignItems: 'center' }, color: colors.bad, size: 13 },
  small: { box: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, borderRadius: radius.sm, paddingVertical: 5, paddingHorizontal: 12, alignSelf: 'flex-start' }, color: colors.ink, size: 12.5 },
};

const s = StyleSheet.create({
  column: { width: '100%', maxWidth: 520, alignSelf: 'center', paddingHorizontal: 16 },
  body: { flexGrow: 1, paddingTop: 16, gap: 16, backgroundColor: colors.surface },
  card: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, borderRadius: radius.lg, padding: 14, gap: 10 },
  back: { width: 36, height: 36, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
  input: { fontFamily: fonts.medium, fontSize: 15, color: colors.ink, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 11 },
  chip: { borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card, borderRadius: radius.pill, paddingHorizontal: 11, paddingVertical: 5 },
  seg: { flexDirection: 'row', backgroundColor: colors.soft, borderRadius: radius.md, padding: 3, gap: 3 },
  segBtn: { flex: 1, borderRadius: 9, paddingVertical: 8 },
  segOn: { backgroundColor: colors.card, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 3, shadowOffset: { width: 0, height: 1 } },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,.4)', alignItems: 'center', justifyContent: 'center', padding: 16 },
  sheet: { backgroundColor: colors.card, borderRadius: radius.lg, padding: 16, width: '100%', maxWidth: 420 },
  option: { paddingVertical: 10, paddingHorizontal: 10, borderRadius: radius.sm },
  photo: { borderRadius: radius.md, backgroundColor: colors.soft, alignItems: 'center', justifyContent: 'center' },
  upload: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.line, borderRadius: 14, padding: 14, backgroundColor: colors.card },
  stepNum: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.soft, alignItems: 'center', justifyContent: 'center' },
  plate: { width: 112, borderWidth: 2, borderColor: colors.ink, borderRadius: 6, overflow: 'hidden', backgroundColor: '#fff' },
  plateTop: { backgroundColor: colors.plate, flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 6 },
  toast: { position: 'absolute', left: 16, right: 16, alignSelf: 'center', maxWidth: 488, backgroundColor: colors.ink, borderRadius: 14, padding: 14 },
});

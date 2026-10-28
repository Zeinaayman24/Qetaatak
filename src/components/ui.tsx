import { useEffect, useState, type ReactNode } from 'react';
import {
  ActivityIndicator, FlatList, Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
  type StyleProp, type TextStyle, type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { colors, fonts, radius } from '@/lib/theme';

/* ---------------------------------------------------------------- text */
type W = 'regular' | 'medium' | 'semibold' | 'bold' | 'display';
export function T({ children, w = 'regular', size = 15, color = colors.ink, center, style, selectable, numberOfLines }: {
  children: ReactNode; w?: W; size?: number; color?: string; center?: boolean;
  style?: StyleProp<TextStyle>; selectable?: boolean; numberOfLines?: number;
}) {
  return (
    <Text selectable={selectable} numberOfLines={numberOfLines}
      style={[{ fontFamily: fonts[w], fontSize: size, color, lineHeight: Math.round(size * 1.6), writingDirection: 'rtl' }, center && { textAlign: 'center' }, style]}>
      {children}
    </Text>
  );
}
export const Muted = (p: { children: ReactNode; size?: number; center?: boolean; style?: StyleProp<TextStyle>; numberOfLines?: number }) =>
  <T size={p.size ?? 13} color={colors.muted} center={p.center} style={p.style} numberOfLines={p.numberOfLines}>{p.children}</T>;

export const Title = ({ children, sub }: { children: ReactNode; sub?: ReactNode }) => (
  <View style={{ gap: 2 }}>
    <T w="bold" size={26} style={{ lineHeight: 36 }}>{children}</T>
    {sub ? <Muted size={14}>{sub}</Muted> : null}
  </View>
);

/* ---------------------------------------------------------------- layout */
/** A screen: optional header, scrolling content, and either a pinned action bar (`footer`) or the bottom tab bar (`nav`). */
export function Screen({ children, header, footer, nav }: { children: ReactNode; header?: ReactNode; footer?: ReactNode; nav?: ReactNode }) {
  const insets = useSafeAreaInsets();
  const bottomBar = footer ?? nav;
  return (
    <View style={{ flex: 1, backgroundColor: colors.ground }}>
      <View style={[{ paddingTop: insets.top, backgroundColor: colors.ground }, header ? { borderBottomWidth: 1, borderColor: colors.line } : null]}>
        {header ? <View style={s.column}>{header}</View> : null}
      </View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
        <View style={[s.column, s.body, { paddingBottom: bottomBar ? 28 : insets.bottom + 40 }]}>{children}</View>
      </ScrollView>
      {footer ? (
        <View style={{ borderTopWidth: 1, borderColor: colors.line, backgroundColor: colors.ground, paddingBottom: insets.bottom + 12, paddingTop: 12 }}>
          <View style={[s.column, { gap: 8 }]}>{footer}</View>
        </View>
      ) : nav ? (
        <View style={{ borderTopWidth: 1, borderColor: colors.line, backgroundColor: colors.ground, paddingBottom: insets.bottom }}>
          <View style={s.column}>{nav}</View>
        </View>
      ) : null}
      <ToastHost bottom={bottomBar ? 96 : 16} />
    </View>
  );
}

type IconSet = 'ion' | 'mci';
/** Icons: Ionicons for interface, MaterialCommunityIcons for car parts. */
export function Icon({ name, size = 22, color = colors.ink, set = 'ion' }: { name: string; size?: number; color?: string; set?: IconSet }) {
  const C: any = set === 'mci' ? MaterialCommunityIcons : Ionicons;
  return <C name={name} size={size} color={color} />;
}

export function Row({ children, style, gap = 10 }: { children: ReactNode; style?: StyleProp<ViewStyle>; gap?: number }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap }, style]}>{children}</View>;
}

/** A filled block with no border. Use for summaries; use ListRow for lists. */
export function Card({ children, onPress, style }: { children: ReactNode; onPress?: () => void; style?: StyleProp<ViewStyle> }) {
  if (onPress) {
    return (
      <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [s.card, pressed && { opacity: 0.85 }, style]}>
        {children}
      </Pressable>
    );
  }
  return <View style={[s.card, style]}>{children}</View>;
}

/** Section heading with an optional right-hand note. */
export function Section({ title, note, children }: { title: string; note?: string; children?: ReactNode }) {
  return (
    <View style={{ gap: 4 }}>
      <Row style={{ justifyContent: 'space-between', marginTop: 4 }}>
        <T w="bold" size={17}>{title}</T>
        {note ? <Muted>{note}</Muted> : null}
      </Row>
      {children}
    </View>
  );
}

/** One line in a list: optional leading image, title, subtitle, trailing element, hairline under it. */
export function ListRow({ title, subtitle, meta, leading, trailing, onPress, last }: {
  title: ReactNode; subtitle?: ReactNode; meta?: ReactNode; leading?: ReactNode; trailing?: ReactNode; onPress?: () => void; last?: boolean;
}) {
  const inner = (
    <View style={[{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 }, !last && { borderBottomWidth: 1, borderColor: colors.line }]}>
      {leading}
      <View style={{ flex: 1, minWidth: 0 }}>
        {typeof title === 'string' ? <T w="semibold" numberOfLines={1}>{title}</T> : title}
        {subtitle ? (typeof subtitle === 'string' ? <Muted numberOfLines={1}>{subtitle}</Muted> : subtitle) : null}
        {meta ? (typeof meta === 'string' ? <Muted size={12} style={{ color: colors.faint }}>{meta}</Muted> : meta) : null}
      </View>
      {trailing}
      {onPress ? <Icon name="chevron-back" size={16} color={colors.faint} /> : null}
    </View>
  );
  if (!onPress) return inner;
  return <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => pressed && { opacity: 0.6 }}>{inner}</Pressable>;
}

export function BackBar({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <Row style={{ marginBottom: 4 }}>
      <Pressable onPress={onBack} accessibilityRole="button" accessibilityLabel="رجوع" hitSlop={10} style={s.back}>
        <Icon name="chevron-forward" size={22} />
      </Pressable>
      <T w="bold" size={22} style={{ flex: 1 }} numberOfLines={1}>{title}</T>
    </Row>
  );
}

/* ---------------------------------------------------------------- buttons */
type Kind = 'primary' | 'secondary' | 'dark' | 'danger' | 'small' | 'link';
export function Btn({ title, onPress, kind = 'primary', disabled, loading, style }: {
  title: string; onPress: () => void; kind?: Kind; disabled?: boolean; loading?: boolean; style?: StyleProp<ViewStyle>;
}) {
  const k = btnStyles[kind];
  return (
    <Pressable onPress={onPress} disabled={disabled || loading} accessibilityRole="button"
      style={({ pressed }) => [k.box, (disabled || loading) && { opacity: 0.4 }, pressed && { opacity: 0.8 }, style]}>
      {loading ? <ActivityIndicator color={k.color} /> : <T w="semibold" size={k.size} color={k.color} center>{title}</T>}
    </Pressable>
  );
}

/* ---------------------------------------------------------------- inputs */
export function Field({ label, value, onChangeText, placeholder, keyboardType, ltr, multiline, secure, hint, big }: {
  label?: string; value: string; onChangeText: (t: string) => void; placeholder?: string;
  keyboardType?: 'default' | 'phone-pad' | 'number-pad' | 'email-address'; ltr?: boolean; multiline?: boolean; secure?: boolean; hint?: string; big?: boolean;
}) {
  const [focus, setFocus] = useState(false);
  return (
    <View style={{ gap: 6 }}>
      {label ? <T w="medium" size={13} color={colors.muted}>{label}</T> : null}
      <TextInput
        value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={colors.faint}
        keyboardType={keyboardType} secureTextEntry={secure} multiline={multiline}
        autoCapitalize="none" autoCorrect={!ltr} onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
        style={[s.input, big && { fontSize: 22, fontFamily: fonts.bold, paddingVertical: 14 }, focus && { borderColor: colors.ink, backgroundColor: colors.ground },
          multiline && { minHeight: 84, textAlignVertical: 'top' }, ltr ? { writingDirection: 'ltr', textAlign: 'right' } : { textAlign: 'right' },
          { outlineStyle: 'none' } as any]}
      />
      {hint ? <Muted size={12}>{hint}</Muted> : null}
    </View>
  );
}

export function Chips<V extends string | number>({ options, selected, onPick }: {
  options: { v: V; label: string }[]; selected: V[]; onPick: (v: V) => void;
}) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {options.map((o) => {
        const on = selected.includes(o.v);
        return (
          <Pressable key={String(o.v)} onPress={() => onPick(o.v)} accessibilityRole="button" accessibilityState={{ selected: on }}
            style={[s.chip, on && { backgroundColor: colors.ink, borderColor: colors.ink }]}>
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
            <T size={13.5} w={on ? 'semibold' : 'medium'} color={on ? colors.ink : colors.muted} center>{o.label}</T>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Labeled({ label, children }: { label: string; children: ReactNode }) {
  return <View style={{ gap: 8 }}><T w="medium" size={13} color={colors.muted}>{label}</T>{children}</View>;
}

/** A tap-to-open list picker that works the same on web and phones. */
export function Select<V extends string | number>({ label, value, options, onPick }: {
  label: string; value: V; options: { v: V; label: string }[]; onPick: (v: V) => void;
}) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.v === value);
  return (
    <View style={{ gap: 6, flex: 1 }}>
      <T w="medium" size={13} color={colors.muted}>{label}</T>
      <Pressable onPress={() => setOpen(true)} accessibilityRole="button" style={[s.input, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]}>
        <T w="medium">{current?.label ?? '—'}</T><T color={colors.faint} size={12}>▼</T>
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={s.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={s.sheet} onPress={() => {}}>
            <T w="bold" size={18} style={{ marginBottom: 8 }}>{label}</T>
            <FlatList data={options} keyExtractor={(o) => String(o.v)} style={{ maxHeight: 440 }}
              renderItem={({ item }) => (
                <Pressable onPress={() => { onPick(item.v); setOpen(false); }}
                  style={[s.option, item.v === value && { backgroundColor: colors.card }]}>
                  <T w={item.v === value ? 'semibold' : 'regular'}>{item.label}</T>
                  {item.v === value ? <T w="bold">✓</T> : null}
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
  const bg = { new: colors.ink, good: colors.goodSoft, wait: colors.accentSoft, plain: colors.card }[tone];
  const fg = { new: colors.brandInk, good: colors.good, wait: '#8A5300', plain: colors.muted }[tone];
  return <View style={{ backgroundColor: bg, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 2, alignSelf: 'flex-start' }}><T size={12} w="semibold" color={fg}>{label}</T></View>;
}

export const Notice = ({ children }: { children: ReactNode }) => (
  <View style={{ backgroundColor: colors.accentSoft, borderRadius: radius.md, padding: 14, gap: 2 }}>{typeof children === 'string' ? <T size={14}>{children}</T> : children}</View>
);

export const Empty = ({ text, icon }: { text: string; icon?: string }) => (
  <View style={{ alignItems: 'center', paddingVertical: 36, gap: 8 }}>
    {icon ? <T size={34}>{icon}</T> : null}
    <Muted center size={14}>{text}</Muted>
  </View>
);

export const ErrorText = ({ text }: { text?: string | null }) => (text ? <T size={13} w="medium" color={colors.bad}>{text}</T> : null);

/** A row of numbers separated by thin lines. */
export function Stats({ items }: { items: [string, string][] }) {
  return (
    <View style={{ flexDirection: 'row', backgroundColor: colors.card, borderRadius: radius.lg, paddingVertical: 14 }}>
      {items.map(([v, l], i) => (
        <View key={i} style={[{ flex: 1, paddingHorizontal: 12, gap: 2 }, i > 0 && { borderStartWidth: 1, borderColor: colors.line }]}>
          <T w="bold" size={20}>{v}</T>
          <Muted size={12}>{l}</Muted>
        </View>
      ))}
    </View>
  );
}

export function Photo({ uri, size = 72 }: { uri?: string | null; size?: number }) {
  const [big, setBig] = useState(false);
  if (!uri) return <View style={[s.photo, { width: size, height: size }]}><Icon set="mci" name="car-wrench" size={Math.round(size / 2.4)} color={colors.faint} /></View>;
  return (
    <>
      <Pressable onPress={() => setBig(true)} accessibilityRole="imagebutton" accessibilityLabel="كبّر الصورة">
        <Image source={{ uri }} style={[s.photo, { width: size, height: size }]} accessibilityLabel="صورة القطعة" />
      </Pressable>
      <Modal visible={big} transparent animationType="fade" onRequestClose={() => setBig(false)}>
        <Pressable style={[s.backdrop, { backgroundColor: 'rgba(0,0,0,.9)' }]} onPress={() => setBig(false)}>
          <Image source={{ uri }} style={{ width: '94%', height: '80%' }} resizeMode="contain" accessibilityLabel="صورة القطعة" />
        </Pressable>
      </Modal>
    </>
  );
}

export function PhotoPicker({ uri, onPick, hint }: { uri: string | null; onPick: () => void; hint: string }) {
  return (
    <Pressable onPress={onPick} accessibilityRole="button" style={s.upload}>
      {uri ? <Image source={{ uri }} style={[s.photo, { width: 56, height: 56 }]} /> : (
        <View style={[s.photo, { width: 56, height: 56, backgroundColor: colors.ground }]}><Icon name="camera-outline" size={24} /></View>
      )}
      <View style={{ flex: 1 }}>
        <T w="semibold" size={14}>{uri ? 'الصورة اتضافت' : 'أضف صورة'}</T>
        <Muted size={12}>{uri ? 'اضغط لو عايز تغيّرها' : hint}</Muted>
      </View>
    </Pressable>
  );
}

export function Loading() {
  return <View style={{ padding: 60, alignItems: 'center' }}><ActivityIndicator color={colors.ink} /></View>;
}

export function Steps({ items }: { items: string[] }) {
  return (
    <View style={{ gap: 14 }}>
      {items.map((t, i) => (
        <Row key={i} style={{ alignItems: 'flex-start' }} gap={12}>
          <View style={s.stepNum}><T w="bold" size={13} color={colors.brandInk}>{['١', '٢', '٣', '٤', '٥'][i]}</T></View>
          <T size={14.5} style={{ flex: 1 }}>{t}</T>
        </Row>
      ))}
    </View>
  );
}

export function Plate({ top, bottom }: { top: string; bottom: string }) {
  return (
    <View style={s.plate} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={s.plateTop}><T size={8} w="semibold" color="#fff">مصر</T><T size={8} w="semibold" color="#fff">EGYPT</T></View>
      <View style={{ flexDirection: 'row' }}>
        <View style={{ flex: 1, alignItems: 'center' }}><T w="bold" size={13} color="#111">{top}</T></View>
        <View style={{ flex: 1, alignItems: 'center', borderStartWidth: 1.5, borderColor: '#111' }}><T w="bold" size={13} color="#111">{bottom}</T></View>
      </View>
    </View>
  );
}

export function Lines({ rows, total }: { rows: [string, string][]; total?: [string, string] }) {
  return (
    <View style={{ gap: 10 }}>
      {rows.map(([a, b], i) => <Row key={i} style={{ justifyContent: 'space-between' }}><Muted size={14}>{a}</Muted><T size={14}>{b}</T></Row>)}
      {total ? <Row style={{ justifyContent: 'space-between', borderTopWidth: 1, borderColor: colors.line, paddingTop: 10 }}><T w="bold" size={16}>{total[0]}</T><T w="bold" size={16}>{total[1]}</T></Row> : null}
    </View>
  );
}

/** Text the person can select and copy, shown left-to-right (phone numbers). */
export function CopyBox({ text }: { text: string }) {
  return (
    <View style={{ backgroundColor: colors.ground, borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 10 }}>
      <T selectable w="semibold" size={16} style={{ writingDirection: 'ltr', textAlign: 'right' }}>{text}</T>
    </View>
  );
}

/* ---------------------------------------------------------------- toast */
let pushToast: ((m: string) => void) | null = null;
export const toast = (m: string) => pushToast?.(m);

function ToastHost({ bottom }: { bottom: number }) {
  const [msg, setMsg] = useState('');
  const insets = useSafeAreaInsets();
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    pushToast = (m) => { setMsg(m); clearTimeout(t); t = setTimeout(() => setMsg(''), 3500); };
    return () => { pushToast = null; clearTimeout(t); };
  }, []);
  if (!msg) return null;
  return (
    <View pointerEvents="none" style={[s.toast, { bottom: insets.bottom + bottom }]} accessibilityLiveRegion="polite">
      <T color={colors.brandInk} w="medium" size={14} center>{msg}</T>
    </View>
  );
}

/* ---------------------------------------------------------------- styles */
const btnStyles: Record<Kind, { box: ViewStyle; color: string; size: number }> = {
  primary: { box: { backgroundColor: colors.ink, borderRadius: radius.md, minHeight: 54, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 16 }, color: colors.brandInk, size: 16 },
  dark: { box: { backgroundColor: colors.ink, borderRadius: radius.md, minHeight: 46, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 16 }, color: colors.brandInk, size: 14.5 },
  secondary: { box: { backgroundColor: colors.card, borderRadius: radius.md, minHeight: 50, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 16 }, color: colors.ink, size: 15 },
  danger: { box: { backgroundColor: '#FCEDED', borderRadius: radius.md, minHeight: 48, justifyContent: 'center', alignItems: 'center' }, color: colors.bad, size: 14 },
  small: { box: { backgroundColor: colors.ink, borderRadius: radius.pill, paddingVertical: 7, paddingHorizontal: 16, alignSelf: 'flex-start' }, color: colors.brandInk, size: 13 },
  link: { box: { paddingVertical: 4, alignSelf: 'flex-start' }, color: colors.ink, size: 13.5 },
};

const s = StyleSheet.create({
  column: { width: '100%', maxWidth: 520, alignSelf: 'center', paddingHorizontal: 20 },
  body: { flexGrow: 1, paddingTop: 20, gap: 20, backgroundColor: colors.ground },
  card: { backgroundColor: colors.card, borderRadius: radius.lg, padding: 16, gap: 12 },
  back: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
  input: { fontFamily: fonts.medium, fontSize: 16, color: colors.ink, backgroundColor: colors.card, borderWidth: 1.5, borderColor: 'transparent', borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 13 },
  chip: { borderWidth: 1, borderColor: colors.line, backgroundColor: colors.ground, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 7 },
  seg: { flexDirection: 'row', backgroundColor: colors.card, borderRadius: radius.md, padding: 4, gap: 4 },
  segBtn: { flex: 1, borderRadius: 10, paddingVertical: 9 },
  segOn: { backgroundColor: colors.ground, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 6, shadowOffset: { width: 0, height: 1 } },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,.35)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  sheet: { backgroundColor: colors.ground, borderRadius: radius.lg, padding: 20, width: '100%', maxWidth: 420 },
  option: { paddingVertical: 12, paddingHorizontal: 12, borderRadius: radius.sm, flexDirection: 'row', justifyContent: 'space-between' },
  photo: { borderRadius: 12, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
  upload: { flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: radius.md, padding: 12, backgroundColor: colors.card },
  stepNum: { width: 26, height: 26, borderRadius: 13, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  plate: { width: 100, borderWidth: 2, borderColor: '#111', borderRadius: 6, overflow: 'hidden', backgroundColor: '#fff' },
  plateTop: { backgroundColor: colors.plate, flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 6 },
  toast: { position: 'absolute', left: 20, right: 20, alignSelf: 'center', maxWidth: 480, backgroundColor: colors.ink, borderRadius: radius.md, paddingVertical: 12, paddingHorizontal: 16 },
});

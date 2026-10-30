import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator, Animated, Easing, FlatList, Image, Modal, PanResponder, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
  type StyleProp, type TextStyle, type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { FILLED, LINE } from './icons';
import { colors, fontWeights, fonts, lift, liftStrong, radius } from '@/lib/theme';

/* ---------------------------------------------------------------- text */
type W = 'regular' | 'medium' | 'semibold' | 'bold' | 'display';
export function T({ children, w = 'regular', size = 15, color = colors.ink, center, style, selectable, numberOfLines }: {
  children: ReactNode; w?: W; size?: number; color?: string; center?: boolean;
  style?: StyleProp<TextStyle>; selectable?: boolean; numberOfLines?: number;
}) {
  return (
    <Text selectable={selectable} numberOfLines={numberOfLines}
      style={[{ fontFamily: fonts[w], fontWeight: fontWeights[w], fontSize: size, color, lineHeight: Math.round(size * 1.55), writingDirection: 'rtl' }, center && { textAlign: 'center' }, style]}>
      {children}
    </Text>
  );
}
export const Muted = (p: { children: ReactNode; size?: number; center?: boolean; style?: StyleProp<TextStyle>; numberOfLines?: number }) =>
  <T size={p.size ?? 13} color={colors.muted} center={p.center} style={p.style} numberOfLines={p.numberOfLines}>{p.children}</T>;

export const Title = ({ children, sub }: { children: ReactNode; sub?: ReactNode }) => (
  <View style={{ gap: 4 }}>
    <T w="bold" size={26} style={{ lineHeight: 36, letterSpacing: -0.3 }}>{children}</T>
    {sub ? <Muted size={14}>{sub}</Muted> : null}
  </View>
);

/* ---------------------------------------------------------------- touch */
const tick = () => { if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {}); };

/** A pressable that gives back: it sinks slightly under the finger and ticks on phones. */
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
export function Press({ children, onPress, style, disabled, label, role = 'button', hitSlop, selected }: {
  children: ReactNode; onPress?: () => void; style?: StyleProp<ViewStyle>; disabled?: boolean; label?: string;
  role?: 'button' | 'link' | 'tab' | 'imagebutton'; hitSlop?: number; selected?: boolean;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const to = (v: number) => Animated.spring(scale, { toValue: v, useNativeDriver: Platform.OS !== 'web', speed: 40, bounciness: 6 }).start();
  return (
    <AnimatedPressable onPress={() => { tick(); onPress?.(); }} disabled={disabled || !onPress} accessibilityRole={role} accessibilityLabel={label}
      accessibilityState={selected === undefined ? undefined : { selected }} hitSlop={hitSlop}
      onPressIn={() => to(0.965)} onPressOut={() => to(1)}
      style={[style as any, { transform: [{ scale }] }, disabled && { opacity: 0.45 }]}>
      {children}
    </AnimatedPressable>
  );
}

/* ---------------------------------------------------------------- layout */
/**
 * A screen: optional full-width `top` (heroes), scrolling content in a centred column,
 * and either a pinned action bar (`footer`) or the floating tab bar (`nav`).
 */
export function Screen({ children, header, footer, nav, top }: { children: ReactNode; header?: ReactNode; footer?: ReactNode; nav?: ReactNode; top?: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: colors.ground }}>
      {!top ? (
        <View style={{ paddingTop: insets.top, backgroundColor: colors.ground }}>
          {header ? <View style={s.column}>{header}</View> : null}
        </View>
      ) : null}
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {top ? <View style={{ paddingTop: insets.top }}>{top}</View> : null}
        <View style={[s.column, s.body, { paddingBottom: nav ? 120 : footer ? 28 : insets.bottom + 40 }]}>{children}</View>
      </ScrollView>
      {footer ? (
        <View style={{ backgroundColor: colors.surface, paddingBottom: insets.bottom + 12, paddingTop: 12, borderTopWidth: 1, borderColor: colors.line }}>
          <View style={[s.column, { gap: 8 }]}>{footer}</View>
        </View>
      ) : null}
      {nav ? (
        <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, bottom: insets.bottom + 12 }}>
          <View style={[s.column, { paddingHorizontal: 16 }]}>{nav}</View>
        </View>
      ) : null}
      <ToastHost bottom={nav ? 110 : footer ? 100 : 16} />
    </View>
  );
}

type IconSet = 'ion' | 'mci';
/**
 * Icons: clean line icons (Lucide) for the interface, MaterialCommunityIcons for car parts.
 * Screens keep using Ionicons-style names; "-outline" is ignored because every interface icon is a line icon.
 */
export function Icon({ name, size = 22, color = colors.ink, set = 'ion', stroke }: { name: string; size?: number; color?: string; set?: IconSet; stroke?: number }) {
  if (set === 'mci') return <MaterialCommunityIcons name={name as any} size={size} color={color} />;
  const outline = name.endsWith('-outline');
  const base = outline ? name.slice(0, -8) : name;
  const L = LINE[base];
  if (L) return <L size={size} color={color} strokeWidth={stroke ?? (size <= 16 ? 2.2 : 1.9)} fill={!outline && FILLED.has(base) ? color : 'none'} />;
  return <Ionicons name={name as any} size={size} color={color} />;
}

export function Row({ children, style, gap = 10 }: { children: ReactNode; style?: StyleProp<ViewStyle>; gap?: number }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap }, style]}>{children}</View>;
}

/** A white card lifted off the ground. */
export function Card({ children, onPress, style }: { children: ReactNode; onPress?: () => void; style?: StyleProp<ViewStyle> }) {
  if (onPress) return <Press onPress={onPress} style={[s.card, style]}>{children}</Press>;
  return <View style={[s.card, style]}>{children}</View>;
}

/** Section heading with an optional action on the far side. */
export function Section({ title, note, action, children }: { title: string; note?: string; action?: { label: string; onPress: () => void }; children?: ReactNode }) {
  return (
    <View style={{ gap: 10 }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <T w="bold" size={17}>{title}</T>
        {action ? <Pressable onPress={action.onPress} hitSlop={8} accessibilityRole="link"><Row gap={2}><T size={13} w="semibold" color={colors.primary}>{action.label}</T><Icon name="chevron-back" size={14} color={colors.primary} /></Row></Pressable>
          : note ? <Muted>{note}</Muted> : null}
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
  return <Press onPress={onPress}>{inner}</Press>;
}

export function IconButton({ name, onPress, label, tone = 'white', size = 42, set }: {
  name: string; onPress: () => void; label: string; tone?: 'white' | 'ink' | 'clear'; size?: number; set?: IconSet;
}) {
  const bg = tone === 'ink' ? colors.ink : tone === 'clear' ? 'rgba(255,255,255,.12)' : colors.surface;
  return (
    <Press onPress={onPress} label={label} hitSlop={6}
      style={[{ width: size, height: size, borderRadius: Math.round(size * 0.3), backgroundColor: bg, alignItems: 'center', justifyContent: 'center' },
        tone === 'white' && { borderWidth: 1, borderColor: colors.line }, tone === 'clear' && { borderWidth: 1, borderColor: 'rgba(255,255,255,.14)' }]}>
      <Icon name={name} set={set} size={Math.round(size * 0.46)} color={tone === 'white' ? colors.ink : '#fff'} />
    </Press>
  );
}

export function BackBar({ title, onBack, right }: { title: string; onBack: () => void; right?: ReactNode }) {
  return (
    <Row style={{ marginBottom: 2, minHeight: 44 }} gap={12}>
      <IconButton name="chevron-forward" onPress={onBack} label="رجوع" size={40} />
      <T w="bold" size={17} center style={{ flex: 1 }} numberOfLines={1}>{title}</T>
      <View style={{ minWidth: 40, alignItems: 'flex-end' }}>{right}</View>
    </Row>
  );
}

/* ---------------------------------------------------------------- buttons */
type Kind = 'primary' | 'accent' | 'secondary' | 'dark' | 'danger' | 'small' | 'link';
export function Btn({ title, onPress, kind = 'primary', disabled, loading, style, icon }: {
  title: string; onPress: () => void; kind?: Kind; disabled?: boolean; loading?: boolean; style?: StyleProp<ViewStyle>; icon?: string;
}) {
  const k = btnStyles[kind];
  return (
    <Press onPress={onPress} disabled={disabled || loading} style={[k.box, style]}>
      {loading ? <ActivityIndicator color={k.color} /> : (
        <Row gap={8} style={{ justifyContent: 'center' }}>
          {icon ? <Icon name={icon} size={k.size + 3} color={k.color} /> : null}
          <T w="semibold" size={k.size} color={k.color} center>{title}</T>
        </Row>
      )}
    </Press>
  );
}

/* ---------------------------------------------------------------- inputs */
export function Field({ label, value, onChangeText, placeholder, keyboardType, ltr, multiline, secure, hint, big, icon }: {
  label?: string; value: string; onChangeText: (t: string) => void; placeholder?: string;
  keyboardType?: 'default' | 'phone-pad' | 'number-pad' | 'email-address'; ltr?: boolean; multiline?: boolean; secure?: boolean; hint?: string; big?: boolean; icon?: string;
}) {
  const [focus, setFocus] = useState(false);
  return (
    <View style={{ gap: 6 }}>
      {label ? <T w="medium" size={13} color={colors.muted}>{label}</T> : null}
      <View style={[s.inputBox, focus && { borderColor: colors.primary, backgroundColor: colors.surface }, multiline && { alignItems: 'flex-start' }]}>
        {icon ? <Icon name={icon} size={19} color={focus ? colors.primary : colors.faint} /> : null}
        <TextInput
          value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={colors.faint}
          keyboardType={keyboardType} secureTextEntry={secure} multiline={multiline}
          autoCapitalize="none" autoCorrect={!ltr} onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
          style={[s.input, big && { fontSize: 20, fontFamily: fonts.bold }, multiline && { minHeight: 84, textAlignVertical: 'top' },
            ltr ? { writingDirection: 'ltr', textAlign: 'right' } : { textAlign: 'right' }, { outlineStyle: 'none' } as any]}
        />
      </View>
      {hint ? <Muted size={12}>{hint}</Muted> : null}
    </View>
  );
}

export function Chips<V extends string | number>({ options, selected, onPick }: {
  options: { v: V; label: string; icon?: string }[]; selected: V[]; onPick: (v: V) => void;
}) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {options.map((o) => {
        const on = selected.includes(o.v);
        return (
          <Press key={String(o.v)} onPress={() => onPick(o.v)} selected={on}
            style={[s.chip, on && { backgroundColor: colors.primarySoft, borderColor: colors.primary }]}>
            <Row gap={6}>
              {o.icon ? <Icon name={o.icon} size={15} color={on ? colors.primary : colors.muted} /> : null}
              <T size={13.5} w={on ? 'semibold' : 'medium'} color={on ? colors.primary : colors.ink}>{o.label}</T>
              {on ? <Icon name="checkmark" size={14} color={colors.primary} /> : null}
            </Row>
          </Press>
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
          <Pressable key={String(o.v)} onPress={() => { tick(); onPick(o.v); }} accessibilityRole="button" accessibilityState={{ selected: on }}
            style={[s.segBtn, on && s.segOn]}>
            <T size={13.5} w={on ? 'semibold' : 'medium'} color={on ? colors.primary : colors.muted} center>{o.label}</T>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Labeled({ label, children }: { label: string; children: ReactNode }) {
  return <View style={{ gap: 8 }}><T w="medium" size={13} color={colors.muted}>{label}</T>{children}</View>;
}

/** A sheet that rises from the bottom (centred card on wide screens). */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={s.sheetBackdrop} onPress={onClose}>
        <Pressable style={[s.sheet, { paddingBottom: insets.bottom + 20 }]} onPress={() => {}}>
          <View style={s.grabber} />
          <Row style={{ justifyContent: 'space-between', marginBottom: 8 }}>
            <T w="bold" size={19}>{title}</T>
            <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="اقفل"><Icon name="close" size={22} color={colors.muted} /></Pressable>
          </Row>
          {children}
        </Pressable>
      </Pressable>
    </Modal>
  );
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
      <Press onPress={() => setOpen(true)} style={[s.inputBox, { justifyContent: 'space-between', paddingVertical: 13 }]}>
        <T w="medium">{current?.label ?? '—'}</T><Icon name="chevron-down" size={16} color={colors.faint} />
      </Press>
      <Sheet open={open} onClose={() => setOpen(false)} title={label}>
        <FlatList data={options} keyExtractor={(o) => String(o.v)} style={{ maxHeight: 440 }}
          renderItem={({ item }) => (
            <Pressable onPress={() => { onPick(item.v); setOpen(false); }}
              style={[s.option, item.v === value && { backgroundColor: colors.soft }]}>
              <T w={item.v === value ? 'semibold' : 'regular'}>{item.label}</T>
              {item.v === value ? <Icon name="checkmark" size={18} /> : null}
            </Pressable>
          )} />
      </Sheet>
    </View>
  );
}

/* ---------------------------------------------------------------- bits */
type Tone = 'new' | 'good' | 'wait' | 'plain' | 'bad' | 'accent';
export function Pill({ label, tone = 'plain', icon }: { label: string; tone?: Tone; icon?: string }) {
  const bg = { new: colors.primarySoft, good: colors.goodSoft, wait: colors.warnSoft, plain: colors.soft, bad: colors.badSoft, accent: colors.accent }[tone];
  const fg = { new: colors.primary, good: colors.good, wait: colors.warn, plain: colors.muted, bad: colors.bad, accent: colors.ink }[tone];
  return (
    <View style={{ backgroundColor: bg, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      {icon ? <Icon name={icon} size={12} color={fg} /> : null}
      <T size={12} w="semibold" color={fg} style={{ lineHeight: 17 }}>{label}</T>
    </View>
  );
}

export const Notice = ({ children, icon = 'information-circle' }: { children: ReactNode; icon?: string }) => (
  <View style={{ backgroundColor: colors.primarySoft, borderRadius: radius.md, padding: 14, flexDirection: 'row', gap: 10, alignItems: 'flex-start', borderWidth: 1, borderColor: '#D3E8FB' }}>
    <Icon name={icon} size={20} color={colors.primary} />
    <View style={{ flex: 1, gap: 2 }}>{typeof children === 'string' ? <T size={14}>{children}</T> : children}</View>
  </View>
);

export const Empty = ({ text, icon = 'file-tray-outline', action }: { text: string; icon?: string; action?: { label: string; onPress: () => void } }) => (
  <View style={{ alignItems: 'center', paddingVertical: 36, gap: 12 }}>
    <View style={{ width: 76, height: 76, borderRadius: 24, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name={icon.length <= 2 ? 'file-tray-outline' : icon} size={32} color={colors.primary} stroke={1.6} />
    </View>
    <Muted center size={14}>{text}</Muted>
    {action ? <Btn kind="small" title={action.label} onPress={action.onPress} style={{ alignSelf: 'center' }} /> : null}
  </View>
);

export const ErrorText = ({ text }: { text?: string | null }) => (text ? (
  <Row gap={6}><Icon name="alert-circle" size={16} color={colors.bad} /><T size={13} w="medium" color={colors.bad} style={{ flex: 1 }}>{text}</T></Row>
) : null);

/** Numbers in a lifted strip. */
export function Stats({ items }: { items: [string, string][] }) {
  return (
    <View style={[{ flexDirection: 'row', backgroundColor: colors.surface, borderRadius: radius.lg, paddingVertical: 16 }, lift]}>
      {items.map(([v, l], i) => (
        <View key={i} style={[{ flex: 1, paddingHorizontal: 14, gap: 2 }, i > 0 && { borderStartWidth: 1, borderColor: colors.line }]}>
          <T w="bold" size={21}>{v}</T>
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
        <Pressable style={[s.backdrop, { backgroundColor: 'rgba(10,12,18,.92)' }]} onPress={() => setBig(false)}>
          <Image source={{ uri }} style={{ width: '94%', height: '80%' }} resizeMode="contain" accessibilityLabel="صورة القطعة" />
        </Pressable>
      </Modal>
    </>
  );
}

export function PhotoPicker({ uri, onPick, hint }: { uri: string | null; onPick: () => void; hint: string }) {
  return (
    <Press onPress={onPick} style={s.upload}>
      {uri ? <Image source={{ uri }} style={[s.photo, { width: 56, height: 56 }]} /> : (
        <View style={[s.photo, { width: 56, height: 56, backgroundColor: colors.primarySoft }]}><Icon name="camera" size={24} color={colors.primary} /></View>
      )}
      <View style={{ flex: 1 }}>
        <T w="semibold" size={14}>{uri ? 'الصورة اتضافت' : 'ضيف صورة'}</T>
        <Muted size={12}>{uri ? 'اضغط لو عايز تغيّرها' : hint}</Muted>
      </View>
    </Press>
  );
}

/** Skeleton blocks that shimmer while data loads. */
export function Skeleton({ h = 16, w = '100%', r = 10, style }: { h?: number; w?: number | `${number}%`; r?: number; style?: StyleProp<ViewStyle> }) {
  const a = useRef(new Animated.Value(0.5)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(a, { toValue: 1, duration: 650, easing: Easing.inOut(Easing.quad), useNativeDriver: Platform.OS !== 'web' }),
      Animated.timing(a, { toValue: 0.5, duration: 650, easing: Easing.inOut(Easing.quad), useNativeDriver: Platform.OS !== 'web' }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [a]);
  return <Animated.View style={[{ height: h, width: w, borderRadius: r, backgroundColor: '#E2E5EB', opacity: a }, style]} />;
}

export function Loading() {
  return (
    <View style={{ gap: 14, paddingTop: 8 }} accessibilityLabel="بيحمّل">
      <Skeleton h={28} w="55%" />
      <Skeleton h={120} r={20} />
      <Skeleton h={84} r={20} />
      <Skeleton h={84} r={20} />
    </View>
  );
}

/** A vertical progress line: done steps filled, the current one ringed. */
export function Steps({ items, current = -1 }: { items: string[]; current?: number }) {
  return (
    <View style={{ gap: 0 }}>
      {items.map((t, i) => {
        const done = current >= 0 && i < current; const now = i === current;
        return (
          <Row key={i} style={{ alignItems: 'flex-start' }} gap={12}>
            <View style={{ alignItems: 'center', width: 26 }}>
              <View style={[s.stepNum, (done || current < 0) && { backgroundColor: colors.ink }, now && { backgroundColor: colors.primary }]}>
                {done ? <Icon name="checkmark" size={14} color="#fff" /> : <T w="bold" size={12} color={now || current < 0 ? '#fff' : colors.faint}>{['١', '٢', '٣', '٤', '٥', '٦'][i]}</T>}
              </View>
              {i < items.length - 1 ? <View style={{ width: 2, height: 22, backgroundColor: done ? colors.ink : colors.line }} /> : null}
            </View>
            <T size={14.5} w={now ? 'semibold' : 'regular'} color={done || now || current < 0 ? colors.ink : colors.faint} style={{ flex: 1, paddingTop: 2 }}>{t}</T>
          </Row>
        );
      })}
    </View>
  );
}

/**
 * The signature element: an Egyptian private-car licence plate.
 * Used for the customer's car and for order numbers.
 */
export function Plate({ top, bottom, size = 'md' }: { top: string; bottom: string; size?: 'sm' | 'md' | 'lg' }) {
  const k = { sm: { w: 92, f: 12, b: 7 }, md: { w: 118, f: 14, b: 8 }, lg: { w: 150, f: 18, b: 9 } }[size];
  return (
    <View style={[s.plate, { width: k.w }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={s.plateTop}><T size={k.b} w="bold" color={colors.ink} style={{ lineHeight: k.b + 5 }}>مصر</T><T size={k.b} w="bold" color={colors.ink} style={{ lineHeight: k.b + 5 }}>EGYPT</T></View>
      <View style={{ flexDirection: 'row', paddingVertical: 1 }}>
        <View style={{ flex: 1, alignItems: 'center' }}><T w="bold" size={k.f} numberOfLines={1}>{top}</T></View>
        <View style={{ flex: 1, alignItems: 'center', borderStartWidth: 1.5, borderColor: colors.ink }}><T w="bold" size={k.f} numberOfLines={1}>{bottom}</T></View>
      </View>
    </View>
  );
}

export function Lines({ rows, total }: { rows: [string, string][]; total?: [string, string] }) {
  return (
    <View style={{ gap: 10 }}>
      {rows.map(([a, b], i) => <Row key={i} style={{ justifyContent: 'space-between' }}><Muted size={14}>{a}</Muted><T size={14}>{b}</T></Row>)}
      {total ? <Row style={{ justifyContent: 'space-between', borderTopWidth: 1, borderColor: colors.line, borderStyle: 'dashed', paddingTop: 10 }}><T w="bold" size={17}>{total[0]}</T><T w="bold" size={17}>{total[1]}</T></Row> : null}
    </View>
  );
}

/** Text the person can select and copy, shown left-to-right (phone numbers). */
export function CopyBox({ text }: { text: string }) {
  return (
    <View style={{ backgroundColor: colors.soft, borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 10 }}>
      <T selectable w="semibold" size={16} style={{ writingDirection: 'ltr', textAlign: 'right' }}>{text}</T>
    </View>
  );
}

/* ---------------------------------------------------------------- toast */
let pushToast: ((m: string) => void) | null = null;
export const toast = (m: string) => pushToast?.(m);

export function ToastHost({ bottom }: { bottom: number }) {
  const [msg, setMsg] = useState('');
  const y = useRef(new Animated.Value(30)).current;
  const insets = useSafeAreaInsets();
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    pushToast = (m) => {
      setMsg(m); y.setValue(30);
      Animated.spring(y, { toValue: 0, useNativeDriver: Platform.OS !== 'web', speed: 18, bounciness: 8 }).start();
      clearTimeout(t); t = setTimeout(() => setMsg(''), 3500);
    };
    return () => { pushToast = null; clearTimeout(t); };
  }, [y]);
  if (!msg) return null;
  return (
    <Animated.View pointerEvents="none" style={[s.toast, liftStrong, { bottom: insets.bottom + bottom, transform: [{ translateY: y }] }]} accessibilityLiveRegion="polite">
      <Icon name="checkmark-circle" size={20} color={colors.lime} />
      <T color={colors.brandInk} w="medium" size={14} style={{ flex: 1 }}>{msg}</T>
    </Animated.View>
  );
}

/* ---------------------------------------------------------------- styles */
const base: ViewStyle = { borderRadius: 14, minHeight: 54, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 18 };
const btnStyles: Record<Kind, { box: ViewStyle; color: string; size: number }> = {
  primary: { box: { ...base, backgroundColor: colors.primary }, color: colors.primaryInk, size: 16 },
  accent: { box: { ...base, backgroundColor: colors.primary }, color: colors.primaryInk, size: 16 },
  dark: { box: { ...base, minHeight: 46, borderRadius: 12, backgroundColor: colors.ink }, color: colors.brandInk, size: 14.5 },
  secondary: { box: { ...base, minHeight: 50, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line }, color: colors.ink, size: 15 },
  danger: { box: { ...base, minHeight: 48, backgroundColor: colors.badSoft }, color: colors.bad, size: 14 },
  small: { box: { backgroundColor: colors.primary, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 14, alignSelf: 'flex-start' }, color: colors.primaryInk, size: 13 },
  link: { box: { paddingVertical: 4, alignSelf: 'flex-start' }, color: colors.primary, size: 13.5 },
};

const s = StyleSheet.create({
  column: { width: '100%', maxWidth: 560, alignSelf: 'center', paddingHorizontal: 18 },
  body: { flexGrow: 1, paddingTop: 16, gap: 18 },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: 16, gap: 12, ...lift },
  inputBox: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.soft, borderWidth: 1.5, borderColor: colors.soft, borderRadius: radius.md, paddingHorizontal: 14 },
  input: { flex: 1, fontFamily: fonts.medium, fontSize: 16, color: colors.ink, paddingVertical: 13 },
  chip: { borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  seg: { flexDirection: 'row', backgroundColor: colors.surface, borderRadius: radius.md, padding: 4, gap: 4, borderWidth: 1, borderColor: colors.line },
  segBtn: { flex: 1, borderRadius: 9, paddingVertical: 9 },
  segOn: { backgroundColor: colors.primarySoft },
  backdrop: { flex: 1, backgroundColor: 'rgba(17,21,30,.4)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(17,21,30,.4)', justifyContent: 'flex-end', alignItems: 'center' },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingTop: 10, width: '100%', maxWidth: 560 },
  grabber: { width: 40, height: 5, borderRadius: 3, backgroundColor: colors.line, alignSelf: 'center', marginBottom: 12 },
  option: { paddingVertical: 13, paddingHorizontal: 12, borderRadius: radius.sm, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  photo: { borderRadius: 12, backgroundColor: colors.soft, alignItems: 'center', justifyContent: 'center' },
  upload: { flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: radius.lg, padding: 12, backgroundColor: colors.surface, borderWidth: 1.5, borderColor: '#C9DDF2', borderStyle: 'dashed' },
  stepNum: { width: 26, height: 26, borderRadius: 13, backgroundColor: colors.soft, alignItems: 'center', justifyContent: 'center' },
  plate: { borderWidth: 2, borderColor: colors.ink, borderRadius: 7, overflow: 'hidden', backgroundColor: '#fff' },
  plateTop: { backgroundColor: colors.plate, flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 7 },
  toast: { position: 'absolute', left: 18, right: 18, alignSelf: 'center', maxWidth: 520, backgroundColor: colors.ink, borderRadius: 14, paddingVertical: 13, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 10 },
});

/* ---------------------------------------------------------------- slide to confirm */
/**
 * A deliberate confirm: drag the knob across the track. Used where a mis-tap would cost money.
 * In RTL the knob starts on the right and travels left.
 */
export function SlideToConfirm({ label, onConfirm, busy }: { label: string; onConfirm: () => void; busy?: boolean }) {
  const [w, setW] = useState(0);
  const x = useRef(new Animated.Value(0)).current;
  const knob = 52;
  const max = Math.max(0, w - knob - 8);
  const done = useRef(false);
  const pan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => !done.current,
    onMoveShouldSetPanResponder: (_, g) => !done.current && Math.abs(g.dx) > 4,
    onPanResponderMove: (_, g) => x.setValue(Math.min(maxRef.current, Math.max(0, -g.dx))),
    onPanResponderRelease: (_, g) => {
      if (-g.dx > maxRef.current * 0.85) {
        done.current = true;
        Animated.timing(x, { toValue: maxRef.current, duration: 120, useNativeDriver: false }).start();
        if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        onConfirmRef.current();
      } else Animated.spring(x, { toValue: 0, useNativeDriver: false, bounciness: 8 }).start();
    },
  })).current;
  const maxRef = useRef(max); maxRef.current = max;
  const onConfirmRef = useRef(onConfirm); onConfirmRef.current = onConfirm;
  useEffect(() => { if (!busy && done.current) { done.current = false; Animated.spring(x, { toValue: 0, useNativeDriver: false }).start(); } }, [busy, x]);
  const fill = x.interpolate({ inputRange: [0, Math.max(1, max)], outputRange: [knob + 8, Math.max(knob + 8, w)] });
  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)} accessibilityRole="button" accessibilityLabel={label}
      accessibilityActions={[{ name: 'activate' }]} onAccessibilityAction={() => onConfirm()}
      style={{ height: 60, borderRadius: 16, backgroundColor: colors.ink, justifyContent: 'center', overflow: 'hidden' }}>
      <Animated.View style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: fill, backgroundColor: colors.primary, borderRadius: 16 }} />
      <T w="semibold" size={15.5} color="#fff" center style={{ paddingHorizontal: knob + 16 }}>{busy ? 'بنأكد…' : label}</T>
      <Animated.View {...pan.panHandlers}
        style={{ position: 'absolute', right: 4, width: knob, height: knob, borderRadius: 12, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', transform: [{ translateX: Animated.multiply(x, -1) }], ...(Platform.OS === 'web' ? ({ cursor: 'grab' } as object) : {}) }}>
        {busy ? <ActivityIndicator color={colors.ink} /> : <Icon name="chevron-back" size={26} color={colors.ink} />}
      </Animated.View>
    </View>
  );
}

/** A row of tabs that scrolls sideways; each tab can carry a small status mark. */
export function TabPills<V extends string>({ items, value, onPick }: {
  items: { v: V; label: string; mark?: { icon: string; color: string } | { count: number } }[]; value: V; onPick: (v: V) => void;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 8, paddingVertical: 4, paddingHorizontal: 2, alignItems: 'center' }}>
      {items.map((it) => {
        const on = it.v === value;
        return (
          <Press key={it.v} onPress={() => onPick(it.v)} role="tab" selected={on}
            style={{ flexDirection: 'row', alignItems: 'center', alignSelf: 'center', gap: 6, paddingHorizontal: 14, height: 40, borderRadius: 12, borderWidth: 1,
              backgroundColor: on ? colors.primarySoft : colors.surface, borderColor: on ? colors.primary : colors.line }}>
            <T size={13.5} w={on ? 'semibold' : 'medium'} color={on ? colors.primary : colors.ink} numberOfLines={1}>{it.label}</T>
            {it.mark && 'count' in it.mark ? (
              <View style={{ minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 5, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}>
                <T size={11} w="bold" color="#fff" style={{ lineHeight: 15 }}>{String(it.mark.count)}</T>
              </View>
            ) : it.mark ? <Icon name={it.mark.icon} size={16} color={it.mark.color} /> : null}
          </Press>
        );
      })}
    </ScrollView>
  );
}

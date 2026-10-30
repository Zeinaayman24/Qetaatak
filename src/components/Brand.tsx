import { View } from 'react-native';
import Svg, { Circle, G, Line, Path, Polygon, Rect } from 'react-native-svg';
import { brand, colors } from '@/lib/theme';
import { T } from './ui';

/**
 * The ضغطة mark: a gear (car parts) around a button being pressed (one tap),
 * with speed lines (it comes fast). Drawn as vectors so it is sharp at any size.
 * `bg` is the colour behind the mark; gear and hand use `fg`.
 */
export function Mark({ size = 40, bg = brand.navy, fg = '#FFFFFF' }: { size?: number; bg?: string; fg?: string }) {
  const teeth = [0, 45, 135, 180, 225, 270, 315];
  const hand = (fill: string, stroke?: string) => (
    <G transform="translate(46 47.5) scale(.95) translate(-47.5 -42)" fill={fill} stroke={stroke} strokeWidth={stroke ? 5 / 0.95 : 0} strokeLinejoin="round">
      <Rect x={43} y={40} width={9} height={36} rx={4.5} />
      <Rect x={51} y={57} width={8.5} height={18} rx={4.25} />
      <Rect x={58.5} y={60} width={8} height={16} rx={4} />
      <Rect x={65.5} y={63.5} width={7} height={13} rx={3.5} />
      <Path d="M43 68 L72.5 70 L72 80 C71.5 89 64 95 55 95 C48 95 43.5 92 39.5 87 L30.5 77.5 C28 74.5 31.5 70.5 35 72.5 L43 77 Z" />
    </G>
  );
  const lines = (fill: string, stroke?: string) => (
    <G transform="translate(4 1)" fill={fill} stroke={stroke} strokeWidth={stroke ? 3 : 0} strokeLinejoin="round">
      <Path d="M70 31 H92 Q95 31 93.6 33.8 L92.4 36.2 Q91 39 88 39 H66 Z" />
      <Path d="M71 44 H92 Q95 44 93.6 46.8 L92.4 49.2 Q91 52 88 52 H68 Z" />
      <Path d="M69 57 H88 Q91 57 89.6 59.8 L88.4 62.2 Q87 65 84 65 H65 Z" />
    </G>
  );
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <G fill={fg}>
        <Circle cx={44} cy={50} r={33} />
        {teeth.map((a) => <Polygon key={a} points="39.3,8 48.7,8 50.8,19 37.2,19" transform={`rotate(${a} 44 50)`} />)}
      </G>
      <Circle cx={44} cy={50} r={24.5} fill={bg} />
      {lines(bg, bg)}
      {lines(brand.sky)}
      <Circle cx={45} cy={50} r={18.5} fill={bg} stroke={brand.sky} strokeWidth={5.5} />
      <G stroke={brand.lime} strokeWidth={2.8} strokeLinecap="round">
        <Line x1={46} y1={37} x2={46} y2={41.5} />
        <Line x1={38.6} y1={40} x2={41.4} y2={42.8} />
        <Line x1={53.4} y1={40} x2={50.6} y2={42.8} />
      </G>
      {hand('none', bg)}
      {hand(fg)}
    </Svg>
  );
}

/** Mark + the ضغطة wordmark. `on` is the ground it sits on. */
export function Logo({ size = 26, on = 'light', ground }: { size?: number; on?: 'light' | 'dark'; ground?: string }) {
  const dark = on === 'dark';
  const bg = ground ?? (dark ? brand.navy : colors.ground);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: size * 0.3 }}>
      {/* the word first so, right-to-left, the mark sits on its left and the speed lines lead into it */}
      <T size={size} color={dark ? '#FFFFFF' : brand.navy} style={{ fontFamily: 'Alexandria_900Black', lineHeight: size * 1.45 }}>ضغطة</T>
      <Mark size={size * 1.55} bg={bg} fg={dark ? '#FFFFFF' : brand.navy} />
    </View>
  );
}

/** The square app icon: the mark on navy. */
export function AppIcon({ size = 64 }: { size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size * 0.24, backgroundColor: brand.navy, alignItems: 'center', justifyContent: 'center' }}>
      <Mark size={size * 0.82} />
    </View>
  );
}

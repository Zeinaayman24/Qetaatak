import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, useWindowDimensions } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import Svg, { Circle, Defs, G, Line, LinearGradient, Path, Polygon, RadialGradient, Rect, Stop } from 'react-native-svg';
import { brand } from '@/lib/theme';
import { t as tr } from '@/lib/i18n';
import { playSfx, prepareSfx, soundOn, unlockSfx } from '@/lib/sfx';
import { introSeen, introTarget, markIntroSeen, setIntroRunning, type IntroTarget } from '@/lib/intro';

/**
 * The opening animation: the gear comes out of the dark, the hand presses the button,
 * the gear wakes up and spins, then the mark flies into the real header logo and the app shows.
 * Drawn from the exact logo shapes (see Brand.tsx). About 4 s the first time, faster after that;
 * a tap skips ahead to the landing. Turned off when the phone asks for reduced motion.
 */

const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const seg = (t: number, a: number, b: number) => clamp((t - a) / (b - a));
const lerp = (a: number, b: number, u: number) => a + (b - a) * u;
const eOutC = (u: number) => 1 - Math.pow(1 - u, 3);
const eInOutC = (u: number) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);
const eOutBack = (u: number, s = 1.6) => 1 + (s + 1) * Math.pow(u - 1, 3) + s * Math.pow(u - 1, 2);
const smoother = (u: number) => u * u * u * (u * (u * 6 - 15) + 10);

const R0 = 1.9, R1 = 3.88, TURNS = 5 * 360;
const angle = (t: number) => TURNS * smoother(Math.pow(seg(t, R0, R1), 1.35));
const FLY = 3.2, LAND = 3.88, END = 3.92;

const TEETH = [0, 45, 135, 180, 225, 270, 315];
const RING = 'M77 50 A33 33 0 1 0 11 50 A33 33 0 1 0 77 50 Z M68.5 50 A24.5 24.5 0 1 1 19.5 50 A24.5 24.5 0 1 1 68.5 50 Z';
const LINES = ['M70 31 H92 Q95 31 93.6 33.8 L92.4 36.2 Q91 39 88 39 H66 Z', 'M71 44 H92 Q95 44 93.6 46.8 L92.4 49.2 Q91 52 88 52 H68 Z', 'M69 57 H88 Q91 57 89.6 59.8 L88.4 62.2 Q87 65 84 65 H65 Z'];
const PALM = 'M43 68 L72.5 70 L72 80 C71.5 89 64 95 55 95 C48 95 43.5 92 39.5 87 L30.5 77.5 C28 74.5 31.5 70.5 35 72.5 L43 77 Z';
const HAND_T = 'translate(46 47.5) scale(.95) translate(-47.5 -42)';

function Gear({ fill, stroke, sw = 0 }: { fill: string; stroke?: string; sw?: number }) {
  return (
    <G fill={fill} stroke={stroke} strokeWidth={sw} strokeLinejoin="round">
      <Path d={RING} fillRule="evenodd" />
      {TEETH.map((a) => <Polygon key={a} points="39.3,8 48.7,8 50.8,19 37.2,19" transform={`rotate(${a} 44 50)`} />)}
    </G>
  );
}
function Hand({ fill, stroke, sw = 0 }: { fill: string; stroke?: string; sw?: number }) {
  return (
    <G transform={HAND_T} fill={fill} stroke={stroke} strokeWidth={sw} strokeLinejoin="round">
      <Rect x={43} y={40} width={9} height={36} rx={4.5} /><Rect x={51} y={57} width={8.5} height={18} rx={4.25} />
      <Rect x={58.5} y={60} width={8} height={16} rx={4} /><Rect x={65.5} y={63.5} width={7} height={13} rx={3.5} />
      <Path d={PALM} />
    </G>
  );
}
function Lines({ fill, stroke }: { fill: string; stroke?: string }) {
  return <G fill={fill} stroke={stroke} strokeWidth={stroke ? 3 : 0} strokeLinejoin="round">{LINES.map((d) => <Path key={d} d={d} />)}</G>;
}
function Ticks() {
  return (
    <G stroke={brand.lime} strokeWidth={2.8} strokeLinecap="round">
      <Line x1={46} y1={37} x2={46} y2={41.5} /><Line x1={38.6} y1={40} x2={41.4} y2={42.8} /><Line x1={53.4} y1={40} x2={50.6} y2={42.8} />
    </G>
  );
}

export function Intro({ onDone }: { onDone: () => void }) {
  // the real size of the app area (on some iPhones it reaches lower than the window size says)
  const win = useWindowDimensions();
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  const W = box?.w ?? win.width, H = box?.h ?? win.height;
  const [t, setT] = useState(0);
  const clock = useRef({ start: 0, speed: 1, skip: 0 });
  const landing = useRef<IntroTarget | null | undefined>(undefined);
  const sounds = useRef({ click: false, car: false, unlocked: false });

  useEffect(() => {
    prepareSfx();
    let raf = 0, alive = true;
    const finish = () => { if (!alive) return; alive = false; setIntroRunning(false); markIntroSeen(); onDone(); };
    (async () => {
      const [reduce, seen] = await Promise.all([AccessibilityInfo.isReduceMotionEnabled().catch(() => false), introSeen()]);
      if (reduce) return finish();
      clock.current.speed = seen ? 1.4 : 1;
      clock.current.start = Date.now();
      const tick = () => {
        if (!alive) return;
        const c = clock.current;
        const now = ((Date.now() - c.start) / 1000) * c.speed + c.skip;
        setT(now);
        // sound effects, in step with the picture: the press clicks, then the car passes as the logo flies home
        const sd = sounds.current, PASS = 1.45;
        if (!sd.click && now >= 1.72) { sd.click = true; if (now < 1.95) playSfx('click', 0.9); }
        if (!sd.car && now >= 2.0) {
          sd.car = true;
          const from = PASS - PASS / c.speed + Math.max(0, now - 2.0) / c.speed;
          if (now < 3.6) playSfx('car', 0.75, from);
        }
        if (now >= END) return finish();
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    })();
    return () => { alive = false; cancelAnimationFrame(raf); };
  }, [onDone]);

  // a tap lets sound play (phones block it until then); if sound was already on, a tap skips ahead
  const tap = () => {
    if (!sounds.current.unlocked) { sounds.current.unlocked = true; const wasOn = soundOn(); unlockSfx(); if (!wasOn) return; }
    skip();
  };
  const skip = () => { const c = clock.current; const now = ((Date.now() - c.start) / 1000) * c.speed + c.skip; if (now < FLY) c.skip += FLY - now; };

  // ---- the frame at time t (same timing as the approved preview video)
  const appear = eOutC(seg(t, 0.05, 1.0));
  const sweep = lerp(-34, 0, eInOutC(seg(t, 0, 1.3)));

  const handIn = eOutC(seg(t, 0.95, 1.6));
  const pressDown = eInOutC(seg(t, 1.6, 1.72));
  const press = t >= 1.98 ? 0 : pressDown * (1 - eOutBack(seg(t, 1.72, 1.98), 2.2));
  const hdy = lerp(105, 0, handIn), hrot = lerp(9, 0, handIn), hsc = lerp(1.14, 1, handIn) * (1 - 0.05 * press);
  const bsc = 1 - 0.07 * press;
  const pulse = seg(t, 1.7, 1.78) * (1 - seg(t, 1.78, 2.5));
  const halo = Math.max(pulse * 0.9, 0.35 * seg(t, 2.0, 2.6) * (1 - seg(t, 3.2, 3.6)));
  const tk = seg(t, 1.72, 2.0), tks = Math.max(0.01, t < 1.72 ? 0.4 : eOutBack(tk, 2.0));
  const ln = eOutC(seg(t, 1.95, 2.45));
  const lnStretch = 1 + 0.25 * seg(t, 2.3, 2.9) * (1 - seg(t, 3.2, 3.7));
  const a = angle(t), da = a - angle(t - 1 / 120);
  const vib = t > 1.72 && t < 2.05 ? Math.sin((t - 1.72) * 2 * Math.PI * 38) * 0.35 * (1 - seg(t, 1.72, 2.05)) : 0;
  const gsc = 1 - 0.025 * press;

  // camera: hero size, push-in, then fly into the header logo (or fade at the centre if there is none on screen)
  if (t >= FLY && landing.current === undefined) landing.current = introTarget();
  const to = landing.current ?? null;
  const HS = Math.min(W, H * 0.5625, 560) * 0.0074;
  const s0 = HS * lerp(0.9, 1, appear) * (1 + 0.12 * eInOutC(seg(t, 2.7, 3.2)));
  const fly = eInOutC(seg(t, FLY, LAND));
  let s = s0, cx = W / 2, cy = H * 0.47, op = 1;
  if (to) {
    const fs = to.size / 100;
    s = Math.exp(lerp(Math.log(s0), Math.log(fs), fly));
    cx = lerp(cx, to.x + 44 * fs, fly); cy = lerp(cy, to.y + 50 * fs, fly);
  } else {
    s = s0 * lerp(1, 0.6, fly); op = 1 - seg(t, FLY, 3.7);
  }
  const flat = to ? seg(t, 3.5, 3.86) : 0;
  const ground = 1 - seg(t, 3.3, 3.8);
  const fg = to?.fg ?? '#FFFFFF', bg = to?.bg ?? brand.navy;
  const steelT = (rot: number) => `rotate(${-rot} 44 50) translate(${sweep} ${sweep})`;
  const COPIES = 5;

  return (
    <Pressable onLayout={(e) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })} onPress={tap} accessibilityRole="image" accessibilityLabel={tr('ضغطة')} style={[StyleSheet.absoluteFill, { zIndex: 1000 }]}>
      <StatusBar style="light" />
      <Svg width={W} height={H}>
        <Defs>
          <RadialGradient id="glow" cx={W / 2} cy={H * 0.47} r={Math.max(W, H) * 0.42} gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor="#0D3D73" /><Stop offset="0.55" stopColor="#072954" stopOpacity="0.6" /><Stop offset="1" stopColor={brand.navy} stopOpacity="0" />
          </RadialGradient>
          {Array.from({ length: COPIES }, (_, k) => (
            <LinearGradient key={k} id={`steel${k}`} x1="0" y1="0" x2="100" y2="100" gradientUnits="userSpaceOnUse" gradientTransform={steelT(a - (da * k) / (COPIES - 1))}>
              <Stop offset="0" stopColor="#FFFFFF" /><Stop offset="0.22" stopColor="#D5DDE7" /><Stop offset="0.42" stopColor="#8E9DB0" />
              <Stop offset="0.55" stopColor="#EEF2F7" /><Stop offset="0.72" stopColor="#A3B0C0" /><Stop offset="1" stopColor="#5E6E84" />
            </LinearGradient>
          ))}
          <LinearGradient id="rim" x1="10" y1="10" x2="80" y2="90" gradientUnits="userSpaceOnUse" gradientTransform={steelT(a)}>
            <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0.95" /><Stop offset="0.5" stopColor="#FFFFFF" stopOpacity="0.15" /><Stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
          </LinearGradient>
          <LinearGradient id="satin" x1="30" y1="40" x2="75" y2="95" gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor="#FFFFFF" /><Stop offset="0.6" stopColor="#EEF2F6" /><Stop offset="1" stopColor="#C9D3DF" />
          </LinearGradient>
          <RadialGradient id="btn" cx="42" cy="44" r="22" gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor="#0B3566" /><Stop offset="1" stopColor="#031630" />
          </RadialGradient>
        </Defs>

        <G opacity={ground}>
          <Rect x={0} y={0} width={W} height={H} fill={brand.navy} />
          <Rect x={0} y={0} width={W} height={H} fill="url(#glow)" opacity={0.15 + 0.85 * appear} />
        </G>

        <G opacity={op} transform={`translate(${cx - 44 * s} ${cy - 50 * s}) scale(${s})`}>
          {/* the metal mark */}
          <G opacity={1 - flat}>
            <G opacity={appear} transform={`translate(${vib} ${vib * 0.4}) translate(44 50) scale(${gsc}) translate(-44 -50)`}>
              <G transform={`translate(0 1.6) rotate(${a} 44 50)`} opacity={0.55}><Gear fill="#000814" /></G>
              {Array.from({ length: COPIES }, (_, k) => {
                const ak = a - (da * k) / (COPIES - 1);
                return <G key={k} transform={`rotate(${ak} 44 50)`} opacity={k === 0 ? 1 : 0.32}><Gear fill={`url(#steel${k})`} /></G>;
              })}
              <G transform={`rotate(${a} 44 50)`} opacity={0.8}><Gear fill="none" stroke="url(#rim)" sw={0.7} /></G>
            </G>
            <G opacity={ln} transform={`translate(${4 - 14 * (1 - ln)} 1) translate(66 48) scale(${lnStretch} 1) translate(-66 -48)`}>
              <Lines fill={brand.navy} stroke={brand.navy} /><Lines fill={brand.sky} />
            </G>
            <G transform={`translate(45 50) scale(${bsc}) translate(-45 -50)`}>
              <Circle cx={45} cy={50} r={18.5} fill="none" stroke={brand.sky} strokeWidth={13} opacity={0.12 * halo} />
              <Circle cx={45} cy={50} r={18.5} fill="none" stroke={brand.sky} strokeWidth={9} opacity={0.25 * halo} />
              <Circle cx={45} cy={50} r={18.5} fill="url(#btn)" stroke={brand.sky} strokeWidth={5.5} />
              <Circle cx={45} cy={50} r={15.75} fill="#000814" opacity={0.45 * clamp(press)} />
            </G>
            <G opacity={clamp(tk * 3)} transform={`translate(46 44) scale(${tks}) translate(-46 -44)`}><Ticks /></G>
            <G opacity={seg(t, 0.95, 1.15)} transform={`translate(0 ${hdy}) translate(46 42) rotate(${hrot}) scale(${hsc}) translate(-46 -42)`}>
              <G transform={`translate(0 ${2 + 2.5 * (1 - handIn) - 1.2 * press})`} opacity={0.45}><Hand fill="#000814" /></G>
              <Hand fill="none" stroke={brand.navy} sw={5 / 0.95} />
              <Hand fill="url(#satin)" />
            </G>
          </G>
          {/* the flat app mark it lands as */}
          {flat > 0 && (
            <G opacity={flat}>
              <G transform={`rotate(${a} 44 50)`}><Gear fill={fg} /></G>
              <G transform="translate(4 1)"><Lines fill={bg} stroke={bg} /><Lines fill={brand.sky} /></G>
              <Circle cx={45} cy={50} r={18.5} fill={bg} stroke={brand.sky} strokeWidth={5.5} />
              <Ticks />
              <Hand fill="none" stroke={bg} sw={5 / 0.95} />
              <Hand fill={fg} />
            </G>
          )}
        </G>
      </Svg>
    </Pressable>
  );
}

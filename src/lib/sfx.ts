import { Platform } from 'react-native';

/**
 * Sound effects for the opening animation (web): the click when the hand presses the gear, and the car
 * passing fast as the logo flies home. Browsers may block sound until the first tap; then we stay silent.
 */
type Name = 'click' | 'car';
let ctx: AudioContext | null = null;
const buffers: Partial<Record<Name, AudioBuffer>> = {};

function base() {
  if (typeof window === 'undefined') return '';
  return window.location.pathname.startsWith('/daghta') ? '/daghta' : '';
}

/** Get ready: make the audio engine and load the sounds (call when the opening starts). */
export function prepareSfx() {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return;
  try { ctx = ctx ?? new AC(); } catch { return; }
  ctx.resume().catch(() => {});
  (['click', 'car'] as Name[]).forEach((n) => {
    if (buffers[n]) return;
    fetch(`${base()}/sounds/${n}.m4a`).then((r) => r.arrayBuffer())
      .then((a) => new Promise<AudioBuffer>((ok, bad) => ctx!.decodeAudioData(a, ok, bad)))
      .then((b) => { buffers[n] = b; }).catch(() => {});
  });
}

/** Call inside a tap: lets sound play from now on. */
export function unlockSfx() {
  if (!ctx) return;
  ctx.resume().catch(() => {});
  try { // iPhone also wants something actually played inside the tap
    const s = ctx.createBufferSource(); s.buffer = ctx.createBuffer(1, 1, 22050); s.connect(ctx.destination); s.start(0);
  } catch { /* fine */ }
}

/** Play a sound now, if sound is allowed and it has loaded. `from` skips into it (seconds). */
export function playSfx(name: Name, volume = 1, from = 0) {
  const b = buffers[name];
  if (!ctx || !b || ctx.state !== 'running') return;
  const src = ctx.createBufferSource(); src.buffer = b;
  const g = ctx.createGain(); g.gain.value = volume;
  src.connect(g).connect(ctx.destination);
  src.start(0, Math.min(from, b.duration - 0.05));
}

/** Is sound already allowed? */
export const soundOn = () => !!ctx && ctx.state === 'running';

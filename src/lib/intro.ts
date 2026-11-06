import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';

/**
 * Shared state for the opening animation: whether it is still playing, and where the real
 * header logo sits on screen (so the animated mark can land exactly on it).
 */
export type IntroTarget = { x: number; y: number; size: number; fg: string; bg: string };

let running = false;
let target: IntroTarget | null = null;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());
const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };

export const introRunning = () => running;
export const introTarget = () => target;
export function setIntroRunning(v: boolean) { if (running !== v) { running = v; emit(); } }
export function setIntroTarget(v: IntroTarget | null) { target = v; }

export const useIntroRunning = () => useSyncExternalStore(subscribe, introRunning, introRunning);

/** Only on a normal app open (home or sign-in), not when a link opens a specific page. */
export function introWanted(): boolean {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return true;
  const p = window.location.pathname.replace(/^\/daghta/, '').replace(/\/+$/, '');
  return ['', '/customer', '/login'].includes(p);
}

const SEEN = 'daghta-intro-seen';
/** Has this device seen the full animation before? (later opens play it faster) */
export async function introSeen(): Promise<boolean> {
  try {
    if (Platform.OS === 'web') return typeof localStorage !== 'undefined' && localStorage.getItem(SEEN) === '1';
    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
    return (await AsyncStorage.getItem(SEEN)) === '1';
  } catch { return false; }
}
export async function markIntroSeen() {
  try {
    if (Platform.OS === 'web') { localStorage.setItem(SEEN, '1'); return; }
    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
    await AsyncStorage.setItem(SEEN, '1');
  } catch { /* fine */ }
}

import { Platform } from 'react-native';
import * as Speech from 'expo-speech';
import { isEn } from './i18n';

/**
 * Voice welcome: «أهلاً يا منير» once a day when the app opens, with the phone's built-in voice.
 * Browsers only allow sound after a tap, so in the web app it plays on the first tap after opening.
 */

const ON = 'daghta-greet', DAY = 'daghta-greet-day2';

async function store() {
  if (Platform.OS === 'web') {
    return {
      get: async (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
      set: async (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* fine */ } },
    };
  }
  const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
  return { get: (k: string) => AsyncStorage.getItem(k), set: (k: string, v: string) => AsyncStorage.setItem(k, v) };
}

export async function greetOn(): Promise<boolean> { return (await (await store()).get(ON)) !== '0'; }
export async function setGreetOn(v: boolean) { await (await store()).set(ON, v ? '1' : '0'); }

const today = () => { const d = new Date(); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };
/** Should we greet now? (on, and not yet today) */
export async function greetDue(): Promise<boolean> {
  const s = await store();
  return (await s.get(ON)) !== '0' && (await s.get(DAY)) !== today();
}
export async function markGreeted() { await (await store()).set(DAY, today()); }

const arabic = (s: string) => /[؀-ۿ]/.test(s);

/** The pieces to say, each in its own language, so an English name is said by an English voice. */
export function greetParts(first: string): { text: string; lang: 'ar' | 'en' }[] {
  const name = first.trim();
  if (isEn()) {
    if (!name || !arabic(name)) return [{ text: name ? `Welcome back, ${name}` : 'Welcome back', lang: 'en' }];
    return [{ text: 'Welcome back,', lang: 'en' }, { text: name, lang: 'ar' }];
  }
  if (!name) return [{ text: 'أهلاً بيك في ضغطة', lang: 'ar' }];
  if (arabic(name)) return [{ text: `أهلاً يا ${name}، نوّرت ضغطة`, lang: 'ar' }];
  return [{ text: 'أهلاً يا', lang: 'ar' }, { text: name, lang: 'en' }, { text: 'نوّرت ضغطة', lang: 'ar' }];
}

// ---- web voices (they load a moment after the page opens)
let webVoices: SpeechSynthesisVoice[] = [];
export function loadWebVoices() {
  if (Platform.OS !== 'web' || typeof window === 'undefined' || !window.speechSynthesis) return;
  const load = () => { webVoices = window.speechSynthesis.getVoices(); };
  load();
  window.speechSynthesis.addEventListener?.('voiceschanged', load);
}
function webVoice(lang: 'ar' | 'en') {
  const want = lang === 'ar' ? ['ar-EG', 'ar-SA', 'ar'] : ['en-US', 'en-GB', 'en'];
  for (const w of want) {
    const v = webVoices.find((x) => x.lang.replace('_', '-').toLowerCase().startsWith(w.toLowerCase()));
    if (v) return v;
  }
  return undefined;
}

/** Say it. On the web this must run inside a tap. `onStart` runs when the voice really starts. */
export function speakGreeting(parts: { text: string; lang: 'ar' | 'en' }[], onStart?: () => void) {
  if (Platform.OS === 'web') {
    const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined;
    if (!synth) return;
    synth.cancel();
    if (!webVoices.length) webVoices = synth.getVoices();
    parts.forEach((p, i) => {
      const u = new SpeechSynthesisUtterance(p.text);
      const v = webVoice(p.lang);
      if (v) u.voice = v;
      u.lang = v?.lang ?? (p.lang === 'ar' ? 'ar-SA' : 'en-US');
      u.rate = 0.95;
      if (i === 0 && onStart) u.onstart = onStart;
      synth.speak(u);
    });
    // iPhone sometimes leaves speech paused
    try { synth.resume(); } catch { /* fine */ }
    return;
  }
  Speech.stop();
  parts.forEach((p, i) => Speech.speak(p.text, { language: p.lang === 'ar' ? 'ar-SA' : 'en-US', rate: 0.95, onStart: i === 0 ? onStart : undefined }));
}

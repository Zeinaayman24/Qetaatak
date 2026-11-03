import { Platform } from 'react-native';
import { EN } from './i18n.en';

/**
 * Arabic is the source language: every visible string is written in Arabic and wrapped in t().
 * In English, t() looks the Arabic up in EN (src/lib/i18n.en.ts) and falls back to the Arabic.
 * Placeholders are {0}, {1}… so word order can change between languages.
 *
 * The language is read once at start (web: localStorage, synchronously, before any screen renders)
 * and changing it reloads the app, so every screen and every label is built in one language.
 */
export type Lang = 'ar' | 'en';
const KEY = 'daghta-lang';

function initial(): Lang {
  try {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      const v = localStorage.getItem(KEY);
      if (v === 'en' || v === 'ar') return v;
    }
  } catch { /* storage blocked: stay Arabic */ }
  return 'ar';
}

export let lang: Lang = initial();
export const isEn = () => lang === 'en';
export const dir = () => (lang === 'en' ? 'ltr' : 'rtl');
/** The side text starts on: right in Arabic, left in English. */
export const startAlign = (): 'left' | 'right' => (lang === 'en' ? 'left' : 'right');
/** Arrows and chevrons point the other way in English. */
const FLIP: Record<string, string> = {
  'chevron-back': 'chevron-forward', 'chevron-forward': 'chevron-back', 'arrow-back': 'arrow-forward', 'arrow-forward': 'arrow-back',
  'chevron-back-outline': 'chevron-forward-outline', 'chevron-forward-outline': 'chevron-back-outline',
};
export const flipIcon = (name: string) => (lang === 'en' ? FLIP[name] ?? name : name);

/** Translate an Arabic source string; extra arguments fill {0}, {1}… */
export function t(s: string, ...args: (string | number | null | undefined)[]): string {
  const out = lang === 'en' ? EN[s] ?? s : s;
  return args.length ? out.replace(/\{(\d+)\}/g, (_, i) => String(args[Number(i)] ?? '')) : out;
}

/** Save the language and restart the app in it. */
export async function setLang(next: Lang) {
  if (next === lang) return;
  try {
    if (Platform.OS === 'web') localStorage.setItem(KEY, next);
    else {
      const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
      await AsyncStorage.setItem(KEY, next);
    }
  } catch { /* ignore */ }
  lang = next;
  if (Platform.OS === 'web' && typeof window !== 'undefined') window.location.reload();
  else {
    const { I18nManager, DevSettings } = await import('react-native');
    I18nManager.allowRTL(next === 'ar');
    I18nManager.forceRTL(next === 'ar');
    DevSettings.reload();
  }
}

/** Native apps: read the saved language before the first screen (call from the root layout). */
export async function loadLang(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
    const v = await AsyncStorage.getItem(KEY);
    if (v === 'en' || v === 'ar') lang = v;
  } catch { /* stay Arabic */ }
}

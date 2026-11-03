import { Platform } from 'react-native';
// ضغطة (Daghta) design tokens.
// Deep navy carries the brand and the text; sky blue is the call to action; lime marks a "tap" / success moment.
// Taken from the brand mark (gear + pressing finger + speed lines).
export const brand = {
  navy: '#041D3F',
  sky: '#0AABFE',
  lime: '#7CD035',
};

export const colors = {
  ground: '#F6F7F9',     // app background: a quiet, neutral grey
  surface: '#FFFFFF',    // cards, sheets, bars
  card: '#FFFFFF',
  soft: '#F2F4F7',       // tags, inner wells
  ink: '#041D3F',        // the logo's navy: text, headings, strong surfaces
  muted: '#5B6676',      // secondary text (passes AA on white)
  faint: '#6B7484',      // hints and inactive icons (passes AA on white)
  line: '#E6E9EE',       // hairlines and card borders
  brand: '#041D3F',
  brandInk: '#FFFFFF',
  primary: '#006BB3',    // the logo's sky, deepened so white text reads on it: the one action colour: main buttons, links, selection
  primaryInk: '#FFFFFF',
  primarySoft: '#EAF4FB',
  accent: '#006BB3',     // kept for older screens: same as the action colour
  sky: '#0AABFE',        // the logo's sky: small touches only (selected tab, new dot, progress), never text on white
  accentDeep: '#00588F',
  accentInk: '#FFFFFF',
  accentSoft: '#EAF4FB',
  lime: '#12805C',       // retired: older screens fall back to the "good" green
  good: '#12805C',       // ready, done, guarantee
  goodSoft: '#E7F5EF',
  bad: '#C4321F',        // refuse, error, delete
  badSoft: '#FBE9E7',
  warn: '#8A4B00',       // preparing, waiting
  warnSoft: '#FDF1E2',
  plate: '#7DB4EA',      // the light-blue band of an Egyptian private-car plate
  shadow: '#041D3F',
};

// Arabic text: Times New Roman where the device has it (Windows, Mac, iPhone), otherwise Noto Naskh Arabic,
// the closest free match (Times New Roman itself can't be shipped inside the app, and Android doesn't have it).
const naskh = { regular: 'NotoNaskhArabic_400Regular', medium: 'NotoNaskhArabic_500Medium', semibold: 'NotoNaskhArabic_600SemiBold', bold: 'NotoNaskhArabic_700Bold' };
const stack = (f: string) => (Platform.OS === 'web' ? `"Times New Roman", ${f}, serif` : f);
export const fonts = {
  regular: stack(naskh.regular),
  medium: stack(naskh.medium),
  semibold: stack(naskh.semibold),
  bold: stack(naskh.bold),
  display: stack(naskh.bold),
};
/** Times New Roman only has regular and bold, so the browser needs the weight too. */
export const fontWeights = { regular: '400', medium: '500', semibold: '600', bold: '700', display: '700' } as const;

export const radius = { sm: 10, md: 14, lg: 16, xl: 20, pill: 999 };

/** Soft lift for cards and floating bars. */
/** Cards sit on a hairline border with only a whisper of shadow (flat, modern). */
export const lift = {
  borderWidth: 1, borderColor: colors.line,
} as const;
/** Floating things (tab bar, sheets, toasts) get a real shadow. */
export const liftStrong = {
  shadowColor: colors.shadow, shadowOpacity: 0.12, shadowRadius: 22, shadowOffset: { width: 0, height: 8 }, elevation: 8,
} as const;

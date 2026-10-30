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
  ground: '#F4F7FB',     // app background: a cool, almost white blue
  surface: '#FFFFFF',    // cards, sheets, bars
  card: '#FFFFFF',
  soft: '#F0F4F9',       // inputs, chips, inner wells
  ink: '#041D3F',        // navy: text, headers, strong surfaces
  muted: '#55627A',
  faint: '#8F9BB0',
  line: '#E3E9F1',       // hairlines and card borders
  brand: '#041D3F',
  brandInk: '#FFFFFF',
  primary: '#0077D6',    // the action blue: main buttons, links, selection (white text passes AA)
  primaryInk: '#FFFFFF',
  primarySoft: '#E8F3FD',
  accent: '#0AABFE',     // the logo's sky blue: highlights, progress, badges
  accentDeep: '#0071B8', // sky that reads on white
  accentInk: '#041D3F',
  accentSoft: '#E2F4FF',
  lime: '#7CD035',       // the "tap" green from the logo
  good: '#2B7F0E',
  goodSoft: '#EAF7DF',
  bad: '#D93F45',
  badSoft: '#FDECEC',
  warn: '#8A5A00',
  warnSoft: '#FFF4DC',
  plate: '#7DB4EA',      // the light-blue band of an Egyptian private-car plate
  shadow: '#0B2545',
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

export const radius = { sm: 10, md: 12, lg: 16, xl: 22, pill: 999 };

/** Soft lift for cards and floating bars. */
/** Cards sit on a hairline border with only a whisper of shadow (flat, modern). */
export const lift = {
  borderWidth: 1, borderColor: colors.line,
  shadowColor: colors.shadow, shadowOpacity: 0.04, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 1,
} as const;
/** Floating things (tab bar, sheets, toasts) get a real shadow. */
export const liftStrong = {
  shadowColor: colors.shadow, shadowOpacity: 0.12, shadowRadius: 22, shadowOffset: { width: 0, height: 8 }, elevation: 8,
} as const;

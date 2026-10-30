// ضغطة (Daghta) design tokens.
// Deep navy carries the brand and the text; sky blue is the call to action; lime marks a "tap" / success moment.
// Taken from the brand mark (gear + pressing finger + speed lines).
export const brand = {
  navy: '#041D3F',
  sky: '#0AABFE',
  lime: '#7CD035',
};

export const colors = {
  ground: '#F3F6FA',     // app background
  surface: '#FFFFFF',    // cards, sheets, bars
  card: '#FFFFFF',       // filled blocks sit on the ground as white cards
  soft: '#EAF0F7',       // inputs, chips, inner wells
  ink: '#041D3F',        // navy: text and primary buttons
  muted: '#55627A',
  faint: '#93A0B5',
  line: '#E1E8F0',
  brand: '#041D3F',
  brandInk: '#FFFFFF',
  accent: '#0AABFE',     // sky blue
  accentDeep: '#0071B8', // sky that reads on white
  accentInk: '#041D3F',
  accentSoft: '#E2F4FF',
  good: '#2B7F0E',
  goodSoft: '#EAF7DF',
  bad: '#D93F45',
  badSoft: '#FDECEC',
  plate: '#7DB4EA',      // the light-blue band of an Egyptian private-car plate
  shadow: '#041D3F',
};

export const fonts = {
  regular: 'ReadexPro_400Regular',
  medium: 'ReadexPro_500Medium',
  semibold: 'ReadexPro_600SemiBold',
  bold: 'ReadexPro_700Bold',
  display: 'ReadexPro_700Bold',
};

export const radius = { sm: 10, md: 14, lg: 20, xl: 28, pill: 999 };

/** Soft lift for cards and floating bars. */
export const lift = {
  shadowColor: colors.shadow, shadowOpacity: 0.07, shadowRadius: 18, shadowOffset: { width: 0, height: 6 }, elevation: 3,
} as const;
export const liftStrong = {
  shadowColor: colors.shadow, shadowOpacity: 0.14, shadowRadius: 24, shadowOffset: { width: 0, height: 10 }, elevation: 8,
} as const;

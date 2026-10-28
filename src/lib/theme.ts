// Qetaatak design tokens.
// Asphalt ink on a cool light ground; signal orange is the brand and the call to action.
// The Egyptian licence plate is the one signature element (cars and order numbers wear it).
export const colors = {
  ground: '#F2F3F6',     // app background
  surface: '#FFFFFF',    // cards, sheets, bars
  card: '#FFFFFF',       // filled blocks sit on the ground as white cards
  soft: '#EEF0F4',       // inputs, chips, inner wells
  ink: '#1C2230',        // asphalt: text and primary buttons
  muted: '#5F6676',
  faint: '#99A0AD',
  line: '#E5E8EE',
  brand: '#1C2230',
  brandInk: '#FFFFFF',
  accent: '#FF8A1E',     // signal orange
  accentDeep: '#E56F00',
  accentInk: '#1C2230',
  accentSoft: '#FFF0E0',
  good: '#12925A',
  goodSoft: '#E3F5EB',
  bad: '#D93F45',
  badSoft: '#FDECEC',
  plate: '#7DB4EA',      // the light-blue band of an Egyptian private-car plate
  shadow: '#1C2230',
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

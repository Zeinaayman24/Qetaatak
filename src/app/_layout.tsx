import { NotoNaskhArabic_400Regular } from '@expo-google-fonts/noto-naskh-arabic/400Regular';
import { NotoNaskhArabic_500Medium } from '@expo-google-fonts/noto-naskh-arabic/500Medium';
import { NotoNaskhArabic_600SemiBold } from '@expo-google-fonts/noto-naskh-arabic/600SemiBold';
import { NotoNaskhArabic_700Bold } from '@expo-google-fonts/noto-naskh-arabic/700Bold';
import { Alexandria_900Black } from '@expo-google-fonts/alexandria/900Black';
import { useFonts } from 'expo-font';
import { Slot } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { I18nManager, Platform, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from '@/lib/auth';
import { LockGate } from '@/components/LockGate';
import { colors } from '@/lib/theme';
import { dir, lang, loadLang } from '@/lib/i18n';

// Arabic-first, right to left; English (chosen in the account page) lays out left to right.
if (Platform.OS !== 'web' && I18nManager.isRTL !== (dir() === 'rtl')) {
  I18nManager.allowRTL(dir() === 'rtl');
  I18nManager.forceRTL(dir() === 'rtl');
}

export default function RootLayout() {
  const [loaded] = useFonts({
    NotoNaskhArabic_400Regular, NotoNaskhArabic_500Medium, NotoNaskhArabic_600SemiBold, NotoNaskhArabic_700Bold, Alexandria_900Black,
  });

  // don't hold the whole app on the fonts: show it after at most 1.2 s, the fonts swap in when ready
  const [waited, setWaited] = useState(false);
  // native apps read the saved language before the first screen
  const [langReady, setLangReady] = useState(Platform.OS === 'web');
  useEffect(() => { if (!langReady) loadLang().finally(() => setLangReady(true)); }, [langReady]);
  useEffect(() => { const t = setTimeout(() => setWaited(true), 1200); return () => clearTimeout(t); }, []);

  useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      document.documentElement.dir = dir();
      document.documentElement.lang = lang;
      document.title = lang === 'en' ? 'Daghta' : 'ضغطة';
      document.body.style.backgroundColor = colors.ground;
    }
  }, []);

  if ((!loaded && !waited) || !langReady) return <View style={{ flex: 1, backgroundColor: colors.ground }} />;

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="dark" />
        <View style={{ flex: 1, direction: dir(), backgroundColor: colors.ground }}>
          <LockGate><Slot /></LockGate>
        </View>
      </AuthProvider>
    </SafeAreaProvider>
  );
}

import { NotoNaskhArabic_400Regular } from '@expo-google-fonts/noto-naskh-arabic/400Regular';
import { NotoNaskhArabic_500Medium } from '@expo-google-fonts/noto-naskh-arabic/500Medium';
import { NotoNaskhArabic_600SemiBold } from '@expo-google-fonts/noto-naskh-arabic/600SemiBold';
import { NotoNaskhArabic_700Bold } from '@expo-google-fonts/noto-naskh-arabic/700Bold';
import { Alexandria_900Black } from '@expo-google-fonts/alexandria/900Black';
import { useFonts } from 'expo-font';
import { Slot } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { I18nManager, Platform, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from '@/lib/auth';
import { colors } from '@/lib/theme';

// The app is Arabic-first: lay everything out right to left.
if (Platform.OS !== 'web' && !I18nManager.isRTL) {
  I18nManager.allowRTL(true);
  I18nManager.forceRTL(true);
}

export default function RootLayout() {
  const [loaded] = useFonts({
    NotoNaskhArabic_400Regular, NotoNaskhArabic_500Medium, NotoNaskhArabic_600SemiBold, NotoNaskhArabic_700Bold, Alexandria_900Black,
  });

  useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      document.documentElement.dir = 'rtl';
      document.documentElement.lang = 'ar';
      document.title = 'ضغطة';
      document.body.style.backgroundColor = colors.ground;
    }
  }, []);

  if (!loaded) return <View style={{ flex: 1, backgroundColor: colors.ground }} />;

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="dark" />
        <View style={{ flex: 1, direction: 'rtl', backgroundColor: colors.ground }}>
          <Slot />
        </View>
      </AuthProvider>
    </SafeAreaProvider>
  );
}

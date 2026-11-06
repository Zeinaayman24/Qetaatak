import { useEffect, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { Mark } from './Brand';
import { T } from './ui';
import { brand } from '@/lib/theme';
import { t } from '@/lib/i18n';

/**
 * iPhone home-screen apps can't be locked upright, so on phones turned sideways we cover the app
 * with a short note until the phone is upright again. Phones only: tablets and computers are left alone.
 */
export function RotateNotice() {
  const [side, setSide] = useState(false);
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const phone = Math.min(window.screen.width, window.screen.height) < 500 && window.matchMedia('(pointer: coarse)').matches;
    if (!phone) return;
    const check = () => setSide(window.innerWidth > window.innerHeight);
    check();
    window.addEventListener('resize', check);
    window.addEventListener('orientationchange', check);
    return () => { window.removeEventListener('resize', check); window.removeEventListener('orientationchange', check); };
  }, []);
  if (!side) return null;
  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 2000, backgroundColor: brand.navy, alignItems: 'center', justifyContent: 'center', gap: 18 }]}>
      <Mark size={84} />
      <T w="bold" size={20} color="#FFFFFF">{t('لف الموبايل')}</T>
      <T size={15} color="rgba(255,255,255,.72)">{t('ضغطة شغّال والموبايل واقف')}</T>
    </View>
  );
}

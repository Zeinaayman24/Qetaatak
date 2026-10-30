import { useEffect, useState } from 'react';
import { Platform, View } from 'react-native';
import { colors, radius } from '@/lib/theme';
import { AppIcon } from './Brand';
import { Btn, Icon, Muted, Press, Row, T } from './ui';

let deferred: any = null; // Chrome's install prompt, kept for when the person taps "install"
if (Platform.OS === 'web' && typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e: any) => { e.preventDefault(); deferred = e; });
}

/**
 * "Put ضغطة on your phone": on Android/desktop Chrome it opens the install prompt;
 * on iPhone it shows the Share → Add to Home Screen steps. Hidden inside the installed app and on native builds.
 */
export function InstallCard() {
  const [hidden, setHidden] = useState(true);
  const [ios, setIos] = useState(false);
  const [steps, setSteps] = useState(false);
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const standalone = window.matchMedia?.('(display-mode: standalone)').matches || (navigator as any).standalone;
    let dismissed = false;
    try { dismissed = localStorage.getItem('daghta-install-dismissed') === '1'; } catch { /* storage blocked */ }
    setIos(/iphone|ipad|ipod/i.test(navigator.userAgent));
    setHidden(!!standalone || dismissed);
  }, []);
  if (hidden) return null;

  async function install() {
    if (deferred) { deferred.prompt(); const r = await deferred.userChoice.catch(() => null); deferred = null; if (r?.outcome === 'accepted') setHidden(true); return; }
    setSteps(true);
  }
  function close() {
    setHidden(true);
    try { localStorage.setItem('daghta-install-dismissed', '1'); } catch { /* storage blocked */ }
  }

  return (
    <View style={{ backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: 14, gap: 12 }}>
      <Row gap={12}>
        <AppIcon size={48} />
        <View style={{ flex: 1 }}>
          <T w="bold" size={15}>نزّل ضغطة على موبايلك</T>
          <Muted size={12.5}>أيقونة على الشاشة، تفتح على طول من غير المتصفح</Muted>
        </View>
        <Press onPress={close} label="اقفل" hitSlop={8}><Icon name="close" size={18} color={colors.faint} /></Press>
      </Row>
      {steps || (ios && !deferred) ? (
        <View style={{ gap: 6, backgroundColor: colors.soft, borderRadius: radius.md, padding: 12 }}>
          {ios ? (
            <>
              <T size={13.5}>١- افتح الموقع من Safari</T>
              <T size={13.5}>٢- دوس على زرار المشاركة (المربع اللي فيه سهم لفوق)</T>
              <T size={13.5}>٣- اختار «Add to Home Screen» أو «إضافة إلى الشاشة الرئيسية»</T>
            </>
          ) : (
            <>
              <T size={13.5}>١- افتح قائمة المتصفح (⋮ فوق)</T>
              <T size={13.5}>٢- اختار «Install app» أو «تثبيت التطبيق»</T>
            </>
          )}
        </View>
      ) : (
        <Btn icon="arrow-up" title="ثبّت التطبيق" onPress={install} />
      )}
    </View>
  );
}

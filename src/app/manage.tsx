import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { Muted, Screen, T, Title } from '@/components/ui';

/**
 * The management system is a separate site at /Qetaatak/manage/.
 * If someone lands on this app at /manage (for example a link without the trailing slash, or before
 * the management site finished deploying), send them there once; if it still isn't there, explain.
 */
export default function ManageRedirect() {
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const key = 'qt-manage-redirect';
    let tried = false;
    try { tried = sessionStorage.getItem(key) === '1'; sessionStorage.setItem(key, '1'); } catch {}
    if (tried) { setStuck(true); try { sessionStorage.removeItem(key); } catch {} return; }
    window.location.replace(window.location.origin + '/Qetaatak/manage/');
  }, []);
  return (
    <Screen>
      <Title sub={stuck ? 'نظام الإدارة لسه بيتنشر أو النشر فشل. استنى دقيقتين وجرّب تاني.' : undefined}>
        {stuck ? 'نظام الإدارة مش جاهز لسه' : 'بنفتح نظام الإدارة…'}
      </Title>
      {stuck ? <Muted>العنوان: zeinaayman24.github.io/Qetaatak/manage/</Muted> : <T> </T>}
    </Screen>
  );
}

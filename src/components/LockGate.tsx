import { useEffect, useState, type ReactNode } from 'react';
import { AppState, Pressable, View } from 'react-native';
import { Logo } from './Brand';
import { Muted, T } from './ui';
import { useAuth } from '@/lib/auth';
import { t } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';

/**
 * When the app is locked (app_settings.app_locked = 'on'), customers and shops are signed out and see a
 * "closed for now" screen. Staff are not affected. The server also refuses new sign-ins and sign-ups
 * while locked, so this screen is the friendly face of a real lock (migration app_lock).
 */
export function LockGate({ children }: { children: ReactNode }) {
  const { session, profile, signOut } = useAuth();
  const [locked, setLocked] = useState(false);
  const [team, setTeam] = useState(false);  // the team can still open the sign-in page; the server only lets staff in

  useEffect(() => {
    let live = true;
    const check = () => supabase.rpc('app_locked').then(({ data, error }) => { if (live && !error) setLocked(data === true); });
    check();
    const timer = setInterval(check, 60000);
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') check(); });
    return () => { live = false; clearInterval(timer); sub.remove(); };
  }, []);

  const p = profile as (typeof profile & { is_support?: boolean; staff_role?: string | null }) | null;
  const staff = !!p && (p.is_admin || p.is_support || !!p.staff_role);

  useEffect(() => {
    if (locked && session && profile && !staff) signOut().catch(() => {});
  }, [locked, session, profile, staff, signOut]);

  if (!locked || staff || (team && !session)) return <>{children}</>;
  return (
    <View style={{ flex: 1, backgroundColor: colors.ground, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16 }}>
      <Logo size={28} />
      <T w="bold" size={22} center>{t('ضغطة مقفولة مؤقتًا')}</T>
      <Muted size={15} center style={{ maxWidth: 360 }}>{t('بنجهّز حاجات جديدة. هنفتح قريب، وهتقدر تدخل بنفس حسابك.')}</Muted>
      <Pressable onPress={() => setTeam(true)} accessibilityRole="button" style={{ padding: 8, marginTop: 24 }}>
        <Muted size={12}>{t('دخول فريق ضغطة')}</Muted>
      </Pressable>
    </View>
  );
}

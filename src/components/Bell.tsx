import { router } from 'expo-router';
import { Pressable, View } from 'react-native';
import { useAuth } from '@/lib/auth';
import { ar } from '@/lib/data';
import { useLive } from '@/lib/live';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';
import { Icon, T } from './ui';

/** Bell with the unread count; opens the notifications screen. */
export function Bell({ light }: { light?: boolean } = {}) {
  const { session } = useAuth();
  const uid = session?.user.id;
  const { data } = useLive(async () => {
    if (!uid) return 0;
    const { count } = await supabase.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', uid).is('read_at', null).not('link', 'like', '/chat/%');
    return count ?? 0;
  }, ['notifications'], [uid]);
  const n = data ?? 0;
  return (
    <Pressable onPress={() => router.push('/notifications')} accessibilityRole="button" accessibilityLabel={n ? `${n} إشعارات جديدة` : 'الإشعارات'} hitSlop={8}
      style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: light ? 'rgba(255,255,255,.28)' : colors.surface, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name="notifications-outline" size={21} />
      {n ? (
        <View style={{ position: 'absolute', top: -2, right: -2, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4, backgroundColor: light ? colors.ink : colors.accent, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: light ? colors.accent : colors.surface }}>
          <T size={10} w="bold" color={light ? '#fff' : colors.ink} style={{ lineHeight: 13 }}>{n > 9 ? '+٩' : ar(n)}</T>
        </View>
      ) : null}
    </Pressable>
  );
}

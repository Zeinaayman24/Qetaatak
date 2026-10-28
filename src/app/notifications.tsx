import { Redirect, router } from 'expo-router';
import { useEffect } from 'react';
import { Pressable, View } from 'react-native';
import { BackBar, Btn, Empty, Icon, Loading, Muted, Screen, T } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { ago, type Notification } from '@/lib/data';
import { must, useLive } from '@/lib/live';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';

export default function Notifications() {
  const { ready, session } = useAuth();
  const uid = session?.user.id;
  const { data, loading } = useLive(async () => {
    if (!uid) return [] as Notification[];
    return must(await supabase.from('notifications').select('*').eq('user_id', uid).order('created_at', { ascending: false }).limit(60)) as Notification[];
  }, ['notifications'], [uid]);

  // opening the list marks everything as read (a moment later, so the new ones still show highlighted)
  useEffect(() => {
    if (!uid) return;
    const t = setTimeout(() => { supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('user_id', uid).is('read_at', null).then(() => {}); }, 1500);
    return () => clearTimeout(t);
  }, [uid]);

  if (ready && !session) return <Redirect href="/login" />;
  const list = data ?? [];
  return (
    <Screen>
      <BackBar title="الإشعارات" onBack={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
      {loading && !data ? <Loading /> : list.length ? (
        <View>
          {list.map((n, i) => (
            <Pressable key={n.id} onPress={() => n.link && router.push(n.link as any)} accessibilityRole="button"
              style={({ pressed }) => [{ flexDirection: 'row', gap: 12, paddingVertical: 14, alignItems: 'flex-start' }, i < list.length - 1 && { borderBottomWidth: 1, borderColor: colors.line }, pressed && { opacity: 0.6 }]}>
              <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: n.read_at ? colors.card : colors.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="notifications-outline" size={19} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <T w={n.read_at ? 'medium' : 'bold'}>{n.title}</T>
                {n.body ? <Muted numberOfLines={2}>{n.body}</Muted> : null}
                <Muted size={11.5} style={{ color: colors.faint }}>{ago(n.created_at)}</Muted>
              </View>
              {!n.read_at ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent, marginTop: 8 }} /> : null}
            </Pressable>
          ))}
          <Btn kind="link" title="امسح الكل" style={{ alignSelf: 'center', marginTop: 12 }}
            onPress={async () => { await supabase.from('notifications').delete().eq('user_id', uid!); }} />
        </View>
      ) : <Empty icon="notifications-outline" text="مفيش إشعارات لسه." />}
    </Screen>
  );
}

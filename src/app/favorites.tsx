import { Redirect, router } from 'expo-router';
import { View } from 'react-native';
import { BottomNav } from '@/components/AppHeader';
import { BackBar, Empty, Icon, ListRow, Loading, Screen } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { SHOP_TYPES, type Shop } from '@/lib/data';
import { must, useLive } from '@/lib/live';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';

export default function Favorites() {
  const { ready, session } = useAuth();
  const uid = session?.user.id;
  const { data, loading } = useLive(async () => {
    if (!uid) return [] as (Shop & { name?: string })[];
    const favs = must(await supabase.from('favorites').select('shop_id').eq('customer_id', uid)) as { shop_id: string }[];
    if (!favs.length) return [] as (Shop & { name?: string })[];
    const ids = favs.map((f) => f.shop_id);
    const shops = must(await supabase.from('shops').select('*').in('id', ids)) as Shop[];
    const names = Object.fromEntries((((await supabase.rpc('shop_cards', { p_shops: ids })).data ?? []) as { id: string; name: string }[]).map((c) => [c.id, c.name]));
    return shops.map((s) => ({ ...s, name: names[s.id] as string | undefined }));
  }, ['shops'], [uid]);

  if (ready && !session) return <Redirect href="/login" />;
  const list = data ?? [];
  return (
    <Screen nav={<BottomNav role="customer" />}>
      <BackBar title="المحلات المفضلة" onBack={() => (router.canGoBack() ? router.back() : router.replace('/account'))} />
      {loading && !data ? <Loading /> : list.length ? (
        <View>
          {list.map((s, i) => (
            <ListRow key={s.id} last={i === list.length - 1} onPress={() => router.push(`/shop-profile/${s.id}`)}
              leading={<View style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' }}><Icon name="storefront-outline" size={22} /></View>}
              title={s.name ?? 'محل في ' + s.area}
              subtitle={`${s.area}، ${s.governorate}، ${SHOP_TYPES[s.shop_type]}`}
              meta={s.brands.join('، ')} />
          ))}
        </View>
      ) : <Empty icon="heart-outline" text={'لسه مفيش محلات مفضلة.\nافتح صفحة أي محل من العروض واضغط على القلب.'} />}
    </Screen>
  );
}

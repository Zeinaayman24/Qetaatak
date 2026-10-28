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
    if (!uid) return [] as Shop[];
    const favs = must(await supabase.from('favorites').select('shop_id').eq('customer_id', uid)) as { shop_id: string }[];
    if (!favs.length) return [] as Shop[];
    return must(await supabase.from('shops').select('*').in('id', favs.map((f) => f.shop_id))) as Shop[];
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
              title={'محل في ' + s.area}
              subtitle={`${s.governorate} · ${SHOP_TYPES[s.shop_type]}`}
              meta={s.brands.join('، ')} />
          ))}
        </View>
      ) : <Empty icon="heart-outline" text={'لسه مفيش محلات مفضلة.\nافتح صفحة أي محل من العروض واضغط على القلب.'} />}
    </Screen>
  );
}

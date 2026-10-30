import { isFeatured } from '@/components/AdBanner';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { Pressable, View } from 'react-native';
import { BackBar, Chips, Empty, Icon, Loading, Muted, Pill, Row, Screen, Section, Stats, T, toast } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { SHOP_TYPES, ago, ar, friendlyError } from '@/lib/data';
import { must, useLive } from '@/lib/live';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';

type Profile = {
  shop: { id: string; area: string; governorate: string; shop_type: string; specialties: string[]; brands: string[]; offers_delivery: boolean; since: string } | null;
  sales: number; rating: number | null; ratings: number;
  reviews: { rating: number; review: string; part: string; at: string; first_name: string }[];
};

/** A shop's public page: what it sells, how it's rated, and reviews. Its name stays hidden until a customer buys from it. */
export default function ShopProfile() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { ready, session, profile } = useAuth();
  const uid = session?.user.id;
  const { data, loading, reload } = useLive(async () => {
    const p = must(await supabase.rpc('shop_profile', { p_shop: id })) as Profile;
    const fav = uid ? ((must(await supabase.from('favorites').select('shop_id').eq('customer_id', uid).eq('shop_id', id)) as unknown[]).length > 0) : false;
    const featured = (await supabase.from('shops').select('featured_until').eq('id', id).maybeSingle()).data?.featured_until ?? null;
    return { p, fav, featured };
  }, ['requests'], [id, uid]);

  if (ready && !session) return <Redirect href="/login" />;
  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));
  if (loading && !data) return <Screen><Loading /></Screen>;
  const p = data?.p;
  if (!p?.shop) return <Screen><BackBar title="المحل" onBack={back} /><Empty text="المحل ده مش متاح." /></Screen>;
  const s = p.shop;

  async function toggleFav() {
    const { error } = data!.fav
      ? await supabase.from('favorites').delete().eq('customer_id', uid!).eq('shop_id', id)
      : await supabase.from('favorites').insert({ shop_id: id });
    if (error) toast(friendlyError(error)); else { toast(data!.fav ? 'اتشال من المفضلة' : 'اتضاف للمفضلة'); reload(); }
  }

  return (
    <Screen>
      <BackBar title="المحل" onBack={back} />
      <Row gap={14} style={{ alignItems: 'flex-start' }}>
        <View style={{ width: 64, height: 64, borderRadius: 20, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="storefront" size={30} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <T w="bold" size={20}>محل في {s.area}</T>
          {isFeatured({ featured_until: data?.featured }) ? <Pill label="محل مميز" icon="star" tone="wait" /> : null}
          <Muted>{s.governorate}، {SHOP_TYPES[s.shop_type]}</Muted>
          <Row gap={6} style={{ marginTop: 4, flexWrap: 'wrap' }}>
            <Pill label={s.offers_delivery ? 'بيوصّل' : 'استلام من المحل'} />
            <Pill label="محل متراجع ✓" tone="good" />
          </Row>
        </View>
        {profile?.is_customer ? (
          <Pressable onPress={toggleFav} accessibilityLabel={data!.fav ? 'شيل من المفضلة' : 'أضف للمفضلة'} hitSlop={8}
            style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name={data!.fav ? 'heart' : 'heart-outline'} size={22} color={data!.fav ? colors.bad : colors.ink} />
          </Pressable>
        ) : null}
      </Row>

      <Stats items={[
        [p.rating ? ar(p.rating) + ' ★' : '—', p.ratings ? ar(p.ratings) + ' تقييم' : 'لسه مفيش تقييم'],
        [ar(p.sales), 'قطعة اتباعت'],
        [ago(s.since).replace('من ', ''), 'على ضغطة'],
      ]} />

      <Section title="التخصص">
        <View style={{ marginTop: 6 }}><Chips options={s.specialties.map((x) => ({ v: x, label: x }))} selected={[]} onPick={() => {}} /></View>
      </Section>
      <Section title="الماركات">
        <View style={{ marginTop: 6 }}><Chips options={s.brands.map((x) => ({ v: x, label: x }))} selected={[]} onPick={() => {}} /></View>
      </Section>

      <Section title="آراء العملاء">
        {p.reviews.length ? p.reviews.map((rv, i) => (
          <View key={i} style={[{ paddingVertical: 14, gap: 4 }, i < p.reviews.length - 1 && { borderBottomWidth: 1, borderColor: colors.line }]}>
            <Row style={{ justifyContent: 'space-between' }}>
              <T w="semibold" size={14}>{rv.first_name || 'عميل'}</T>
              <Row gap={2}>{[1, 2, 3, 4, 5].map((n) => <Icon key={n} name="star" size={13} color={rv.rating >= n ? colors.accent : colors.line} />)}</Row>
            </Row>
            {rv.review ? <T size={14}>{rv.review}</T> : null}
            <Muted size={12}>{rv.part}{rv.at ? '، ' + ago(rv.at) : ''}</Muted>
          </View>
        )) : <Empty text="لسه مفيش آراء." />}
      </Section>
    </Screen>
  );
}

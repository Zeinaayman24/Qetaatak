import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { Image, Linking, Platform, Pressable, ScrollView, View } from 'react-native';
import { MAP_AVAILABLE, ShopMap } from '@/components/ShopMap';
import { BackBar, Btn, Chips, Empty, Icon, Loading, Muted, Pill, Row, Screen, Section, Stats, T, toast } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { SHOP_TYPES, ago, ar, friendlyError, money, replyLabel, sinceShort } from '@/lib/data';
import { t } from '@/lib/i18n';
import { must, useLive } from '@/lib/live';
import { dayName, directionsUrl, hourLabel, kmLabel, openNow, serviceKind, serviceName, useInstallServices, type NearShop } from '@/lib/shops';
import { photoUrl, supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';

type Legacy = {
  shop: { id: string; area: string; governorate: string; shop_type: string; specialties: string[]; brands: string[]; offers_delivery: boolean; since: string; name?: string; reply_min?: number | null; photo_path?: string | null } | null;
  sales: number; rating: number | null; ratings: number;
};
type Review = { rating: number; review: string; part: string; at: string | null; first_name: string; kind: 'part' | 'install' };
type Offer = { service_id: string; price_from: number | null; price_to: number | null; needs_inspection: boolean; minutes: number | null; note: string };

function savedLoc(): { lat: number; lng: number } | null {
  try { return Platform.OS === 'web' ? JSON.parse(localStorage.getItem('daghta-near-loc') || 'null') : null; } catch { return null; }
}

/** A shop's public page: who it is, how to reach it, what it sells and installs, its hours, and verified reviews. */
export default function ShopProfile() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { ready, session, profile } = useAuth();
  const uid = session?.user.id;
  const services = useInstallServices(true);
  const { data, loading, reload } = useLive(async () => {
    const me = savedLoc();
    const [near, legacy, reviews, offers, fav] = await Promise.all([
      supabase.rpc('shops_near', { p_lat: me?.lat ?? null, p_lng: me?.lng ?? null, p_shop: id }),
      supabase.rpc('shop_profile', { p_shop: id }),
      supabase.rpc('shop_reviews', { p_shop: id }),
      supabase.from('shop_install_services').select('service_id, price_from, price_to, needs_inspection, minutes, note').eq('shop_id', id),
      uid ? supabase.from('favorites').select('shop_id').eq('customer_id', uid).eq('shop_id', id) : Promise.resolve({ data: [], error: null }),
    ]);
    return {
      s: ((must(near) as NearShop[]) ?? [])[0] ?? null,
      legacy: (legacy.data ?? null) as Legacy | null,
      reviews: (reviews.data ?? []) as Review[],
      offers: (offers.data ?? []) as Offer[],
      fav: ((fav.data ?? []) as unknown[]).length > 0,
    };
  }, ['shops', 'shop_install_services'], [id, uid]);

  if (ready && !session) return <Redirect href="/login" />;
  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));
  if (loading && !data) return <Screen><Loading /></Screen>;
  const s = data?.s;
  const old = data?.legacy?.shop;
  if (!s && !old) return <Screen><BackBar title={t('المحل')} onBack={back} /><Empty text={t('المحل ده مش متاح.')} /></Screen>;

  async function toggleFav() {
    const { error } = data!.fav
      ? await supabase.from('favorites').delete().eq('customer_id', uid!).eq('shop_id', id)
      : await supabase.from('favorites').insert({ shop_id: id });
    if (error) toast(friendlyError(error)); else { toast(data!.fav ? t('اتشال من المفضلة') : t('اتضاف للمفضلة')); reload(); }
  }

  const name = s?.name ?? old?.name ?? t('محل في ') + (old?.area ?? '');
  const photo = s?.photo_path ?? old?.photo_path ?? null;
  const open = openNow(s?.hours);
  const reviews = data?.reviews ?? [];
  const offers = data?.offers ?? [];
  const svc = (sid: string) => services.find((x) => x.id === sid);
  const range = (o: Offer) => o.needs_inspection && o.price_from == null ? t('السعر بعد المعاينة')
    : o.price_from != null && o.price_to != null && o.price_to > o.price_from ? t('من {0} لـ {1} ج.م', money(o.price_from), money(o.price_to))
    : o.price_from != null ? t('من {0} ج.م', money(o.price_from)) : t('اسأل المحل');

  return (
    <Screen>
      <BackBar title={t('المحل')} onBack={back} />
      <Row gap={14} style={{ alignItems: 'flex-start' }}>
        <View style={{ width: 72, height: 72, borderRadius: 20, backgroundColor: colors.soft, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
          {photo ? <Image source={{ uri: photoUrl(photo)! }} style={{ width: 72, height: 72 }} accessibilityLabel={t('صورة المحل')} /> : <Icon name="storefront" size={30} />}
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <T w="bold" size={20}>{name}</T>
          <Muted size={13}>{[s?.area ?? old?.area, s?.governorate ?? old?.governorate, kmLabel(s?.km)].filter(Boolean).join(' · ')}</Muted>
          {old?.reply_min != null ? <Muted size={12.5}>{replyLabel(old.reply_min)}</Muted> : null}
          <Row gap={6} style={{ marginTop: 4, flexWrap: 'wrap' }}>
            <Pill label={t('موثّق من ضغطة')} tone="good" icon="shield-checkmark" />
            {s ? <Pill label={serviceKind(s)} tone={s.installs ? 'new' : 'plain'} /> : null}
            {s?.featured ? <Pill label={t('محل مميز')} icon="star" tone="wait" /> : null}
          </Row>
        </View>
        {profile?.is_customer && uid !== id ? (
          <Pressable onPress={toggleFav} accessibilityLabel={data!.fav ? t('شيل من المفضلة') : t('أضف للمفضلة')} hitSlop={8}
            style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name={data!.fav ? 'heart' : 'heart-outline'} size={22} color={data!.fav ? colors.bad : colors.ink} />
          </Pressable>
        ) : null}
      </Row>

      {s ? (
        <Row gap={8}>
          {s.phone ? <Btn icon="call-outline" title={t('اتصل')} onPress={() => Linking.openURL(`tel:${s.phone}`)} style={{ flex: 1 }} /> : null}
          {s.visible !== false && s.lat != null && s.lng != null ? <Btn kind="secondary" icon="navigate-outline" title={t('الاتجاهات')} onPress={() => Linking.openURL(directionsUrl(s.lat!, s.lng!))} style={{ flex: 1 }} /> : null}
        </Row>
      ) : null}
      {s && s.visible === false ? <Muted size={13}>{t('اسم المحل ورقمه وعنوانه بالظبط بيظهروا بعد ما تطلب منه.')}</Muted> : null}
      {s?.installs && profile?.is_customer && uid !== id ? (
        <Btn kind="secondary" icon="construct-outline" title={t('اطلب تركيب من المحل ده')} onPress={() => router.push({ pathname: '/install/new', params: { shop: id } })} />
      ) : null}

      <Stats items={[
        [(s?.rating ?? data?.legacy?.rating) ? ar((s?.rating ?? data?.legacy?.rating)!) + ' ★' : '—',
          (s?.ratings ?? data?.legacy?.ratings) ? t('{0} تقييم', ar((s?.ratings ?? data?.legacy?.ratings)!)) : t('لسه مفيش تقييم')],
        [ar(s?.sales ?? data?.legacy?.sales ?? 0), t('عملية تمّت')],
        [t('من {0}', sinceShort(s?.since ?? old?.since ?? new Date().toISOString())), t('على ضغطة')],
      ]} />

      {s?.about ? <Section title={t('عن المحل')}><T size={14.5} style={{ lineHeight: 24 }}>{s.about}</T></Section> : null}

      {s?.photos?.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
          {s.photos.map((p) => (
            <Pressable key={p} onPress={() => Linking.openURL(photoUrl(p)!)} accessibilityLabel={t('صورة من المحل')}>
              <Image source={{ uri: photoUrl(p)! }} style={{ width: 150, height: 112, borderRadius: 14, backgroundColor: colors.soft }} />
            </Pressable>
          ))}
        </ScrollView>
      ) : null}

      {s ? (
        <Section title={t('العنوان والمواعيد')}>
          <View style={{ backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.line, padding: 14, gap: 10 }}>
            <Row gap={10} style={{ alignItems: 'flex-start' }}><Icon name="location-outline" size={18} color={colors.muted} /><T size={14} style={{ flex: 1 }}>{s.address || s.area}</T></Row>
            {[s.phone, s.phone2].filter(Boolean).map((ph) => (
              <Pressable key={ph} onPress={() => Linking.openURL(`tel:${ph}`)} accessibilityRole="link">
                <Row gap={10}><Icon name="call-outline" size={18} color={colors.muted} /><T size={14} color={colors.primary} style={{ writingDirection: 'ltr' }}>{ph}</T></Row>
              </Pressable>
            ))}
            {s.hours ? (
              <Row gap={10} style={{ alignItems: 'flex-start' }}>
                <Icon name="time-outline" size={18} color={colors.muted} />
                <View style={{ flex: 1, gap: 2 }}>
                  <T size={14}>{t('من {0} لـ {1}', hourLabel(s.hours.open), hourLabel(s.hours.close))}
                    {open != null ? <T size={13} w="semibold" color={open ? colors.good : colors.bad}>{'  ·  '}{open ? t('مفتوح دلوقتي') : t('مقفول دلوقتي')}</T> : null}</T>
                  {s.hours.off?.length ? <Muted size={13}>{t('إجازة: {0}', s.hours.off.map(dayName).join(t('، ')))}</Muted> : null}
                </View>
              </Row>
            ) : null}
            {MAP_AVAILABLE && s.visible !== false && s.lat != null && s.lng != null ? <ShopMap center={{ lat: s.lat, lng: s.lng }} zoom={15} pins={[{ id: s.id, lat: s.lat, lng: s.lng, title: s.name }]} selected={s.id} height={200} /> : null}
          </View>
        </Section>
      ) : null}

      {s?.installs ? (
        <Section title={t('خدمات التركيب')}>
          {offers.length ? (
            <View style={{ backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 14 }}>
              {offers.map((o, i) => (
                <View key={o.service_id} style={[{ paddingVertical: 12, gap: 2 }, i < offers.length - 1 && { borderBottomWidth: 1, borderColor: colors.line }]}>
                  <Row style={{ justifyContent: 'space-between' }}>
                    <T w="semibold" size={14.5} style={{ flex: 1 }}>{serviceName(svc(o.service_id)) || o.service_id}</T>
                    <T size={13.5} w="medium">{range(o)}</T>
                  </Row>
                  {o.minutes || o.note ? <Muted size={12.5}>{[o.minutes ? t('حوالي {0} دقيقة', ar(o.minutes)) : '', o.note].filter(Boolean).join(' · ')}</Muted> : null}
                </View>
              ))}
            </View>
          ) : <Muted size={13.5}>{t('المحل بيركّب قطع. اطلب تركيب وهو هيبعتلك السعر.')}</Muted>}
          <Muted size={12}>{t('الأسعار تقريبية، والسعر النهائي بيتأكّد في عرض المحل.')}</Muted>
        </Section>
      ) : null}

      {(s?.sells ?? true) ? (
        <Section title={t('القطع')}>
          <Muted size={13}>{SHOP_TYPES[s?.shop_type ?? old?.shop_type ?? 'used']}{(s?.offers_delivery ?? old?.offers_delivery) ? t(' · بيوصّل') : t(' · استلام من المحل')}</Muted>
          <Chips options={(s?.specialties ?? old?.specialties ?? []).map((x) => ({ v: x, label: x }))} selected={[]} onPick={() => {}} />
          <Muted size={13}>{t('الماركات')}</Muted>
          <Chips options={(s?.brands ?? old?.brands ?? []).map((x) => ({ v: x, label: x }))} selected={[]} onPick={() => {}} />
        </Section>
      ) : null}

      <Section title={t('آراء العملاء')} note={reviews.length ? t('من عملاء اشتروا أو ركّبوا فعلًا') : undefined}>
        {reviews.length ? reviews.map((rv, i) => (
          <View key={i} style={[{ paddingVertical: 14, gap: 4 }, i < reviews.length - 1 && { borderBottomWidth: 1, borderColor: colors.line }]}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Row gap={6}><T w="semibold" size={14}>{rv.first_name || t('عميل')}</T><Pill label={rv.kind === 'install' ? t('تركيب') : t('شراء')} /></Row>
              <Row gap={2}>{[1, 2, 3, 4, 5].map((n) => <Icon key={n} name="star" size={13} color={rv.rating >= n ? colors.accent : colors.line} />)}</Row>
            </Row>
            {rv.review ? <T size={14}>{rv.review}</T> : null}
            <Muted size={12}>{rv.part}{rv.at ? t('، ') + ago(rv.at) : ''}</Muted>
          </View>
        )) : <Empty text={t('لسه مفيش آراء.')} />}
      </Section>
    </Screen>
  );
}

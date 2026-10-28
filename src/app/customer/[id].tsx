import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { BackBar, Btn, Card, CopyBox, Empty, Field, Icon, Labeled, Lines, ListRow, Loading, Muted, Photo, Pill, Row, Screen, Section, Seg, T, toast } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import {
  CONDITIONS, DELIVERY_FEE, ORDER_STEPS, SIDES, URGENCY, WANTED, addressLine, ago, ar, friendlyError, money, reqNo,
  type Quote, type Request, type Shop, type ShopPrivate,
} from '@/lib/data';
import { must, useLive } from '@/lib/live';
import { photoUrl, supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';

type Data = { req: Request | null; quotes: Quote[]; shops: Record<string, Shop>; chosenShop: ShopPrivate | null; shopCount: number };

export default function CustomerRequest() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { ready, session, profile } = useAuth();
  const [picked, setPicked] = useState<Quote | null>(null);
  const [mode, setMode] = useState<'delivery' | 'pickup'>('delivery');
  const [busy, setBusy] = useState(false);
  const [stars, setStars] = useState(0);
  const [review, setReview] = useState('');

  const { data, loading } = useLive<Data>(async () => {
    const req = must(await supabase.from('requests').select('*').eq('id', id).maybeSingle()) as Request | null;
    if (!req) return { req: null, quotes: [], shops: {}, chosenShop: null, shopCount: 0 };
    const quotes = must(await supabase.from('quotes').select('*').eq('request_id', id).order('price')) as Quote[];
    const shopRows = must(await supabase.from('shops').select('*')) as Shop[];
    const shops = Object.fromEntries(shopRows.map((s) => [s.id, s]));
    let chosenShop: ShopPrivate | null = null;
    const chosen = quotes.find((q) => q.id === req.chosen_quote_id);
    if (chosen) chosenShop = must(await supabase.from('shop_private').select('*').eq('id', chosen.shop_id).maybeSingle()) as ShopPrivate | null;
    return { req, quotes, shops, chosenShop, shopCount: shopRows.filter((s) => s.status === 'approved').length };
  }, ['requests', 'quotes'], [id]);

  if (ready && !session) return <Redirect href="/login" />;
  const back = () => (picked ? setPicked(null) : router.canGoBack() ? router.back() : router.replace('/customer/requests'));
  if (loading && !data) return <Screen><Loading /></Screen>;
  const r = data?.req;
  if (!r) return <Screen><BackBar title="الطلب" onBack={back} /><Empty text="الطلب ده مش موجود." /></Screen>;
  const quotes = data!.quotes;

  async function rpc(fn: string, args: Record<string, unknown>, ok: string) {
    setBusy(true);
    const { error } = await supabase.rpc(fn, args);
    setBusy(false);
    if (error) { toast(friendlyError(error)); return false; }
    toast(ok); return true;
  }
  const again = () => router.push({ pathname: '/assistant', params: { mode: 'request', part: r.part, cond: r.wanted_condition, notes: r.notes, side: r.side } });
  const chat = (shopId: string) => router.push(`/chat/${r.id}/${shopId}`);
  const extras = [
    r.side ? 'الجهة: ' + SIDES[r.side] : '', r.urgency !== 'normal' ? URGENCY[r.urgency] : '',
    r.budget ? 'ميزانية ' + money(r.budget) + ' ج.م' : '', r.vin ? 'شاسيه ' + r.vin : '',
  ].filter(Boolean);

  const summary = (
    <View style={{ gap: 14 }}>
      <Row style={{ alignItems: 'flex-start' }} gap={14}>
        <Photo uri={photoUrl(r.photo_path)} size={64} />
        <View style={{ flex: 1 }}>
          <T w="bold" size={18}>{r.part}</T>
          <Muted>{r.car_make} {r.car_model} {ar(r.car_year)} · {WANTED[r.wanted_condition]}</Muted>
          {r.notes ? <Muted>«{r.notes}»</Muted> : null}
        </View>
      </Row>
      {extras.length ? <Row gap={6} style={{ flexWrap: 'wrap' }}>{extras.map((e) => <Pill key={e} label={e} />)}</Row> : null}
    </View>
  );

  /* ---- confirm a chosen quote ---- */
  if (picked && r.status === 'open') {
    const shop = data!.shops[picked.shop_id];
    const total = picked.price + (mode === 'delivery' ? DELIVERY_FEE : 0);
    return (
      <Screen footer={
        <Btn title={'أكّد الطلب · ' + money(total) + ' ج.م'} loading={busy} onPress={async () => {
          if (await rpc('choose_quote', { p_request: r.id, p_quote: picked.id, p_mode: mode }, 'تمام! طلبك اتأكد')) setPicked(null);
        }} />
      }>
        <BackBar title="تأكيد الطلب" onBack={back} />
        <Row gap={14}>
          <Photo uri={photoUrl(picked.photo_path)} size={64} />
          <View style={{ flex: 1 }}>
            <T w="bold" size={18}>{r.part}</T>
            <Muted>{CONDITIONS[picked.condition]} · ضمان {ar(picked.warranty_days)} يوم · {shop?.area ?? ''}</Muted>
          </View>
        </Row>
        <Labeled label="هتستلمها إزاي؟">
          {shop?.offers_delivery
            ? <Seg options={[{ v: 'delivery', label: 'توصيل للبيت' }, { v: 'pickup', label: 'من المحل' }]} value={mode} onPick={setMode} />
            : <Muted size={14}>المحل ده مش بيوصّل، هتستلمها من المحل في {shop?.area}.</Muted>}
        </Labeled>
        {mode === 'delivery' && profile ? <Muted size={13}>هتوصل على: {addressLine(profile)}</Muted> : null}
        <Card>
          <Lines rows={[['سعر القطعة', money(picked.price) + ' ج.م'], ['التوصيل', mode === 'delivery' ? money(DELIVERY_FEE) + ' ج.م (تقريبي)' : 'مجاناً']]} total={['الإجمالي', money(total) + ' ج.م']} />
        </Card>
        <Muted center>الدفع كاش أو إنستاباي عند الاستلام.</Muted>
      </Screen>
    );
  }

  /* ---- chosen / done ---- */
  if (r.status === 'chosen' || r.status === 'done') {
    const q = quotes.find((x) => x.id === r.chosen_quote_id);
    const sp = data!.chosenShop;
    const shop = q ? data!.shops[q.shop_id] : undefined;
    const stepIdx = Math.max(0, ORDER_STEPS.findIndex((s) => s.key === (r.order_status ?? 'preparing')));
    const steps = ORDER_STEPS.filter((s) => (r.delivery_mode === 'delivery' ? s.key !== 'ready' : s.key !== 'out_for_delivery'));
    const footer = r.status === 'chosen'
      ? <Btn title="استلمت القطعة" loading={busy} onPress={() => rpc('mark_received', { p_request: r.id }, 'تمام! قيّم المحل لو سمحت')} />
      : !r.rating
        ? <Btn title="ابعت التقييم" disabled={!stars} loading={busy} onPress={() => rpc('rate_request', { p_request: r.id, p_rating: stars, p_review: review.trim() }, 'شكراً على تقييمك')} />
        : <Btn kind="secondary" title="اطلب نفس القطعة تاني" onPress={again} />;
    return (
      <Screen footer={footer}>
        <BackBar title={'طلب ' + reqNo(r.num)} onBack={back} />
        {summary}

        <Card>
          <T w="bold" size={16}>{r.status === 'done' ? 'الطلب اتسلّم ✓' : 'متابعة الطلب'}</T>
          <View>
            {steps.map((s, i) => {
              const realIdx = ORDER_STEPS.findIndex((x) => x.key === s.key);
              const on = r.status === 'done' || realIdx <= stepIdx;
              const last = i === steps.length - 1;
              return (
                <Row key={s.key} style={{ alignItems: 'flex-start' }} gap={12}>
                  <View style={{ alignItems: 'center', width: 22 }}>
                    <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: on ? colors.ink : colors.ground, borderWidth: 2, borderColor: on ? colors.ink : colors.line, alignItems: 'center', justifyContent: 'center' }}>
                      {on ? <Icon name="checkmark" size={13} color="#fff" /> : null}
                    </View>
                    {!last ? <View style={{ width: 2, height: 22, backgroundColor: on ? colors.ink : colors.line }} /> : null}
                  </View>
                  <T w={on ? 'semibold' : 'regular'} color={on ? colors.ink : colors.faint} size={14}>{r.delivery_mode === 'pickup' && s.pickupLabel ? s.pickupLabel : s.label}</T>
                </Row>
              );
            })}
          </View>
        </Card>

        {q && sp ? (
          <Card>
            <Row style={{ justifyContent: 'space-between' }}>
              <Pressable onPress={() => router.push(`/shop-profile/${q.shop_id}`)}>
                <Muted size={12}>المحل</Muted>
                <Row gap={6}><T w="bold" size={17}>{sp.name}</T><Icon name="chevron-back" size={14} color={colors.muted} /></Row>
              </Pressable>
              <Btn kind="small" title="رسالة" onPress={() => chat(q.shop_id)} />
            </Row>
            <CopyBox text={sp.phone} />
            {sp.phone2 ? <CopyBox text={sp.phone2} /> : null}
            <Muted size={13}>العنوان: {addressLine({ street: sp.street, building: sp.building, area: shop?.area, governorate: shop?.governorate })}{sp.landmark ? ' (' + sp.landmark + ')' : ''}</Muted>
            <Lines rows={[[CONDITIONS[q.condition], money(q.price) + ' ج.م'], ...(r.delivery_mode === 'delivery' ? [['التوصيل (تقريبي)', money(DELIVERY_FEE) + ' ج.م'] as [string, string]] : [])]}
              total={['الإجمالي', money(q.price + (r.delivery_mode === 'delivery' ? DELIVERY_FEE : 0)) + ' ج.م']} />
            <Muted>ضمان {ar(q.warranty_days)} يوم: لو القطعة مركبتش، المحل يبدّلها.</Muted>
          </Card>
        ) : null}

        {r.status === 'done' ? (
          r.rating ? (
            <Card>
              <Row gap={4}>{[1, 2, 3, 4, 5].map((n) => <Icon key={n} name="star" size={20} color={r.rating! >= n ? colors.accent : colors.line} />)}</Row>
              {r.review ? <T size={14}>«{r.review}»</T> : <Muted>قيّمت المحل. شكراً!</Muted>}
            </Card>
          ) : (
            <View style={{ gap: 12 }}>
              <T w="bold" size={17}>القطعة ركبت تمام؟ قيّم المحل</T>
              <Row gap={8} style={{ justifyContent: 'center' }}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <Pressable key={n} onPress={() => setStars(n)} accessibilityLabel={ar(n) + ' نجوم'} hitSlop={4}>
                    <Icon name={stars >= n ? 'star' : 'star-outline'} size={36} color={stars >= n ? colors.accent : colors.faint} />
                  </Pressable>
                ))}
              </Row>
              <Field value={review} onChangeText={setReview} multiline placeholder="اكتب رأيك في المحل والقطعة (اختياري)" />
            </View>
          )
        ) : null}
        <Btn kind="link" title="عندك مشكلة في الطلب؟" style={{ alignSelf: 'center' }} onPress={() => router.push({ pathname: '/assistant', params: { mode: 'complaint', request: r.id } })} />
      </Screen>
    );
  }

  /* ---- open / cancelled ---- */
  return (
    <Screen footer={r.status === 'cancelled' ? <Btn kind="secondary" title="اطلبها تاني" onPress={again} /> : undefined}>
      <BackBar title={'طلب ' + reqNo(r.num)} onBack={back} />
      {summary}
      {r.status === 'cancelled' ? <Empty text="الطلب ده اتلغى." /> : (
        <>
          {quotes.length === 0 ? (
            <View style={{ alignItems: 'center', gap: 10, paddingVertical: 28 }}>
              <ActivityIndicator color={colors.ink} />
              <T w="semibold" size={16}>بندوّر عند {ar(data!.shopCount)} محل</T>
              <Muted center>هيوصلك إشعار أول ما يوصل عرض.</Muted>
            </View>
          ) : (
            <Section title={'العروض (' + ar(quotes.length) + ')'} note="الأرخص الأول">
              {quotes.map((q, i) => {
                const shop = data!.shops[q.shop_id];
                return (
                  <ListRow key={q.id} last={i === quotes.length - 1}
                    leading={<Photo uri={photoUrl(q.photo_path)} size={56} />}
                    title={<T w="bold" size={22} style={{ lineHeight: 30 }}>{money(q.price)} <T size={13} color={colors.muted}>ج.م</T></T>}
                    subtitle={CONDITIONS[q.condition] + ' · ضمان ' + ar(q.warranty_days) + ' يوم'}
                    meta={
                      <Pressable onPress={() => router.push(`/shop-profile/${q.shop_id}`)} hitSlop={4}>
                        <T size={12} color={colors.muted} style={{ textDecorationLine: 'underline' }}>
                          محل في {shop?.area ?? '—'}{shop?.offers_delivery ? ' · بيوصّل' : ' · استلام بس'} · {ago(q.created_at)}
                        </T>
                      </Pressable>
                    }
                    trailing={
                      <View style={{ gap: 8, alignItems: 'center' }}>
                        <Btn kind="small" title="اختار" onPress={() => { setMode(shop?.offers_delivery ? 'delivery' : 'pickup'); setPicked(q); }} />
                        <Pressable onPress={() => chat(q.shop_id)} accessibilityLabel="رسالة للمحل" hitSlop={6}><Icon name="chatbubble-ellipses-outline" size={20} /></Pressable>
                      </View>
                    } />
                );
              })}
              <Muted center size={12}>اسم المحل ورقمه بيظهروا بعد ما تختار. تقدر تسأل المحل في رسالة الأول.</Muted>
            </Section>
          )}
          <Btn kind="link" title="إلغاء الطلب" loading={busy} onPress={() => rpc('cancel_request', { p_request: r.id }, 'الطلب اتلغى')} style={{ alignSelf: 'center' }} />
        </>
      )}
    </Screen>
  );
}

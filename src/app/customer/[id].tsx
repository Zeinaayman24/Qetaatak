import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, Pressable, View } from 'react-native';
import {
  BackBar, Btn, Card, CopyBox, Empty, Field, Icon, Lines, Loading, Muted, Photo, Pill, Plate, Press, Row, Screen, Seg, Steps, T, toast,
} from '@/components/ui';
import { useAuth } from '@/lib/auth';
import {
  CONDITIONS, DELIVERY_FEE, ORDER_STEPS, SIDES, URGENCY, WANTED, addressLine, ago, ar, friendlyError, money, reqNo,
  type Quote, type Request, type Shop, type ShopPrivate,
} from '@/lib/data';
import { must, useLive } from '@/lib/live';
import { photoUrl, supabase } from '@/lib/supabase';
import { colors, lift } from '@/lib/theme';

type Data = { req: Request | null; parts: Request[]; quotes: Quote[]; shops: Record<string, Shop>; privs: Record<string, ShopPrivate>; shopCount: number };
type Mode = 'delivery' | 'pickup';

export default function CustomerRequest() {
  const { id, single } = useLocalSearchParams<{ id: string; single?: string }>();
  const { ready, session } = useAuth();
  const { data, loading } = useLive<Data>(async () => {
    const req = must(await supabase.from('requests').select('*').eq('id', id).maybeSingle()) as Request | null;
    if (!req) return { req: null, parts: [], quotes: [], shops: {}, privs: {}, shopCount: 0 };
    const parts = req.batch_id && single !== '1'
      ? (must(await supabase.from('requests').select('*').eq('batch_id', req.batch_id).order('num')) as Request[])
      : [req];
    const ids = parts.map((p) => p.id);
    const quotes = must(await supabase.from('quotes').select('*').in('request_id', ids).order('price')) as Quote[];
    const shopRows = must(await supabase.from('shops').select('*')) as Shop[];
    const chosenShopIds = [...new Set(quotes.filter((q) => parts.some((p) => p.chosen_quote_id === q.id)).map((q) => q.shop_id))];
    const privRows = chosenShopIds.length ? (must(await supabase.from('shop_private').select('*').in('id', chosenShopIds)) as ShopPrivate[]) : [];
    return {
      req, parts, quotes,
      shops: Object.fromEntries(shopRows.map((s) => [s.id, s])),
      privs: Object.fromEntries(privRows.map((s) => [s.id, s])),
      shopCount: shopRows.filter((s) => s.status === 'approved').length,
    };
  }, ['requests', 'quotes'], [id, single]);

  if (ready && !session) return <Redirect href="/login" />;
  const back = () => (router.canGoBack() ? router.back() : router.replace('/customer/requests'));
  if (loading && !data) return <Screen><Loading /></Screen>;
  const r = data?.req;
  if (!r) return <Screen><BackBar title="الطلب" onBack={back} /><Empty text="الطلب ده مش موجود." /></Screen>;
  if (data!.parts.length === 1 && (r.status === 'chosen' || r.status === 'done')) return <Tracking d={data!} r={r} back={back} />;
  return <Basket d={data!} back={back} />;
}

/* =============================================================== open request: compare and choose, per part */
function Basket({ d, back }: { d: Data; back: () => void }) {
  const { profile } = useAuth();
  const [sel, setSel] = useState<Record<string, string>>({}); // part id -> quote id
  const [confirming, setConfirming] = useState(false);
  const [modes, setModes] = useState<Record<string, Mode>>({});
  const [busy, setBusy] = useState(false);
  const first = d.parts[0];
  const open = d.parts.filter((p) => p.status === 'open');
  const quotesOf = (p: Request) => d.quotes.filter((q) => q.request_id === p.id);
  const chosen = Object.entries(sel).map(([pid, qid]) => ({ part: d.parts.find((p) => p.id === pid)!, quote: d.quotes.find((q) => q.id === qid)! })).filter((x) => x.part && x.quote);
  const byShop = Object.values(chosen.reduce<Record<string, typeof chosen>>((acc, c) => ({ ...acc, [c.quote.shop_id]: [...(acc[c.quote.shop_id] ?? []), c] }), {}));
  const modeOf = (shopId: string): Mode => modes[shopId] ?? (d.shops[shopId]?.offers_delivery ? 'delivery' : 'pickup');
  const partsTotal = chosen.reduce((s, c) => s + c.quote.price * (c.part.qty || 1), 0);
  const deliveryTotal = byShop.filter((g) => modeOf(g[0].quote.shop_id) === 'delivery').length * DELIVERY_FEE;

  // shops that quoted every open part: offer the whole list from one place
  const bundles = open.length > 1
    ? [...new Set(d.quotes.map((q) => q.shop_id))]
        .filter((sid) => open.every((p) => quotesOf(p).some((q) => q.shop_id === sid)))
        .map((sid) => {
          const qs = open.map((p) => quotesOf(p).find((q) => q.shop_id === sid)!);
          return { sid, qs, total: qs.reduce((s, q, i) => s + q.price * (open[i].qty || 1), 0) };
        })
        .sort((a, b) => a.total - b.total)
    : [];

  async function confirm() {
    setBusy(true);
    const { error } = await supabase.rpc('choose_quotes', { p_choices: chosen.map((c) => ({ request: c.part.id, quote: c.quote.id, mode: modeOf(c.quote.shop_id) })) });
    setBusy(false);
    if (error) return toast(friendlyError(error));
    toast('تمام! طلبك اتأكد مع المحلات');
    setSel({}); setConfirming(false);
  }
  async function cancelAll() {
    setBusy(true);
    for (const p of open) await supabase.rpc('cancel_request', { p_request: p.id });
    setBusy(false); toast('الطلب اتلغى');
  }
  const again = () => router.push({ pathname: '/customer/new', params: { part: first.part, cond: first.wanted_condition, notes: first.notes, side: first.side } });

  /* ---- confirm ---- */
  if (confirming && chosen.length) {
    return (
      <Screen footer={<Btn kind="accent" icon="checkmark-circle" title={`أكّد الطلب · ${money(partsTotal + deliveryTotal)} ج.م`} loading={busy} onPress={confirm} />}>
        <BackBar title="تأكيد الطلب" onBack={() => setConfirming(false)} />
        {byShop.map((g) => {
          const shop = d.shops[g[0].quote.shop_id];
          const sid = g[0].quote.shop_id;
          return (
            <Card key={sid}>
              <Row style={{ justifyContent: 'space-between' }}>
                <Row gap={8}><Icon name="storefront" size={18} color={colors.accentDeep} /><T w="bold" size={15}>محل في {shop?.area ?? '—'}</T></Row>
                <Muted size={12}>{ar(g.length)} {g.length > 1 ? 'قطع' : 'قطعة'}</Muted>
              </Row>
              {g.map((c) => (
                <Row key={c.part.id} style={{ justifyContent: 'space-between' }}>
                  <View style={{ flex: 1 }}>
                    <T size={14} w="medium">{c.part.part}{c.part.qty > 1 ? ` × ${ar(c.part.qty)}` : ''}</T>
                    <Muted size={12}>{CONDITIONS[c.quote.condition]} · ضمان {ar(c.quote.warranty_days)} يوم</Muted>
                  </View>
                  <T w="semibold" size={14}>{money(c.quote.price * (c.part.qty || 1))} ج.م</T>
                </Row>
              ))}
              {shop?.offers_delivery
                ? <Seg options={[{ v: 'delivery', label: 'توصيل للبيت' }, { v: 'pickup', label: 'استلام من المحل' }]} value={modeOf(sid)} onPick={(v) => setModes((m) => ({ ...m, [sid]: v as Mode }))} />
                : <Muted size={13}>المحل ده مش بيوصّل؛ هتستلم من المحل في {shop?.area}.</Muted>}
            </Card>
          );
        })}
        {byShop.some((g) => modeOf(g[0].quote.shop_id) === 'delivery') && profile ? (
          <Row gap={8} style={{ alignItems: 'flex-start' }}><Icon name="location" size={16} color={colors.muted} /><Muted size={13} style={{ flex: 1 }}>هتوصل على: {addressLine(profile)}</Muted></Row>
        ) : null}
        <Card>
          <Lines rows={[['القطع', money(partsTotal) + ' ج.م'], ['التوصيل' + (byShop.length > 1 ? ` (${ar(byShop.length)} محلات)` : ''), deliveryTotal ? money(deliveryTotal) + ' ج.م (تقريبي)' : 'مجاناً']]} total={['الإجمالي', money(partsTotal + deliveryTotal) + ' ج.م']} />
        </Card>
        <Muted center>الدفع كاش أو إنستاباي عند الاستلام. اسم المحل ورقمه هيظهروا بعد التأكيد.</Muted>
      </Screen>
    );
  }

  const hasQuotes = open.some((p) => quotesOf(p).length);
  const footer = chosen.length ? (
    <Row gap={12}>
      <View style={{ flex: 1 }}>
        <Muted size={12}>اخترت {ar(chosen.length)} من {ar(open.length)}</Muted>
        <T w="bold" size={18}>{money(partsTotal)} ج.م</T>
      </View>
      <Btn kind="accent" title="كمّل" icon="arrow-back" onPress={() => setConfirming(true)} style={{ minWidth: 150 }} />
    </Row>
  ) : d.parts.every((p) => p.status === 'cancelled') ? <Btn kind="secondary" title="اطلبها تاني" onPress={again} /> : undefined;

  return (
    <Screen footer={footer}>
      <BackBar title={'طلب ' + reqNo(first.num)} onBack={back} />
      <View style={[{ backgroundColor: colors.ink, borderRadius: 24, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 14 }]}>
        <Plate top={first.car_model || '—'} bottom={ar(first.car_year)} size="sm" />
        <View style={{ flex: 1 }}>
          <T w="bold" size={16} color="#fff">{d.parts.length > 1 ? `${ar(d.parts.length)} قطع` : first.part}</T>
          <T size={12.5} color="rgba(255,255,255,.7)">{first.car_make} {first.car_model} · {URGENCY[first.urgency]} · {ago(first.created_at)}</T>
        </View>
      </View>

      {open.length && !hasQuotes ? <Searching shops={d.shopCount} /> : null}

      {bundles.length ? (
        <Press onPress={() => setSel(Object.fromEntries(open.map((p, i) => [p.id, bundles[0].qs[i].id])))}
          style={[{ backgroundColor: colors.accentSoft, borderRadius: 22, padding: 16, gap: 6, borderWidth: 1.5, borderColor: colors.accent }]}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Row gap={8}><Icon name="bag-check" size={20} color={colors.accentDeep} /><T w="bold" size={15}>كل القطع من محل واحد</T></Row>
            <T w="bold" size={17}>{money(bundles[0].total)} ج.م</T>
          </Row>
          <Muted size={12.5}>محل في {d.shops[bundles[0].sid]?.area ?? '—'} عنده كل القطع. توصيل واحد وتعامل أسهل. اضغط تختارهم مرة واحدة.</Muted>
        </Press>
      ) : null}

      {d.parts.map((p, idx) => {
        const qs = quotesOf(p);
        const cheapest = qs[0]?.id;
        const extras = [WANTED[p.wanted_condition], p.side ? SIDES[p.side] : '', p.budget ? `ميزانية ${money(p.budget)}` : ''].filter(Boolean);
        return (
          <View key={p.id} style={{ gap: 10 }}>
            <Row gap={12}>
              <Photo uri={photoUrl(p.photo_path)} size={48} />
              <View style={{ flex: 1 }}>
                <Row gap={6}>
                  {d.parts.length > 1 ? <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' }}><T size={11} w="bold" color="#fff" style={{ lineHeight: 15 }}>{ar(idx + 1)}</T></View> : null}
                  <T w="bold" size={16} style={{ flex: 1 }} numberOfLines={1}>{p.part}{p.qty > 1 ? ` × ${ar(p.qty)}` : ''}</T>
                </Row>
                <Muted size={12}>{extras.join(' · ')}{p.notes ? ` · «${p.notes}»` : ''}</Muted>
              </View>
              {p.status === 'open' ? (qs.length ? <Pill label={`${ar(qs.length)} عروض`} tone="new" /> : <Pill label="مستني" tone="wait" />)
                : p.status === 'cancelled' ? <Pill label="اتلغت" /> : <Pill label={p.status === 'done' ? 'اتسلّمت' : 'اتأكدت'} tone="good" icon="checkmark" />}
            </Row>

            {p.status === 'open' ? (
              qs.length ? qs.map((q) => {
                const on = sel[p.id] === q.id;
                const shop = d.shops[q.shop_id];
                return (
                  <Press key={q.id} onPress={() => setSel((s) => (on ? Object.fromEntries(Object.entries(s).filter(([k]) => k !== p.id)) : { ...s, [p.id]: q.id }))} selected={on}
                    style={[{ backgroundColor: colors.surface, borderRadius: 20, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 2, borderColor: on ? colors.accent : 'transparent' }, lift]}>
                    <View style={{ width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: on ? colors.accent : colors.line, backgroundColor: on ? colors.accent : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                      {on ? <Icon name="checkmark" size={14} color={colors.ink} /> : null}
                    </View>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Row gap={8}>
                        <T w="bold" size={20} style={{ lineHeight: 28 }}>{money(q.price)} <T size={12} color={colors.muted}>ج.م</T></T>
                        {q.id === cheapest && qs.length > 1 ? <Pill label="الأرخص" tone="accent" /> : null}
                      </Row>
                      <Muted size={12.5}>{CONDITIONS[q.condition]} · ضمان {ar(q.warranty_days)} يوم</Muted>
                      <Pressable onPress={() => router.push(`/shop-profile/${q.shop_id}`)} hitSlop={4}>
                        <T size={12} color={colors.muted} style={{ textDecorationLine: 'underline' }}>محل في {shop?.area ?? '—'}{shop?.offers_delivery ? ' · بيوصّل' : ''}</T>
                      </Pressable>
                    </View>
                    {q.photo_path ? <Photo uri={photoUrl(q.photo_path)} size={52} /> : null}
                    <Press onPress={() => router.push(`/chat/${p.id}/${q.shop_id}`)} label="رسالة للمحل" hitSlop={6}
                      style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: colors.soft, alignItems: 'center', justifyContent: 'center' }}>
                      <Icon name="chatbubble-ellipses" size={18} />
                    </Press>
                  </Press>
                );
              }) : hasQuotes ? <Muted size={13}>لسه مفيش عروض للقطعة دي. هنبلّغك أول ما يوصل.</Muted> : null
            ) : p.status === 'chosen' || p.status === 'done' ? (
              <Press onPress={() => router.push({ pathname: '/customer/[id]', params: { id: p.id, single: '1' } })}
                style={[{ backgroundColor: colors.surface, borderRadius: 18, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 10 }, lift]}>
                <Icon name={p.status === 'done' ? 'checkmark-done-circle' : 'time'} size={22} color={p.status === 'done' ? colors.good : colors.accentDeep} />
                <T size={14} w="medium" style={{ flex: 1 }}>{p.status === 'done' ? (p.rating ? 'اتسلّمت واتقيّمت' : 'اتسلّمت · قيّم المحل') : ORDER_STEPS.find((s) => s.key === p.order_status)?.label ?? 'المحل بيجهّز'}</T>
                <T size={13} w="semibold" color={colors.accentDeep}>تابع</T>
                <Icon name="chevron-back" size={14} color={colors.accentDeep} />
              </Press>
            ) : null}
          </View>
        );
      })}

      {open.length ? (
        <View style={{ gap: 6, alignItems: 'center' }}>
          {hasQuotes ? <Muted center size={12}>اسم المحل ورقمه بيظهروا بعد ما تأكد. تقدر تسأل المحل في رسالة الأول.</Muted> : null}
          <Btn kind="link" title={open.length > 1 ? 'إلغاء الطلب كله' : 'إلغاء الطلب'} loading={busy} onPress={cancelAll} style={{ alignSelf: 'center' }} />
        </View>
      ) : null}
    </Screen>
  );
}

/** A calm pulse while shops look at the request. */
function Searching({ shops }: { shops: number }) {
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(a, { toValue: 1, duration: 1800, easing: Easing.out(Easing.quad), useNativeDriver: Platform.OS !== 'web' }));
    loop.start(); return () => loop.stop();
  }, [a]);
  return (
    <View style={[{ backgroundColor: colors.surface, borderRadius: 24, paddingVertical: 28, alignItems: 'center', gap: 12 }, lift]}>
      <View style={{ width: 96, height: 96, alignItems: 'center', justifyContent: 'center' }}>
        <Animated.View style={{ position: 'absolute', width: 96, height: 96, borderRadius: 48, backgroundColor: colors.accent, opacity: a.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0] }), transform: [{ scale: a.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1.2] }) }] }} />
        <View style={{ width: 58, height: 58, borderRadius: 29, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' }}><Icon name="storefront" size={26} color={colors.ink} /></View>
      </View>
      <T w="bold" size={17}>بندوّر عند {ar(shops)} محل</T>
      <Muted center size={13}>أغلب الطلبات بيوصلها أول عرض خلال ساعة.{'\n'}هيوصلك إشعار أول ما يوصل.</Muted>
    </View>
  );
}

/* =============================================================== one chosen part: tracking, contact, rating */
function Tracking({ d, r, back }: { d: Data; r: Request; back: () => void }) {
  const [busy, setBusy] = useState(false);
  const [stars, setStars] = useState(0);
  const [review, setReview] = useState('');
  const q = d.quotes.find((x) => x.id === r.chosen_quote_id);
  const sp = q ? d.privs[q.shop_id] : undefined;
  const shop = q ? d.shops[q.shop_id] : undefined;
  async function rpc(fn: string, args: Record<string, unknown>, ok: string) {
    setBusy(true);
    const { error } = await supabase.rpc(fn, args);
    setBusy(false);
    if (error) { toast(friendlyError(error)); return false; }
    toast(ok); return true;
  }
  const again = () => router.push({ pathname: '/customer/new', params: { part: r.part, cond: r.wanted_condition, notes: r.notes, side: r.side } });
  const steps = ORDER_STEPS.filter((s) => (r.delivery_mode === 'delivery' ? s.key !== 'ready' : s.key !== 'out_for_delivery'));
  const cur = r.status === 'done' ? steps.length : Math.max(0, steps.findIndex((s) => s.key === (r.order_status ?? 'preparing')));
  const footer = r.status === 'chosen'
    ? <Btn kind="accent" icon="checkmark-done" title="استلمت القطعة" loading={busy} onPress={() => rpc('mark_received', { p_request: r.id }, 'تمام! قيّم المحل لو سمحت')} />
    : !r.rating
      ? <Btn title="ابعت التقييم" disabled={!stars} loading={busy} onPress={() => rpc('rate_request', { p_request: r.id, p_rating: stars, p_review: review.trim() }, 'شكراً على تقييمك')} />
      : <Btn kind="secondary" icon="refresh" title="اطلب نفس القطعة تاني" onPress={again} />;
  return (
    <Screen footer={footer}>
      <BackBar title={'طلب ' + reqNo(r.num)} onBack={back} />
      <Row gap={14}>
        <Photo uri={photoUrl(r.photo_path)} size={64} />
        <View style={{ flex: 1 }}>
          <T w="bold" size={18}>{r.part}{r.qty > 1 ? ` × ${ar(r.qty)}` : ''}</T>
          <Muted>{r.car_make} {r.car_model} {ar(r.car_year)} · {WANTED[r.wanted_condition]}</Muted>
        </View>
      </Row>
      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <T w="bold" size={16}>{r.status === 'done' ? 'الطلب اتسلّم' : 'متابعة الطلب'}</T>
          {r.status === 'done' ? <Pill label="اتسلّم" tone="good" icon="checkmark" /> : <Pill label={r.delivery_mode === 'delivery' ? 'توصيل' : 'استلام'} tone="wait" />}
        </Row>
        <Steps items={steps.map((s) => (r.delivery_mode === 'pickup' && s.pickupLabel ? s.pickupLabel : s.label))} current={cur} />
      </Card>
      {q && sp ? (
        <Card>
          <Row style={{ justifyContent: 'space-between' }}>
            <Pressable onPress={() => router.push(`/shop-profile/${q.shop_id}`)}>
              <Muted size={12}>المحل</Muted>
              <Row gap={6}><T w="bold" size={17}>{sp.name}</T><Icon name="chevron-back" size={14} color={colors.muted} /></Row>
            </Pressable>
            <Btn kind="small" icon="chatbubble-ellipses" title="رسالة" onPress={() => router.push(`/chat/${r.id}/${q.shop_id}`)} />
          </Row>
          <CopyBox text={sp.phone} />
          {sp.phone2 ? <CopyBox text={sp.phone2} /> : null}
          <Muted size={13}>العنوان: {addressLine({ street: sp.street, building: sp.building, area: shop?.area, governorate: shop?.governorate })}{sp.landmark ? ' (' + sp.landmark + ')' : ''}</Muted>
          <Lines rows={[[CONDITIONS[q.condition], money(q.price * (r.qty || 1)) + ' ج.م'], ...(r.delivery_mode === 'delivery' ? [['التوصيل (تقريبي)', money(DELIVERY_FEE) + ' ج.م'] as [string, string]] : [])]}
            total={['الإجمالي', money(q.price * (r.qty || 1) + (r.delivery_mode === 'delivery' ? DELIVERY_FEE : 0)) + ' ج.م']} />
          <Row gap={6}><Icon name="shield-checkmark" size={16} color={colors.good} /><Muted size={12.5}>ضمان {ar(q.warranty_days)} يوم: لو القطعة مركبتش، المحل يبدّلها.</Muted></Row>
        </Card>
      ) : null}
      {r.status === 'done' ? (
        r.rating ? (
          <Card>
            <Row gap={4}>{[1, 2, 3, 4, 5].map((n) => <Icon key={n} name="star" size={20} color={r.rating! >= n ? colors.accent : colors.line} />)}</Row>
            {r.review ? <T size={14}>«{r.review}»</T> : <Muted>قيّمت المحل. شكراً!</Muted>}
          </Card>
        ) : (
          <Card>
            <T w="bold" size={17}>القطعة ركبت تمام؟ قيّم المحل</T>
            <Row gap={8} style={{ justifyContent: 'center' }}>
              {[1, 2, 3, 4, 5].map((n) => (
                <Press key={n} onPress={() => setStars(n)} label={ar(n) + ' نجوم'} hitSlop={4}>
                  <Icon name={stars >= n ? 'star' : 'star-outline'} size={38} color={stars >= n ? colors.accent : colors.faint} />
                </Press>
              ))}
            </Row>
            <Field value={review} onChangeText={setReview} multiline placeholder="اكتب رأيك في المحل والقطعة (اختياري)" />
          </Card>
        )
      ) : null}
      <Btn kind="link" title="عندك مشكلة في الطلب؟" style={{ alignSelf: 'center' }} onPress={() => router.push({ pathname: '/assistant', params: { mode: 'complaint', request: r.id } })} />
    </Screen>
  );
}

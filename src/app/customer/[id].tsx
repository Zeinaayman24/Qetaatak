import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, Pressable, View } from 'react-native';
import { PaymentPicker, RadioCard, payOptions, type Handover } from '@/components/Payment';
import {
  BackBar, Btn, Card, Empty, Icon, Lines, Loading, Muted, Photo, Pill, Plate, Press, Row, Screen, Section, SlideToConfirm, T, TabPills, toast,
} from '@/components/ui';
import { useAuth } from '@/lib/auth';
import {
  CONDITIONS, DELIVERY_FEE, MATCH_HOURS, warrantyLabel, ORDER_LABEL, SIDES, URGENCY, WANTED, addressLine, ago, ar, friendlyError, money, orderNo, reqNo,
  type Order, type PayMethod, type Quote, type Request, type Shop,
} from '@/lib/data';
import { cardAvailable, payByCard } from '@/lib/payments';
import { must, useLive } from '@/lib/live';
import { photoUrl, supabase } from '@/lib/supabase';
import { colors, lift } from '@/lib/theme';

type Mode = 'delivery' | 'pickup';
type Declines = Record<string, { n: number; reasons: string[] }>;
type Data = { req: Request | null; parts: Request[]; quotes: Quote[]; shops: Record<string, Shop>; orders: Record<string, Order>; declines: Declines; shopCount: number; transfer: Record<string, boolean> };

/** A price request: offers per part, side by side. Accepted parts move into orders. */
export default function PriceRequest() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { ready, session, profile } = useAuth();
  const [tab, setTab] = useState<string | null>(null);
  const [sel, setSel] = useState<Record<string, string>>({}); // part id → quote id
  const [modes, setModes] = useState<Record<string, Mode>>({});
  const [review, setReview] = useState(false); // the checkout step
  const [pay, setPay] = useState<PayMethod>('cash');
  const [card, setCard] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { cardAvailable().then(setCard); }, []);

  const { data, loading } = useLive<Data>(async () => {
    const req = must(await supabase.from('requests').select('*').eq('id', id).maybeSingle()) as Request | null;
    if (!req) return { req: null, parts: [], quotes: [], shops: {}, orders: {}, declines: {}, shopCount: 0, transfer: {} };
    const parts = req.batch_id ? (must(await supabase.from('requests').select('*').eq('batch_id', req.batch_id).order('num')) as Request[]) : [req];
    const ids = parts.map((p) => p.id);
    const orderIds = [...new Set(parts.map((p) => p.order_id).filter(Boolean))] as string[];
    const [quotes, shopRows, orderRows, dec] = await Promise.all([
      supabase.from('quotes').select('*').in('request_id', ids).order('price'),
      supabase.from('shops').select('*'),
      orderIds.length ? supabase.from('orders').select('*').in('id', orderIds) : Promise.resolve({ data: [], error: null }),
      supabase.rpc('decline_counts', { p_requests: ids }),
    ]);
    const declines: Declines = {};
    for (const d of (dec.data ?? []) as { request_id: string; n: number; reasons: string[] | null }[]) declines[d.request_id] = { n: Number(d.n), reasons: d.reasons ?? [] };
    const shops = must(shopRows) as Shop[];
    const quoteShops = [...new Set((must(quotes) as Quote[]).map((q) => q.shop_id))];
    const pay = quoteShops.length ? await supabase.rpc('shop_pay_options', { p_shops: quoteShops }) : { data: [] };
    const transfer = Object.fromEntries(((pay.data ?? []) as { shop_id: string; instapay: boolean }[]).map((x) => [x.shop_id, x.instapay]));
    return {
      transfer,
      req, parts, quotes: must(quotes) as Quote[],
      shops: Object.fromEntries(shops.map((s) => [s.id, s])),
      orders: Object.fromEntries((must(orderRows as any) as Order[]).map((o) => [o.id, o])),
      declines, shopCount: shops.filter((s) => s.status === 'approved' && (s.brands.length === 0 || s.brands.includes(req.car_make))).length,
    };
  }, ['requests', 'quotes', 'orders', 'declines'], [id]);

  if (ready && !session) return <Redirect href="/login" />;
  const back = () => (router.canGoBack() ? router.back() : router.replace('/customer/requests'));
  if (loading && !data) return <Screen><Loading /></Screen>;
  const d = data!;
  const r = d?.req;
  if (!r) return <Screen><BackBar title="الطلب" onBack={back} /><Empty text="الطلب ده مش موجود." /></Screen>;
  // a single part that already became an order lives on the order page
  if (d.parts.length === 1 && r.order_id) return <Redirect href={{ pathname: '/order/[id]', params: { id: r.order_id } }} />;

  const first = d.parts[0];
  const quotesOf = (p: Request) => d.quotes.filter((q) => q.request_id === p.id);
  const open = d.parts.filter((p) => p.status === 'open');
  const current = d.parts.find((p) => p.id === tab) ?? open.find((p) => quotesOf(p).length) ?? open[0] ?? d.parts[0];
  const chosen = Object.entries(sel)
    .map(([pid, qid]) => ({ part: d.parts.find((p) => p.id === pid)!, quote: d.quotes.find((q) => q.id === qid)! }))
    .filter((x) => x.part && x.quote && x.part.status === 'open');
  const byShop = Object.values(chosen.reduce<Record<string, typeof chosen>>((acc, c) => ({ ...acc, [c.quote.shop_id]: [...(acc[c.quote.shop_id] ?? []), c] }), {}));
  const modeOf = (sid: string): Mode => modes[sid] ?? (d.shops[sid]?.offers_delivery ? 'delivery' : 'pickup');
  const partsTotal = chosen.reduce((s, c) => s + c.quote.price * (c.part.qty || 1), 0);
  const deliveryTotal = byShop.filter((g) => modeOf(g[0].quote.shop_id) === 'delivery').length * DELIVERY_FEE;
  const bundle = open.length > 1
    ? [...new Set(d.quotes.map((q) => q.shop_id))]
        .filter((sid) => open.every((p) => quotesOf(p).some((q) => q.shop_id === sid)))
        .map((sid) => ({ sid, qs: open.map((p) => quotesOf(p).find((q) => q.shop_id === sid)!), total: open.reduce((s, p) => s + quotesOf(p).find((q) => q.shop_id === sid)!.price * (p.qty || 1), 0) }))
        .sort((a, b) => a.total - b.total)[0]
    : undefined;

  function pick(p: Request, q: Quote) {
    setSel((s) => (s[p.id] === q.id ? Object.fromEntries(Object.entries(s).filter(([k]) => k !== p.id)) : { ...s, [p.id]: q.id }));
    // move on to the next part still without a choice
    const nextPart = open.find((x) => x.id !== p.id && !sel[x.id] && quotesOf(x).length);
    if (sel[p.id] !== q.id && nextPart) setTimeout(() => setTab(nextPart.id), 350);
  }

  const allPickup = byShop.length > 0 && byShop.every((g) => modeOf(g[0].quote.shop_id) === 'pickup');
  const allDelivery = byShop.length > 0 && byShop.every((g) => modeOf(g[0].quote.shop_id) === 'delivery');
  const handover: Handover = allPickup ? 'pickup' : allDelivery ? 'delivery' : 'mixed';
  const transferOk = byShop.length > 0 && byShop.every((g) => d.transfer[g[0].quote.shop_id]);
  const allowed = payOptions(handover).filter((v) => (v !== 'card' || card) && (v !== 'instapay' || transferOk));
  // keep the person's choice when it still fits; otherwise fall back to cash (on delivery or at the shop)
  const method: PayMethod = allowed.includes(pay) ? pay : pay === 'cash' && allowed.includes('shop') ? 'shop' : pay === 'shop' && allowed.includes('cash') ? 'cash' : allowed[0];

  async function accept() {
    setBusy(true);
    const { data: made, error } = await supabase.rpc('place_order', {
      p_choices: chosen.map((c) => ({ request: c.part.id, quote: c.quote.id, mode: modeOf(c.quote.shop_id) })), p_payment: method,
    });
    if (error) { setBusy(false); return toast(friendlyError(error)); }
    const ids = (made ?? []) as string[];
    setReview(false); setSel({});
    if (method === 'card' && ids.length === 1) {
      const err = await payByCard(ids[0]);
      setBusy(false);
      if (err) { toast(err); router.push({ pathname: '/order/[id]', params: { id: ids[0] } }); }
      return;
    }
    setBusy(false);
    toast(method === 'instapay' ? 'الأوردر اتسجّل، فاضل تحوّل وترفع الإيصال' : method === 'card' ? `اتعمل ${ar(ids.length)} أوردرات، ادفع كل واحد من صفحته` : ids.length > 1 ? `اتعمل ${ar(ids.length)} أوردرات` : 'الأوردر اتأكد مع المحل');
    if (ids.length === 1) router.push({ pathname: '/order/[id]', params: { id: ids[0] } });
    else router.push('/customer/requests');
  }
  async function cancelOpen() {
    setBusy(true);
    for (const p of open) await supabase.rpc('cancel_request', { p_request: p.id });
    setBusy(false); toast('الطلب اتلغى');
  }

  const partMark = (p: Request) => {
    if (p.order_id) return { icon: 'checkmark-circle', color: colors.good };
    if (p.status === 'cancelled') return { icon: 'close-circle', color: colors.faint };
    if (sel[p.id]) return { icon: 'checkmark-circle', color: colors.accentDeep };
    const n = quotesOf(p).length;
    if (n) return { count: n };
    if (d.declines[p.id]?.n) return { icon: 'alert-circle', color: colors.bad };
    return undefined;
  };

  /* ---------------------------------------------------------------- one part's panel */
  const panel = (p: Request) => {
    const qs = quotesOf(p);
    const dec = d.declines[p.id];
    const order = p.order_id ? d.orders[p.order_id] : undefined;
    const extras = [WANTED[p.wanted_condition], p.side ? SIDES[p.side] : '', p.qty > 1 ? `العدد ${ar(p.qty)}` : '', p.budget ? `ميزانية ${money(p.budget)} ج` : ''].filter(Boolean);
    return (
      <View style={{ gap: 12 }}>
        <Row gap={12}>
          <Photo uri={photoUrl(p.photo_path)} size={52} />
          <View style={{ flex: 1 }}>
            <T w="bold" size={18}>{p.part}</T>
            <Muted size={12.5}>{extras.join('، ')}{p.notes ? `، «${p.notes}»` : ''}</Muted>
          </View>
        </Row>

        {order ? (
          <Press onPress={() => router.push({ pathname: '/order/[id]', params: { id: order.id } })}
            style={[{ backgroundColor: colors.goodSoft, borderRadius: 20, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }]}>
            <Icon name={ORDER_LABEL[order.status].icon} size={26} color={colors.good} />
            <View style={{ flex: 1 }}>
              <T w="bold" size={15}>القطعة دي في أوردر {orderNo(order.order_no)}</T>
              <Muted size={12.5}>{ORDER_LABEL[order.status].short}، اضغط تتابع الأوردر</Muted>
            </View>
            <Icon name="chevron-back" size={18} color={colors.good} />
          </Press>
        ) : p.status === 'cancelled' ? (
          <Empty icon="close-circle-outline" text="القطعة دي اتلغت من الطلب." />
        ) : qs.length ? (
          <>
            {qs.map((q, i) => <Offer key={q.id} q={q} shop={d.shops[q.shop_id]} on={sel[p.id] === q.id} cheapest={i === 0 && qs.length > 1} qty={p.qty || 1}
              onPick={() => pick(p, q)} onChat={() => router.push(`/chat/${p.id}/${q.shop_id}`)} />)}
            {dec?.n ? <Muted size={12.5}>{ar(dec.n)} {dec.n > 1 ? 'محلات قالوا' : 'محل قال'} إنها مش متوفرة عندهم.</Muted> : null}
          </>
        ) : dec?.n && dec.n >= d.shopCount ? (
          <View style={{ backgroundColor: colors.badSoft, borderRadius: 20, padding: 16, gap: 6 }}>
            <Row gap={8}><Icon name="alert-circle" size={22} color={colors.bad} /><T w="bold" size={15} color={colors.bad}>مش متوفرة عند المحلات دلوقتي</T></Row>
            <Muted size={13}>كل المحلات اللي شافت الطلب قالت إنها مش عندها.{dec.reasons.length ? ` السبب: «${dec.reasons[0]}»` : ''} جرّب "أي حاجة" بدل مستعمل/جديد، أو اسأل المساعد.</Muted>
          </View>
        ) : (
          <>
            <Searching shops={d.shopCount} />
            {dec?.n ? (
              <Row gap={8} style={{ backgroundColor: colors.surface, borderRadius: 16, padding: 12 }}>
                <Icon name="information-circle" size={18} color={colors.muted} />
                <Muted size={13} style={{ flex: 1 }}>{ar(dec.n)} {dec.n > 1 ? 'محلات قالوا' : 'محل قال'} إنها مش متوفرة{dec.reasons.length ? ` («${dec.reasons[0]}»)` : ''}. لسه مستنيين باقي المحلات.</Muted>
              </Row>
            ) : null}
          </>
        )}
      </View>
    );
  };

  /* ---------------------------------------------------------------- checkout */
  if (review && chosen.length) {
    const grand = partsTotal + deliveryTotal;
    return (
      <Screen footer={
        <>
          <Row style={{ justifyContent: 'space-between' }}>
            <Muted size={13}>الإجمالي، {method === 'cash' ? 'كاش عند الاستلام' : method === 'shop' ? 'في المحل' : method === 'card' ? 'بالبطاقة' : 'تحويل'}</Muted>
            <T w="bold" size={20} color={colors.primary}>{money(grand)} ج.م</T>
          </Row>
          <SlideToConfirm label={method === 'card' ? 'اسحب وكمّل للدفع' : 'اسحب لتأكيد الأوردر'} busy={busy} onConfirm={accept} />
        </>
      }>
        <BackBar title="إتمام الطلب" onBack={() => setReview(false)} />

        <Section title="القطع والتوصيل">
          {byShop.map((g) => {
            const sid = g[0].quote.shop_id;
            const shop = d.shops[sid];
            return (
              <Card key={sid}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <Row gap={8}>
                    <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}><Icon name="storefront" size={18} color={colors.primary} /></View>
                    <View><T w="bold" size={14.5}>محل موثّق في {shop?.area ?? '—'}</T><Muted size={12}>{ar(g.length)} {g.length > 1 ? 'قطع' : 'قطعة'}</Muted></View>
                  </Row>
                </Row>
                {g.map((c) => (
                  <Row key={c.part.id} gap={10}>
                    <Photo uri={photoUrl(c.quote.photo_path ?? c.part.photo_path)} size={44} />
                    <View style={{ flex: 1 }}>
                      <T w="semibold" size={14}>{c.part.part}{c.part.qty > 1 ? ` × ${ar(c.part.qty)}` : ''}</T>
                      <Muted size={12}>{CONDITIONS[c.quote.condition]}، {warrantyLabel(c.quote.warranty_days)}</Muted>
                    </View>
                    <T w="semibold" size={14} color={colors.primary}>{money(c.quote.price * (c.part.qty || 1))} ج.م</T>
                  </Row>
                ))}
                <View style={{ height: 1, backgroundColor: colors.line }} />
                <T w="semibold" size={13} color={colors.muted}>خيار التسليم</T>
                <RadioCard title="توصيل للبيت" sub={shop?.offers_delivery ? 'المندوب يوصّلها لعنوانك' : 'المحل ده مش بيوصّل'} icon="bicycle" right={`+${money(DELIVERY_FEE)} ج.م`}
                  on={modeOf(sid) === 'delivery'} disabled={!shop?.offers_delivery} onPress={() => setModes((m) => ({ ...m, [sid]: 'delivery' }))} />
                <RadioCard title="استلام من المحل" sub="روح استلمها بنفسك" icon="walk" right="مجاناً"
                  on={modeOf(sid) === 'pickup'} onPress={() => setModes((m) => ({ ...m, [sid]: 'pickup' }))} />
              </Card>
            );
          })}
        </Section>

        {!allPickup && profile ? (
          <Card>
            <Row gap={10} style={{ alignItems: 'flex-start' }}>
              <Icon name="location" size={20} color={colors.primary} />
              <View style={{ flex: 1 }}><T w="semibold" size={14}>التوصيل على</T><Muted size={13}>{addressLine(profile)}</Muted></View>
              <Btn kind="link" title="تغيير" onPress={() => router.push('/profile')} />
            </Row>
          </Card>
        ) : null}

        <Section title="طريقة الدفع">
          <PaymentPicker value={method} onPick={setPay} card={card} instapay={transferOk} handover={handover} />
        </Section>

        <Section title="ملخص الطلب">
          <Card>
            <Lines rows={[['القطع', money(partsTotal) + ' ج.م'], ['التوصيل', deliveryTotal ? money(deliveryTotal) + ' ج.م' : 'مجاناً']]} total={['الإجمالي', money(grand) + ' ج.م']} />
          </Card>
          {open.length > chosen.length ? <Muted size={12.5}>باقي القطع ({ar(open.length - chosen.length)}) هتفضل في طلب الأسعار مستنية عروض.</Muted> : null}
          <Muted size={12} center>بتأكيد الأوردر انت موافق على الشروط. افحص القطعة وانت بتستلم: لو مش زي الوصف ترفضها، أو بلّغنا خلال {ar(MATCH_HOURS)} ساعة.</Muted>
        </Section>
      </Screen>
    );
  }

  /* ---------------------------------------------------------------- page */
  const footer = chosen.length ? (
    <Row gap={12}>
      <View style={{ flex: 1 }}>
        <Muted size={12}>اخترت {ar(chosen.length)} من {ar(open.length)}</Muted>
        <T w="bold" size={19}>{money(partsTotal)} ج.م</T>
      </View>
      <Btn title="كمّل للدفع" icon="arrow-back" onPress={() => setReview(true)} style={{ minWidth: 160 }} />
    </Row>
  ) : undefined;

  return (
    <Screen footer={footer}>
      <BackBar title={'طلب أسعار ' + reqNo(first.num)} onBack={back} />
      <View style={{ backgroundColor: colors.ink, borderRadius: 18, padding: 16, gap: 14 }}>
        <Row gap={14}>
          <Plate top={first.car_model || '—'} bottom={ar(first.car_year)} size="sm" />
          <View style={{ flex: 1 }}>
            <T w="bold" size={16} color="#fff">{d.parts.length > 1 ? `${ar(d.parts.length)} قطع` : first.part}</T>
            <T size={12.5} color="rgba(255,255,255,.7)">{first.car_make} {first.car_model}، {URGENCY[first.urgency]}، {ago(first.created_at)}</T>
          </View>
        </Row>
        <Row gap={8}>
          {[
            [ar(d.parts.filter((p) => quotesOf(p).length && p.status === 'open').length), 'ليها عروض'],
            [ar(d.parts.filter((p) => p.order_id).length), 'في أوردرات'],
            [ar(d.shopCount), 'محل شايف الطلب'],
          ].map(([v, l]) => (
            <View key={l} style={{ flex: 1, backgroundColor: 'rgba(255,255,255,.08)', borderRadius: 14, paddingVertical: 8, alignItems: 'center' }}>
              <T w="bold" size={17} color="#fff">{v}</T><T size={11} color="rgba(255,255,255,.65)">{l}</T>
            </View>
          ))}
        </Row>
      </View>

      {bundle && !chosen.length ? (
        <Press onPress={() => setSel(Object.fromEntries(open.map((p, i) => [p.id, bundle.qs[i].id])))}
          style={{ backgroundColor: colors.accentSoft, borderRadius: 18, padding: 16, gap: 6, borderWidth: 1.5, borderColor: colors.accent }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Row gap={8}><Icon name="bag-check" size={20} color={colors.accentDeep} /><T w="bold" size={15}>كل القطع من محل واحد</T></Row>
            <T w="bold" size={17}>{money(bundle.total)} ج.م</T>
          </Row>
          <Muted size={12.5}>محل في {d.shops[bundle.sid]?.area ?? '—'} عنده كل القطع اللي لسه مفتوحة. أوردر واحد وتوصيل واحد.</Muted>
        </Press>
      ) : null}

      {d.parts.length > 1 ? (
        <TabPills items={d.parts.map((p, i) => ({ v: p.id, label: p.part, mark: partMark(p) }))} value={current.id} onPick={setTab} />
      ) : null}
      {panel(current)}

      {open.length ? (
        <View style={{ gap: 6, alignItems: 'center' }}>
          <Muted center size={12}>اسم المحل ورقمه بيظهروا بعد التأكيد. ممنوع تبادل الأرقام في الشات قبل التأكيد.</Muted>
          <Btn kind="link" title={open.length > 1 ? 'إلغاء القطع المفتوحة' : 'إلغاء الطلب'} loading={busy} onPress={cancelOpen} style={{ alignSelf: 'center' }} />
        </View>
      ) : null}

    </Screen>
  );
}

/** One offer: big price, what you get, and a clear pick state. */
function Offer({ q, shop, on, cheapest, qty, onPick, onChat }: { q: Quote; shop?: Shop; on: boolean; cheapest: boolean; qty: number; onPick: () => void; onChat: () => void }) {
  return (
    <Press onPress={onPick} selected={on}
      style={[{ backgroundColor: on ? colors.ink : colors.surface, borderRadius: 18, padding: 16, gap: 12 }, lift]}>
      <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View style={{ gap: 2 }}>
          <Row gap={8}>
            <T w="bold" size={26} color={on ? '#fff' : colors.ink} style={{ lineHeight: 34 }}>{money(q.price)}</T>
            <T size={13} color={on ? 'rgba(255,255,255,.6)' : colors.muted}>ج.م{qty > 1 ? ' للقطعة' : ''}</T>
            {cheapest ? <Pill label="الأرخص" tone="accent" /> : null}
          </Row>
          <Pressable onPress={() => router.push(`/shop-profile/${q.shop_id}`)} hitSlop={4}>
            <Row gap={4}><Icon name="storefront-outline" size={14} color={on ? 'rgba(255,255,255,.7)' : colors.muted} />
              <T size={12.5} color={on ? 'rgba(255,255,255,.75)' : colors.muted} style={{ textDecorationLine: 'underline' }}>محل موثّق في {shop?.area ?? '—'}</T></Row>
          </Pressable>
        </View>
        {q.photo_path ? <Photo uri={photoUrl(q.photo_path)} size={60} /> : null}
      </Row>
      <Row gap={6} style={{ flexWrap: 'wrap' }}>
        {[[CONDITIONS[q.condition], 'pricetag'], [warrantyLabel(q.warranty_days), q.warranty_days ? 'shield-checkmark' : 'information-circle'], [shop?.offers_delivery ? 'بيوصّل' : 'استلام بس', shop?.offers_delivery ? 'bicycle' : 'walk']].map(([t, icon]) => (
          <Row key={t} gap={4} style={{ backgroundColor: on ? 'rgba(255,255,255,.1)' : colors.soft, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 }}>
            <Icon name={icon} size={13} color={on ? colors.accent : colors.muted} /><T size={12} w="medium" color={on ? '#fff' : colors.ink}>{t}</T>
          </Row>
        ))}
      </Row>
      <Row gap={10}>
        <View style={{ flex: 1, height: 46, borderRadius: 12, backgroundColor: on ? colors.accent : colors.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <Icon name={on ? 'checkmark-circle' : 'add-circle-outline'} size={18} color={on ? colors.ink : '#fff'} />
          <T w="semibold" size={14} color={on ? colors.ink : '#fff'}>{on ? 'اخترت العرض ده' : 'اختار العرض'}</T>
        </View>
        <Press onPress={onChat} label="اسأل المحل" style={{ height: 46, paddingHorizontal: 14, borderRadius: 12, backgroundColor: on ? 'rgba(255,255,255,.1)' : colors.soft, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Icon name="chatbubble-ellipses" size={17} color={on ? '#fff' : colors.ink} /><T size={13} w="medium" color={on ? '#fff' : colors.ink}>اسأل</T>
        </Press>
      </Row>
    </Press>
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
    <View style={[{ backgroundColor: colors.surface, borderRadius: 18, paddingVertical: 26, alignItems: 'center', gap: 10 }, lift]}>
      <View style={{ width: 90, height: 90, alignItems: 'center', justifyContent: 'center' }}>
        <Animated.View style={{ position: 'absolute', width: 90, height: 90, borderRadius: 45, backgroundColor: colors.accent, opacity: a.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0] }), transform: [{ scale: a.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1.2] }) }] }} />
        <View style={{ width: 54, height: 54, borderRadius: 27, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' }}><Icon name="storefront" size={24} color={colors.ink} /></View>
      </View>
      <T w="bold" size={16}>{ar(shops)} محل بيشوفوا طلبك</T>
      <Muted center size={13}>أغلب الطلبات بيوصلها أول عرض خلال ساعة. هيوصلك إشعار.</Muted>
    </View>
  );
}

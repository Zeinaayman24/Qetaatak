import { isFeatured } from '@/components/AdBanner';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, Pressable, View } from 'react-native';
import { PaymentPicker, RadioCard, payOptions, type Handover } from '@/components/Payment';
import {
  BackBar, Btn, Card, Empty, Icon, Lines, Loading, Muted, Photo, Pill, Plate, Press, Row, Screen, SlideToConfirm, T, TabPills, toast,
} from '@/components/ui';
import { useAuth } from '@/lib/auth';
import {
  CONDITIONS, MATCH_HOURS, warrantyLabel, ORDER_LABEL, SIDES, WANTED, addressLine, ar, elapsed, friendlyError, money, orderNo, replyLabel, reqNo,
  type Order, type PayMethod, type Quote, type Request, type Shop, type ShopCard,
} from '@/lib/data';
import { PAY_NAME, cardAvailable, payByCard } from '@/lib/payments';
import { must, useLive, useNow } from '@/lib/live';
import { photoUrl, supabase } from '@/lib/supabase';
import { colors, lift } from '@/lib/theme';

type Mode = 'delivery' | 'pickup';
type Declines = Record<string, { n: number; reasons: string[] }>;
type Data = { req: Request | null; parts: Request[]; quotes: Quote[]; shops: Record<string, Shop>; orders: Record<string, Order>; declines: Declines; shopCount: number; transfer: Record<string, boolean>; fees: Record<string, number | null>; cards: Record<string, ShopCard> };
type Step = 'offers' | 'handover' | 'payment' | 'review';
const STEPS: { v: Step; label: string }[] = [{ v: 'handover', label: 'الاستلام' }, { v: 'payment', label: 'الدفع' }, { v: 'review', label: 'التأكيد' }];

/** A price request: offers per part, side by side. Accepted parts move into orders. */
export default function PriceRequest() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { ready, session, profile } = useAuth();
  const [tab, setTab] = useState<string | null>(null);
  const [sel, setSel] = useState<Record<string, string>>({}); // part id → quote id
  const [modes, setModes] = useState<Record<string, Mode>>({});
  const [step, setStep] = useState<Step>('offers'); // checkout runs as three pages: handover → payment → review
  const [pay, setPay] = useState<PayMethod>('cash');
  const [card, setCard] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { cardAvailable().then(setCard); }, []);

  const { data, loading } = useLive<Data>(async () => {
    const req = must(await supabase.from('requests').select('*').eq('id', id).maybeSingle()) as Request | null;
    if (!req) return { req: null, parts: [], quotes: [], shops: {}, orders: {}, declines: {}, shopCount: 0, transfer: {}, fees: {}, cards: {} };
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
    const [pay, cardRows] = quoteShops.length
      ? await Promise.all([supabase.rpc('shop_pay_options', { p_shops: quoteShops }), supabase.rpc('shop_cards', { p_shops: quoteShops })])
      : [{ data: [] }, { data: [] }];
    const cards = Object.fromEntries(((cardRows.data ?? []) as ShopCard[]).map((c) => [c.id, { ...c, rating: c.rating == null ? null : Number(c.rating) }]));
    const transfer = Object.fromEntries(((pay.data ?? []) as { shop_id: string; instapay: boolean }[]).map((x) => [x.shop_id, x.instapay]));
    // delivery price of every offer to this customer's address (null = pickup only)
    const qids = (must(quotes) as Quote[]).map((q) => q.id);
    const opt = qids.length ? await supabase.rpc('delivery_options', { p_quotes: qids }) : { data: [] };
    const fees = Object.fromEntries(((opt.data ?? []) as { quote_id: string; fee: number | null }[]).map((x) => [x.quote_id, x.fee == null ? null : Number(x.fee)]));
    return {
      transfer, fees, cards,
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
  // featured shops (paid visibility) are listed first; the rest keep the cheapest-first order
  const quotesOf = (p: Request) => d.quotes.filter((q) => q.request_id === p.id)
    .sort((a, b) => Number(isFeatured(d.shops[b.shop_id])) - Number(isFeatured(d.shops[a.shop_id])));
  const open = d.parts.filter((p) => p.status === 'open');
  const current = d.parts.find((p) => p.id === tab) ?? open.find((p) => quotesOf(p).length) ?? open[0] ?? d.parts[0];
  const chosen = Object.entries(sel)
    .map(([pid, qid]) => ({ part: d.parts.find((p) => p.id === pid)!, quote: d.quotes.find((q) => q.id === qid)! }))
    .filter((x) => x.part && x.quote && x.part.status === 'open');
  const byShop = Object.values(chosen.reduce<Record<string, typeof chosen>>((acc, c) => ({ ...acc, [c.quote.shop_id]: [...(acc[c.quote.shop_id] ?? []), c] }), {}));
  // one delivery per shop: possible only if every chosen part from that shop can be delivered; its fee is the highest of them
  const groupOf = (sid: string) => chosen.filter((c) => c.quote.shop_id === sid);
  const canDeliver = (sid: string) => groupOf(sid).length > 0 && groupOf(sid).every((c) => d.fees[c.quote.id] != null);
  const feeOf = (sid: string) => Math.max(0, ...groupOf(sid).map((c) => d.fees[c.quote.id] ?? 0));
  const modeOf = (sid: string): Mode => (!canDeliver(sid) ? 'pickup' : modes[sid] ?? 'delivery');
  const partsTotal = chosen.reduce((s, c) => s + c.quote.price * (c.part.qty || 1), 0);
  const deliveryTotal = byShop.filter((g) => modeOf(g[0].quote.shop_id) === 'delivery').reduce((s, g) => s + feeOf(g[0].quote.shop_id), 0);
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
    setStep('offers'); setSel({});
    if (method === 'card' && ids.length === 1) {
      const err = await payByCard(ids[0]);
      setBusy(false);
      if (err) { toast(err); router.push({ pathname: '/order/[id]', params: { id: ids[0] } }); }
      return;
    }
    setBusy(false);
    toast(method === 'instapay' ? 'الأوردر اتسجّل، فاضل تحوّل وترفع الإيصال' : method === 'card' ? `اتعمل ${ar(ids.length)} أوردرات، ادفع كل واحد من صفحته` : ids.length > 1 ? `اتعمل ${ar(ids.length)} أوردرات` : 'الأوردر اتأكد مع المحل');
    if (ids.length === 1) router.push({ pathname: '/order/[id]', params: { id: ids[0], done: '1' } });
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
    const low = Math.min(...qs.map((y) => y.price));
    return (
      <View style={{ gap: 12 }}>
        <Row gap={12}>
          <Photo uri={photoUrl(p.photo_path)} size={52} />
          <View style={{ flex: 1 }}>
            <T w="bold" size={18}>{p.part}</T>
            <Muted size={12.5}>{extras.join('، ')}{p.notes ? `، «${p.notes}»` : ''}</Muted>
          </View>
          {qs.length && !order ? <Pill label={`${ar(qs.length)} ${qs.length > 1 ? 'عروض' : 'عرض'}`} tone="new" /> : null}
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
            <View style={[{ backgroundColor: colors.surface, borderRadius: 18, overflow: 'hidden' }, lift]}>
              {qs.map((q, i) => (
                <OfferRow key={q.id} q={q} shop={d.shops[q.shop_id]} card={d.cards[q.shop_id]} fee={d.fees[q.id]} on={sel[p.id] === q.id} first={i === 0}
                  cheapest={qs.length > 1 && qs.findIndex((x) => x.price === low) === i} qty={p.qty || 1}
                  onPick={() => pick(p, q)} onChat={() => router.push(`/chat/${p.id}/${q.shop_id}`)} />
              ))}
            </View>
            {dec?.n ? <Muted size={12.5}>{ar(dec.n)} {dec.n > 1 ? 'محلات قالوا' : 'محل قال'} إنها مش متوفرة عندهم.</Muted> : null}
          </>
        ) : dec?.n && dec.n >= d.shopCount ? (
          <View style={{ backgroundColor: colors.badSoft, borderRadius: 20, padding: 16, gap: 6 }}>
            <Row gap={8}><Icon name="alert-circle" size={22} color={colors.bad} /><T w="bold" size={15} color={colors.bad}>مش متوفرة عند المحلات دلوقتي</T></Row>
            <Muted size={13}>كل المحلات اللي شافت الطلب قالت إنها مش عندها.{dec.reasons.length ? ` السبب: «${dec.reasons[0]}»` : ''} جرّب "أي حاجة" بدل مستعمل/جديد، أو اسأل المساعد.</Muted>
          </View>
        ) : (
          <>
            <Searching since={p.created_at} make={p.car_make} />
            {dec?.n ? (
              <Row gap={8} style={{ backgroundColor: colors.surface, borderRadius: 16, padding: 12 }}>
                <Icon name="information-circle" size={18} color={colors.muted} />
                <Muted size={13} style={{ flex: 1 }}>محل قال إنها مش متوفرة عنده{dec.reasons.length ? ` («${dec.reasons[0]}»)` : ''}. لسه مستنيين باقي المحلات.</Muted>
              </Row>
            ) : null}
          </>
        )}
      </View>
    );
  };

  /* ---------------------------------------------------------------- checkout: three pages */
  if (step !== 'offers' && chosen.length) {
    const grand = partsTotal + deliveryTotal;
    const at = STEPS.findIndex((x) => x.v === step);
    const prev = () => setStep(at === 0 ? 'offers' : STEPS[at - 1].v);
    const shopName = (sid: string) => d.cards[sid]?.name ?? 'المحل';
    const totalRow = (
      <Row style={{ justifyContent: 'space-between' }}>
        <Muted size={13}>الإجمالي{step !== 'handover' ? '، ' + PAY_NAME[method] : ''}</Muted>
        <T w="bold" size={20} color={colors.primary}>{money(grand)} ج.م</T>
      </Row>
    );
    const footer = step === 'review' ? (
      <>{totalRow}<SlideToConfirm label={method === 'card' ? 'اسحب وكمّل للدفع' : 'اسحب لتأكيد الأوردر'} busy={busy} onConfirm={accept} /></>
    ) : (
      <>{totalRow}<Btn title={step === 'handover' ? 'التالي: الدفع' : 'التالي: مراجعة الأوردر'} icon="arrow-back" onPress={() => setStep(STEPS[at + 1].v)} /></>
    );
    return (
      <Screen footer={footer}>
        <BackBar title={STEPS[at].label} onBack={prev} />
        <Stepper at={at} />

        {step === 'handover' ? (
          <>
            <T w="bold" size={22}>هتستلم إزاي؟</T>
            {byShop.map((g) => {
              const sid = g[0].quote.shop_id;
              const shop = d.shops[sid];
              return (
                <Card key={sid}>
                  <ShopLine name={shopName(sid)} card={d.cards[sid]} sub={`${ar(g.length)} ${g.length > 1 ? 'قطع' : 'قطعة'}، ${shop?.area ?? ''}`} />
                  <RadioCard title="توصيل للبيت" icon="bicycle" right={canDeliver(sid) ? `+${money(feeOf(sid))} ج.م` : undefined}
                    sub={canDeliver(sid) ? 'سعر التوصيل من المحل حسب منطقتك' : !shop?.offers_delivery ? 'المحل ده مش بيوصّل' : g.length > 1 ? 'قطعة من دول استلام من المحل بس' : 'القطعة دي استلام من المحل بس (أو المحل مش بيوصّل لمنطقتك)'}
                    on={modeOf(sid) === 'delivery'} disabled={!canDeliver(sid)} onPress={() => setModes((m) => ({ ...m, [sid]: 'delivery' }))} />
                  <RadioCard title="استلام من المحل" sub="روح استلمها بنفسك" icon="walk" right="مجاناً"
                    on={modeOf(sid) === 'pickup'} onPress={() => setModes((m) => ({ ...m, [sid]: 'pickup' }))} />
                </Card>
              );
            })}
            {!allPickup && profile ? (
              <Card>
                <Row gap={10} style={{ alignItems: 'flex-start' }}>
                  <Icon name="location" size={20} color={colors.primary} />
                  <View style={{ flex: 1 }}><T w="semibold" size={14}>التوصيل على</T><Muted size={13}>{addressLine(profile)}</Muted></View>
                  <Btn kind="link" title="تغيير" onPress={() => router.push('/profile')} />
                </Row>
              </Card>
            ) : null}
          </>
        ) : step === 'payment' ? (
          <>
            <T w="bold" size={22}>هتدفع إزاي؟</T>
            <Muted size={13}>{handover === 'pickup' ? 'بتستلم من المحل، فدي طرق الدفع اللي تنفع.' : handover === 'delivery' ? 'بيوصلك البيت، فدي طرق الدفع اللي تنفع.' : 'في قطع هتتوصّل وقطع هتستلمها، فدي الطرق اللي تنفع للاتنين.'}</Muted>
            <PaymentPicker value={method} onPick={setPay} card={card} instapay={transferOk} handover={handover} />
          </>
        ) : (
          <>
            <T w="bold" size={22}>راجع الأوردر وأكّده</T>
            <View style={[{ backgroundColor: colors.surface, borderRadius: 18, overflow: 'hidden' }, lift]}>
              {byShop.map((g, gi) => {
                const sid = g[0].quote.shop_id;
                const mode = modeOf(sid);
                return (
                  <View key={sid} style={{ padding: 16, gap: 10, borderTopWidth: gi ? 1 : 0, borderColor: colors.line }}>
                    <ShopLine name={shopName(sid)} card={d.cards[sid]} sub={mode === 'delivery' ? `توصيل للبيت، ${money(feeOf(sid))} ج.م` : 'استلام من المحل'} />
                    {g.map((c) => (
                      <Row key={c.part.id} gap={10}>
                        <View style={{ flex: 1 }}>
                          <T w="semibold" size={14}>{c.part.part}{c.quote.brand ? ` (${c.quote.brand})` : ''}{c.part.qty > 1 ? ` × ${ar(c.part.qty)}` : ''}</T>
                          <Muted size={12}>{CONDITIONS[c.quote.condition]}، {warrantyLabel(c.quote.warranty_days)}</Muted>
                        </View>
                        <T w="semibold" size={14}>{money(c.quote.price * (c.part.qty || 1))} ج.م</T>
                      </Row>
                    ))}
                  </View>
                );
              })}
              <View style={{ padding: 16, gap: 8, backgroundColor: colors.soft }}>
                <Lines rows={[['القطع', money(partsTotal) + ' ج.م'], ['التوصيل', deliveryTotal ? money(deliveryTotal) + ' ج.م' : 'مجاناً'], ['الدفع', PAY_NAME[method]]]}
                  total={['الإجمالي', money(grand) + ' ج.م']} />
              </View>
            </View>
            <Row gap={8} style={{ backgroundColor: colors.primarySoft, borderRadius: 14, padding: 12 }}>
              <Icon name="document-text" size={18} color={colors.primary} />
              <Muted size={12.5} style={{ flex: 1 }}>بعد التأكيد هيتعمل لك إيصال PDF تقدر تحمّله من صفحة الأوردر.</Muted>
            </Row>
            {open.length > chosen.length ? <Muted size={12.5}>باقي القطع ({ar(open.length - chosen.length)}) هتفضل في طلب الأسعار مستنية عروض.</Muted> : null}
            <Muted size={12} center>بتأكيد الأوردر انت موافق على الشروط. افحص القطعة وانت بتستلم: لو مش زي الوصف ترفضها، أو بلّغنا خلال {ar(MATCH_HOURS)} ساعة.</Muted>
          </>
        )}
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
      <Btn title="كمّل" icon="arrow-back" onPress={() => setStep('handover')} style={{ minWidth: 150 }} />
    </Row>
  ) : undefined;
  const withOffers = d.parts.filter((p) => quotesOf(p).length && p.status === 'open').length;

  return (
    <Screen footer={footer}>
      <BackBar title={'طلب أسعار ' + reqNo(first.num)} onBack={back} />
      <View style={{ backgroundColor: colors.ink, borderRadius: 18, padding: 16, gap: 14 }}>
        <Row gap={14}>
          <Plate top={first.car_model || '—'} bottom={ar(first.car_year)} size="sm" />
          <View style={{ flex: 1 }}>
            <T w="bold" size={16} color="#fff">{d.parts.length > 1 ? `${ar(d.parts.length)} قطع` : first.part}</T>
            <T size={12.5} color="rgba(255,255,255,.7)">{first.car_make} {first.car_model}</T>
          </View>
          <Since iso={first.created_at} />
        </Row>
        {d.quotes.length ? (
          <Row gap={8} style={{ backgroundColor: colors.lime, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9 }}>
            <Icon name="pricetags" size={18} color={colors.ink} />
            <T w="bold" size={14} color={colors.ink} style={{ flex: 1 }}>
              {ar(d.quotes.filter((q) => open.some((p) => p.id === q.request_id)).length)} عروض وصلتك{d.parts.length > 1 ? ` على ${ar(withOffers)} من ${ar(d.parts.length)} قطع` : ''}، اختار اللي يناسبك
            </T>
          </Row>
        ) : null}
      </View>

      {bundle && !chosen.length ? (
        <Press onPress={() => setSel(Object.fromEntries(open.map((p, i) => [p.id, bundle.qs[i].id])))}
          style={{ backgroundColor: colors.accentSoft, borderRadius: 18, padding: 16, gap: 6, borderWidth: 1.5, borderColor: colors.accent }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Row gap={8}><Icon name="bag-check" size={20} color={colors.accentDeep} /><T w="bold" size={15}>كل القطع من محل واحد</T></Row>
            <T w="bold" size={17}>{money(bundle.total)} ج.م</T>
          </Row>
          <Muted size={12.5}>{d.cards[bundle.sid]?.name ?? 'محل'} عنده كل القطع اللي لسه مفتوحة. أوردر واحد وتوصيل واحد.</Muted>
        </Press>
      ) : null}

      {d.parts.length > 1 ? (
        <TabPills items={d.parts.map((p) => ({ v: p.id, label: p.part, mark: partMark(p) }))} value={current.id} onPick={setTab} />
      ) : null}
      {panel(current)}

      {open.length ? (
        <View style={{ gap: 6, alignItems: 'center' }}>
          <Muted center size={12}>بياناتك مش بتظهر للمحل غير بعد ما تأكد الأوردر. ممنوع تبادل الأرقام في الشات.</Muted>
          <Btn kind="link" title={open.length > 1 ? 'إلغاء القطع المفتوحة' : 'إلغاء الطلب'} loading={busy} onPress={cancelOpen} style={{ alignSelf: 'center' }} />
        </View>
      ) : null}

    </Screen>
  );
}

/** Checkout progress: الاستلام → الدفع → التأكيد. */
function Stepper({ at }: { at: number }) {
  return (
    <Row gap={6}>
      {STEPS.map((s, i) => (
        <View key={s.v} style={{ flex: 1, gap: 6 }}>
          <View style={{ height: 4, borderRadius: 2, backgroundColor: i <= at ? colors.primary : colors.line }} />
          <Row gap={5}>
            <View style={{ width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: i < at ? colors.primary : i === at ? colors.ink : colors.soft }}>
              {i < at ? <Icon name="checkmark" size={12} color="#fff" /> : <T size={10.5} w="bold" color={i === at ? '#fff' : colors.muted} style={{ lineHeight: 16 }}>{ar(i + 1)}</T>}
            </View>
            <T size={12.5} w={i === at ? 'bold' : 'medium'} color={i <= at ? colors.ink : colors.muted}>{s.label}</T>
          </Row>
        </View>
      ))}
    </Row>
  );
}

/** Shop name with rating and how fast it usually answers. */
function ShopLine({ name, card, sub }: { name: string; card?: ShopCard; sub?: string }) {
  return (
    <Row gap={10}>
      <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}><Icon name="storefront" size={18} color={colors.primary} /></View>
      <View style={{ flex: 1 }}>
        <Row gap={6}><T w="bold" size={14.5} numberOfLines={1}>{name}</T>{card?.rating ? <T size={12.5} w="semibold" color={colors.warn}>★ {ar(card.rating.toFixed(1)).replace('.', '٫')}</T> : null}</Row>
        {sub ? <Muted size={12}>{sub}</Muted> : null}
      </View>
    </Row>
  );
}

/** One offer as a slim row: radio, price, shop, and the details in one line. */
function OfferRow({ q, shop, card, fee, on, first, cheapest, qty, onPick, onChat }: {
  q: Quote; shop?: Shop; card?: ShopCard; fee?: number | null; on: boolean; first: boolean; cheapest: boolean; qty: number; onPick: () => void; onChat: () => void;
}) {
  const details = [q.brand, CONDITIONS[q.condition], warrantyLabel(q.warranty_days), fee != null ? `توصيل ${money(fee)} ج.م` : 'استلام من المحل بس'].filter(Boolean).join('، ');
  return (
    <Press onPress={onPick} selected={on} label={`عرض ${money(q.price)} جنيه`}
      style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingHorizontal: 14, paddingVertical: 14, borderTopWidth: first ? 0 : 1, borderColor: colors.line, backgroundColor: on ? colors.primarySoft : colors.surface }}>
      <View style={{ width: 22, height: 22, marginTop: 6, borderRadius: 11, borderWidth: 2, borderColor: on ? colors.primary : colors.faint, alignItems: 'center', justifyContent: 'center' }}>
        {on ? <View style={{ width: 11, height: 11, borderRadius: 6, backgroundColor: colors.primary }} /> : null}
      </View>
      <View style={{ flex: 1, gap: 3 }}>
        <Row gap={6} style={{ flexWrap: 'wrap' }}>
          <T w="bold" size={20} style={{ lineHeight: 30 }}>{money(q.price)}</T>
          <T size={12.5} color={colors.muted}>ج.م{qty > 1 ? ' للقطعة' : ''}</T>
          {cheapest ? <Pill label="الأرخص" tone="accent" /> : null}
          {isFeatured(shop) ? <Pill label="محل مميز" icon="star" tone="wait" /> : null}
        </Row>
        <Pressable onPress={() => router.push(`/shop-profile/${q.shop_id}`)} hitSlop={4}>
          <Row gap={6} style={{ flexWrap: 'wrap' }}>
            <T w="semibold" size={13.5} color={colors.primary}>{card?.name ?? 'محل موثّق'}</T>
            {card?.rating ? <T size={12.5} w="semibold" color={colors.warn}>★ {ar(card.rating.toFixed(1)).replace('.', '٫')}</T> : null}
            <Row gap={3}><Icon name="flash" size={12} color={colors.good} /><T size={12} color={colors.good} w="medium">{replyLabel(card?.reply_min)}</T></Row>
          </Row>
        </Pressable>
        <Muted size={12.5}>{details}</Muted>
        {q.note ? <Muted size={12.5}>«{q.note}»</Muted> : null}
      </View>
      <View style={{ alignItems: 'center', gap: 8 }}>
        {q.photo_path ? <Photo uri={photoUrl(q.photo_path)} size={48} /> : null}
        <Press onPress={onChat} label="اسأل المحل" style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.soft, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="chatbubble-ellipses" size={17} color={colors.ink} />
        </Press>
      </View>
    </Press>
  );
}

/** A live stopwatch since the request went out: the app is about speed. */
function Since({ iso }: { iso: string }) {
  const now = useNow(1000);
  return (
    <View style={{ alignItems: 'center', backgroundColor: 'rgba(255,255,255,.08)', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6 }}>
      <Row gap={4}><Icon name="time" size={13} color={colors.accent} /><T w="bold" size={13.5} color="#fff">{elapsed(iso, now)}</T></Row>
      <T size={10.5} color="rgba(255,255,255,.6)">من ساعة الطلب</T>
    </View>
  );
}

/** A calm pulse while shops look at the request (no shop count: it is low at launch). */
function Searching({ since, make }: { since: string; make: string }) {
  const a = useRef(new Animated.Value(0)).current;
  const now = useNow(1000);
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(a, { toValue: 1, duration: 1800, easing: Easing.out(Easing.quad), useNativeDriver: Platform.OS !== 'web' }));
    loop.start(); return () => loop.stop();
  }, [a]);
  return (
    <View style={[{ backgroundColor: colors.surface, borderRadius: 18, paddingVertical: 26, paddingHorizontal: 16, alignItems: 'center', gap: 10 }, lift]}>
      <View style={{ width: 90, height: 90, alignItems: 'center', justifyContent: 'center' }}>
        <Animated.View style={{ position: 'absolute', width: 90, height: 90, borderRadius: 45, backgroundColor: colors.accent, opacity: a.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0] }), transform: [{ scale: a.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1.2] }) }] }} />
        <View style={{ width: 54, height: 54, borderRadius: 27, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' }}><Icon name="storefront" size={24} color={colors.ink} /></View>
      </View>
      <T w="bold" size={16}>طلبك وصل لمحلات {make}</T>
      <Row gap={4}><Icon name="time" size={14} color={colors.muted} /><Muted size={13}>بقاله {elapsed(since, now)}</Muted></Row>
      <Muted center size={13}>أول ما محل يبعت سعر هيظهر هنا ويوصلك إشعار.</Muted>
    </View>
  );
}

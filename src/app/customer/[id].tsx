import { AddressPicker, addressProblem, rememberAddress, type AddressChoice } from '@/components/AddressPicker';
import { ConfirmSheet, GuaranteeSheet } from '@/components/Confirm';
import { PushPrompt } from '@/components/PushPrompt';
import { LegalLinks } from '@/components/LegalLinks';
import { isFeatured } from '@/components/AdBanner';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, Platform, Pressable, View } from 'react-native';
import { PaymentPicker, RadioCard, payOptions, type Handover } from '@/components/Payment';
import {
  BackBar, Btn, Card, Chips, Empty, Field, Icon, Lines, Loading, Muted, Photo, Pill, Plate, Press, Row, Screen, Seg, Sheet, SlideToConfirm, T, TabPills, toast,
} from '@/components/ui';
import { useAuth } from '@/lib/auth';
import {
  CONDITIONS, warrantyLabel, ORDER_LABEL, SIDES, WANTED, ar, elapsed, friendlyError, money, orderNo, replyLabel, reqNo,
  type Order, type PayMethod, type Quote, type Request, type Shop, type ShopCard,
} from '@/lib/data';
import { partIsSided } from '@/lib/assistant';
import { PAY_NAME, payByCard } from '@/lib/payments';
import { pickPhoto, uploadPhoto } from '@/lib/photos';
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
  const card = false; // card payment stays hidden until it is switched on (A19)
  const [busy, setBusy] = useState(false);
  const [addr, setAddr] = useState<AddressChoice | null>(null);
  const [askCancel, setAskCancel] = useState(false);
  const [guarantee, setGuarantee] = useState(false);
  const [editing, setEditing] = useState<Request | null>(null);
  const now = useNow(60000);

  // while any part is still waiting for offers, also check every 12 seconds in case the live connection dropped
  const waitingRef = useRef(true);
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
  }, ['requests', 'quotes', 'orders', 'declines'], [id], { pollMs: waitingRef.current ? 12000 : undefined });

  if (ready && !session) return <Redirect href="/login" />;
  const back = () => (router.canGoBack() ? router.back() : router.replace('/customer/requests'));
  if (loading && !data) return <Screen><Loading /></Screen>;
  const d = data!;
  waitingRef.current = !!d.req && d.parts.some((p) => p.status === 'open');
  const r = d?.req;
  if (!r) return <Screen><BackBar title="الطلب" onBack={back} /><Empty text="الطلب ده مش موجود." /></Screen>;
  const expiredQ = (q: Quote) => new Date(q.expires_at).getTime() <= now;
  // a single part that already became an order lives on the order page
  if (d.parts.length === 1 && r.order_id) return <Redirect href={{ pathname: '/order/[id]', params: { id: r.order_id } }} />;

  const first = d.parts[0];
  // cheapest total first (price × qty + delivery); at most one featured offer goes on top, marked; ended offers last
  const totalOf = (q: Quote, p: Request) => q.price * (p.qty || 1) + (d.fees[q.id] ?? 0);
  const quotesOf = (p: Request) => {
    const all = d.quotes.filter((q) => q.request_id === p.id);
    const live = all.filter((q) => !expiredQ(q)).sort((a, b) => totalOf(a, p) - totalOf(b, p));
    const feat = live.find((q) => isFeatured(d.shops[q.shop_id]));
    return [...(feat ? [feat] : []), ...live.filter((q) => q !== feat), ...all.filter(expiredQ)];
  };
  const featuredOf = (p: Request) => { const f = quotesOf(p)[0]; return f && !expiredQ(f) && isFeatured(d.shops[f.shop_id]) ? f.id : null; };
  const open = d.parts.filter((p) => p.status === 'open');
  const current = d.parts.find((p) => p.id === tab) ?? open.find((p) => quotesOf(p).length) ?? open[0] ?? d.parts[0];
  const chosen = Object.entries(sel)
    .map(([pid, qid]) => ({ part: d.parts.find((p) => p.id === pid)!, quote: d.quotes.find((q) => q.id === qid)! }))
    .filter((x) => x.part && x.quote && x.part.status === 'open' && !expiredQ(x.quote));
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
        .filter((sid) => open.every((p) => quotesOf(p).some((q) => q.shop_id === sid && !expiredQ(q))))
        .map((sid) => ({ sid, qs: open.map((p) => quotesOf(p).find((q) => q.shop_id === sid && !expiredQ(q))!), total: open.reduce((s, p) => s + quotesOf(p).find((q) => q.shop_id === sid && !expiredQ(q))!.price * (p.qty || 1), 0) }))
        .sort((a, b) => a.total - b.total)[0]
    : undefined;

  function pick(p: Request, q: Quote) {
    if (expiredQ(q)) return toast('العرض ده انتهى.');
    setSel((s) => (s[p.id] === q.id ? Object.fromEntries(Object.entries(s).filter(([k]) => k !== p.id)) : { ...s, [p.id]: q.id }));
    // move on to the next part still without a choice
    const nextPart = open.find((x) => x.id !== p.id && !sel[x.id] && quotesOf(x).some((y) => !expiredQ(y)));
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
      p_address: !allPickup && addr ? addr.address : null,
    });
    if (error) {
      setBusy(false);
      const m = friendlyError(error);
      if (/offer expired|cannot choose/i.test(String(error.message))) { setStep('offers'); setSel({}); }
      return toast(m === 'حصلت مشكلة. جرّب تاني.' ? 'الأوردر مااتأكدش. اتأكد من النت وجرّب تاني.' : m);
    }
    if (!allPickup && addr && profile) rememberAddress(addr, profile.id).catch(() => {});
    const ids = (made ?? []) as string[];
    setStep('offers'); setSel({});
    if (method === 'card' && ids.length === 1) {
      const err = await payByCard(ids[0]);
      setBusy(false);
      if (err) { toast(err); router.push({ pathname: '/order/[id]', params: { id: ids[0] } }); }
      return;
    }
    setBusy(false);
    toast(method === 'instapay' ? 'الأوردر اتسجّل. فاضل تحوّل وترفع صورة الإيصال.' : method === 'card' ? `اتعمل ${ar(ids.length)} أوردرات، ادفع كل واحد من صفحته` : ids.length > 1 ? `اتعمل ${ar(ids.length)} أوردرات.` : 'الأوردر اتأكد. المحل بدأ يجهّزه.');
    if (ids.length === 1) router.push({ pathname: '/order/[id]', params: { id: ids[0], done: '1' } });
    else router.push('/customer/requests');
  }
  async function cancelOpen() {
    setBusy(true);
    for (const p of open) await supabase.rpc('cancel_request', { p_request: p.id });
    setBusy(false); setAskCancel(false); toast('الطلب اتلغى.');
  }

  const partMark = (p: Request) => {
    if (p.order_id) return { icon: 'checkmark-circle', color: colors.good };
    if (p.status === 'cancelled' || p.status === 'expired') return { icon: 'close-circle', color: colors.faint };
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
    const extras = [WANTED[p.wanted_condition], p.side ? SIDES[p.side] : '', p.qty > 1 ? `العدد ${ar(p.qty)}` : '', p.notes ? `«${p.notes}»` : ''].filter(Boolean);
    const liveQs = qs.filter((q) => !expiredQ(q));
    const low = Math.min(...liveQs.map((y) => totalOf(y, p)));
    const feat = featuredOf(p);
    const editLink = p.status === 'open' ? <Btn kind="link" title="عدّل الطلب" onPress={() => setEditing(p)} style={{ alignSelf: 'flex-start' }} /> : null;
    const longWait = Date.now() - new Date(p.created_at).getTime() > 2 * 3600000;
    return (
      <View style={{ gap: 12 }}>
        <Row gap={12}>
          <Photo uri={photoUrl(p.photo_path)} size={52} />
          <View style={{ flex: 1 }}>
            <T w="bold" size={18}>{p.part}</T>
            <Muted size={12.5}>{extras.join(' · ')}</Muted>
          </View>
          {liveQs.length && !order ? <Pill label={liveQs.length > 1 ? `${ar(liveQs.length)} عروض` : 'عرض'} tone="new" /> : null}
        </Row>

        {order ? (
          <Press onPress={() => router.push({ pathname: '/order/[id]', params: { id: order.id } })}
            style={[{ backgroundColor: colors.goodSoft, borderRadius: 20, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }]}>
            <Icon name={ORDER_LABEL[order.status].icon} size={26} color={colors.good} />
            <View style={{ flex: 1 }}>
              <T w="bold" size={15}>القطعة دي في أوردر {orderNo(order.order_no)} · {ORDER_LABEL[order.status].short}</T>
              <Muted size={12.5}>اضغط لمتابعة الأوردر.</Muted>
            </View>
            <Icon name="chevron-back" size={18} color={colors.good} />
          </Press>
        ) : p.status === 'cancelled' ? (
          <Empty icon="close-circle-outline" text="القطعة دي اتلغت من الطلب." />
        ) : p.status === 'expired' ? (
          <Empty icon="time-outline" text="الطلب ده انتهى من غير أوردر." action={{ label: 'اطلب تاني', onPress: () => router.push({ pathname: '/customer/new', params: { part: p.part, cond: p.wanted_condition, notes: p.notes, side: p.side } }) }} />
        ) : qs.length ? (
          <>
            <View style={[{ backgroundColor: colors.surface, borderRadius: 18, overflow: 'hidden' }, lift]}>
              {qs.map((q, i) => (
                <OfferRow key={q.id} q={q} shop={d.shops[q.shop_id]} card={d.cards[q.shop_id]} fee={d.fees[q.id]} on={sel[p.id] === q.id} first={i === 0}
                  cheapest={liveQs.length > 1 && !expiredQ(q) && liveQs.findIndex((x) => totalOf(x, p) === low) === liveQs.indexOf(q)} featured={q.id === feat}
                  expired={expiredQ(q)} now={now} qty={p.qty || 1} onGuarantee={() => setGuarantee(true)}
                  onPick={() => pick(p, q)} onChat={() => router.push(`/chat/${p.id}/${q.shop_id}`)} />
              ))}
            </View>
            {dec?.n ? <Muted size={12.5}>{dec.n > 1 ? `${ar(dec.n)} محلات قالوا إنها مش عندهم.` : 'محل قال إنها مش عنده.'}</Muted> : null}
          </>
        ) : dec?.n && dec.n >= d.shopCount ? (
          <View style={{ backgroundColor: colors.badSoft, borderRadius: 20, padding: 16, gap: 6 }}>
            <Row gap={8}><Icon name="alert-circle" size={22} color={colors.bad} /><T w="bold" size={15} color={colors.bad}>مش متوفرة دلوقتي</T></Row>
            <Muted size={13}>كل المحلات اللي شافت الطلب قالت إنها مش عندها. جرّب تختار «جديد أو مستعمل» أو تضيف صورة.</Muted>
            {editLink}
          </View>
        ) : (
          <>
            <Searching since={p.created_at} make={p.car_make} />
            {longWait ? (
              <View style={{ backgroundColor: colors.warnSoft, borderRadius: 16, padding: 14, gap: 4 }}>
                <Row gap={8} style={{ alignItems: 'flex-start' }}><Icon name="bulb" size={18} color={colors.warn} />
                  <T size={13.5} style={{ flex: 1 }}>لسه مفيش عروض. صورة القطعة أو اختيار «جديد أو مستعمل» بتجيب عروض أكتر.</T></Row>
                {editLink}
              </View>
            ) : null}
            {dec?.n ? (
              <Row gap={8} style={{ backgroundColor: colors.surface, borderRadius: 16, padding: 12 }}>
                <Icon name="information-circle" size={18} color={colors.muted} />
                <Muted size={13} style={{ flex: 1 }}>محل قال إنها مش عنده{dec.reasons.length ? ` («${dec.reasons[0]}»)` : ''}. لسه مستنيين باقي المحلات.</Muted>
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
    const goNext = () => {
      if (step === 'handover' && !allPickup) { const bad = addressProblem(addr); if (bad) return toast(bad); }
      setStep(STEPS[at + 1].v);
    };
    const footer = step === 'review' ? (
      <>{totalRow}<SlideToConfirm label={method === 'card' ? 'اسحب وكمّل للدفع' : 'اسحب لتأكيد الأوردر'} busy={busy} onConfirm={accept} /></>
    ) : (
      <>{totalRow}<Btn title={step === 'handover' ? 'التالي: الدفع' : 'التالي: مراجعة الأوردر'} icon="arrow-back" onPress={goNext} /></>
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
                  <ShopLine name={shopName(sid)} card={d.cards[sid]} sub={[`${ar(g.length)} ${g.length > 1 ? 'قطع' : 'قطعة'}`, shop?.area].filter(Boolean).join(' · ')} />
                  <RadioCard title="توصيل لعنوانك" icon="bicycle" right={canDeliver(sid) ? `+${money(feeOf(sid))} ج.م` : undefined}
                    sub={canDeliver(sid) ? 'سعر التوصيل من المحل حسب منطقتك' : !shop?.offers_delivery ? 'المحل ده مش بيوصّل' : g.length > 1 && g.some((c) => d.fees[c.quote.id] != null) ? 'قطعة من دول استلام من المحل بس' : 'المحل مش بيوصّل لمنطقتك'}
                    on={modeOf(sid) === 'delivery'} disabled={!canDeliver(sid)} onPress={() => setModes((m) => ({ ...m, [sid]: 'delivery' }))} />
                  <RadioCard title="استلام من المحل" sub="العنوان ومواعيد المحل هتظهر بعد التأكيد" icon="walk" right="مجاناً"
                    on={modeOf(sid) === 'pickup'} onPress={() => setModes((m) => ({ ...m, [sid]: 'pickup' }))} />
                </Card>
              );
            })}
            {!allPickup && profile ? <AddressPicker profile={profile} value={addr} onChange={setAddr} /> : null}
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
                    <ShopLine name={shopName(sid)} card={d.cards[sid]} sub={mode === 'delivery' ? `توصيل ${money(feeOf(sid))} ج.م` : 'استلام من المحل'} />
                    {g.map((c) => (
                      <Row key={c.part.id} gap={10}>
                        <View style={{ flex: 1 }}>
                          <T w="semibold" size={14}>{c.part.part}{c.quote.brand ? ` (${c.quote.brand})` : ''}{c.part.qty > 1 ? ` × ${ar(c.part.qty)}` : ''}</T>
                          <Muted size={12}>{CONDITIONS[c.quote.condition]} · {warrantyLabel(c.quote.warranty_days)}</Muted>
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
              <Muted size={12.5} style={{ flex: 1 }}>بعد التأكيد هيتعملك إيصال PDF فيه الضمان، تقدر تحمّله من صفحة الأوردر.</Muted>
            </Row>
            {byShop.length > 1 ? <Muted size={12.5}>هيتعمل {ar(byShop.length)} أوردرات، واحد لكل محل.</Muted> : null}
            {open.length > chosen.length ? <Muted size={12.5}>باقي القطع ({ar(open.length - chosen.length)}) هتفضل في الطلب مستنية عروض.</Muted> : null}
            <Muted size={12} center>افحص القطعة قبل ما تدّي الكود أو تدفع. لو مش زي العرض ارفضها. بعد الاستلام، الاسترجاع بيكون مع المحل حسب القانون.</Muted>
            <LegalLinks lead="بتأكيد الأوردر بتوافق على" withCancellation />
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
  const withOffers = d.parts.filter((p) => quotesOf(p).some((q) => !expiredQ(q)) && p.status === 'open').length;
  const liveCount = d.quotes.filter((q) => !expiredQ(q) && open.some((p) => p.id === q.request_id)).length;

  return (
    <Screen footer={footer}>
      <BackBar title={'طلب ' + reqNo(first.num)} onBack={back} />
      <View style={{ backgroundColor: colors.ink, borderRadius: 18, padding: 16, gap: 14 }}>
        <Row gap={14}>
          <Plate top={first.car_model || '—'} bottom={ar(first.car_year)} size="sm" />
          <View style={{ flex: 1 }}>
            <T w="bold" size={16} color="#fff">{d.parts.length > 1 ? `${ar(d.parts.length)} قطع` : first.part}</T>
            <T size={12.5} color="rgba(255,255,255,.7)">{first.car_make} {first.car_model}</T>
          </View>
          <Since iso={first.created_at} />
        </Row>
        {liveCount ? (
          <Row gap={8} style={{ backgroundColor: colors.lime, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9 }}>
            <Icon name="pricetags" size={18} color={colors.ink} />
            <T w="bold" size={14} color={colors.ink} style={{ flex: 1 }}>
              {d.parts.length > 1 ? `وصلك ${ar(liveCount)} عروض على ${ar(withOffers)} من ${ar(d.parts.length)} قطع.` : `وصلك ${liveCount > 1 ? ar(liveCount) + ' عروض' : 'عرض'}. اختار اللي يناسبك.`}
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
          <Muted size={12.5}>{d.cards[bundle.sid]?.name ?? 'محل موثّق'} عنده كل القطع. أوردر واحد وتوصيل واحد.</Muted>
        </Press>
      ) : null}

      {!d.quotes.length ? <PushPrompt kind="ask" /> : null}

      {d.parts.length > 1 ? (
        <TabPills items={d.parts.map((p) => ({ v: p.id, label: p.part, mark: partMark(p) }))} value={current.id} onPick={setTab} />
      ) : null}
      {panel(current)}

      {open.length ? (
        <View style={{ gap: 6, alignItems: 'center' }}>
          <Muted center size={12}>رقمك وعنوانك بيظهروا للمحل بس بعد تأكيد الأوردر. ضمان ضغطة بيغطي الأوردرات اللي بتتأكد من التطبيق بس.</Muted>
          <Btn kind="link" title={open.length > 1 ? 'إلغاء القطع المفتوحة' : 'إلغاء الطلب'} onPress={() => setAskCancel(true)} style={{ alignSelf: 'center' }} />
        </View>
      ) : null}

      <ConfirmSheet open={askCancel} title="تلغي الطلب؟" body="المحلات مش هتقدر تبعت عروض تاني." yes="أيوه، الغي" danger busy={busy} onYes={cancelOpen} onClose={() => setAskCancel(false)} />
      <GuaranteeSheet open={guarantee} onClose={() => setGuarantee(false)} />
      {editing ? <EditRequest part={editing} onClose={() => setEditing(null)} /> : null}

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
function OfferRow({ q, card, fee, on, first, cheapest, featured, expired, now, qty, onPick, onChat, onGuarantee }: {
  q: Quote; shop?: Shop; card?: ShopCard; fee?: number | null; on: boolean; first: boolean; cheapest: boolean; featured: boolean; expired: boolean; now: number; qty: number;
  onPick: () => void; onChat: () => void; onGuarantee: () => void;
}) {
  const details = [q.brand, CONDITIONS[q.condition], warrantyLabel(q.warranty_days), fee != null ? `توصيل ${money(fee)} ج.م` : 'استلام من المحل بس'].filter(Boolean).join(' · ');
  const left = new Date(q.expires_at).getTime() - now;
  const soon = !expired && left < 6 * 3600000;
  const leftText = left >= 3600000 ? `${ar(Math.floor(left / 3600000))} ساعة` : `${ar(Math.max(1, Math.ceil(left / 60000)))} دقيقة`;
  return (
    <Press onPress={onPick} selected={on} label={`عرض ${money(q.price)} جنيه`}
      style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingHorizontal: 14, paddingVertical: 14, borderTopWidth: first ? 0 : 1, borderColor: colors.line, backgroundColor: on ? colors.primarySoft : colors.surface, opacity: expired ? 0.55 : 1 }}>
      <View style={{ width: 22, height: 22, marginTop: 6, borderRadius: 11, borderWidth: 2, borderColor: on ? colors.primary : colors.faint, alignItems: 'center', justifyContent: 'center' }}>
        {on ? <View style={{ width: 11, height: 11, borderRadius: 6, backgroundColor: colors.primary }} /> : null}
      </View>
      <View style={{ flex: 1, gap: 3 }}>
        <Row gap={6} style={{ flexWrap: 'wrap' }}>
          <T w="bold" size={20} style={{ lineHeight: 30 }}>{money(q.price)}</T>
          <T size={12.5} color={colors.muted}>ج.م{qty > 1 ? ' للقطعة' : ''}</T>
          {cheapest ? <Pill label="الأرخص" tone="accent" /> : null}
          {featured ? <Pill label="مميّز" icon="star" tone="wait" /> : null}
          {expired ? <Pill label="العرض ده انتهى" tone="plain" /> : null}
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
        {!expired ? (
          <Row gap={10} style={{ flexWrap: 'wrap' }}>
            <Pressable onPress={onGuarantee} hitSlop={6} accessibilityRole="button">
              <Row gap={4}><Icon name="shield-checkmark" size={13} color={colors.good} /><T size={12} w="semibold" color={colors.good}>محمي بضمان ضغطة</T></Row>
            </Pressable>
            {soon ? <Row gap={4}><Icon name="time" size={13} color={colors.warn} /><T size={12} w="medium" color={colors.warn}>بينتهي بعد {leftText}</T></Row> : null}
          </Row>
        ) : null}
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
      <T size={10.5} color="rgba(255,255,255,.6)">من وقت الطلب</T>
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
      <Muted center size={13}>أول ما محل يبعت عرض هيظهر هنا وهيوصلك إشعار.</Muted>
    </View>
  );
}

/** «عدّل الطلب»: change the condition, side, note or photo while the request is open (A17). */
function EditRequest({ part, onClose }: { part: Request; onClose: () => void }) {
  const [cond, setCond] = useState(part.wanted_condition);
  const [side, setSide] = useState<string>(part.side);
  const [notes, setNotes] = useState(part.notes);
  const [photo, setPhoto] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    try {
      const path = photo ? await uploadPhoto(photo, part.customer_id) : null;
      const { error } = await supabase.rpc('edit_request', { p_request: part.id, p_condition: cond, p_side: side, p_notes: notes, p_photo: path });
      if (error) throw error;
      toast('الطلب اتعدّل.'); onClose();
    } catch (e) { toast(friendlyError(e)); }
    setBusy(false);
  }
  return (
    <Sheet open onClose={onClose} title="عدّل الطلب">
      <View style={{ gap: 14 }}>
        <T w="bold" size={16}>{part.part}</T>
        <Seg options={[{ v: 'any', label: 'جديد أو مستعمل' }, { v: 'used', label: 'مستعمل بس' }, { v: 'new', label: 'جديد بس' }]} value={cond} onPick={(v) => setCond(v as Request['wanted_condition'])} />
        {partIsSided(part.part) ? <Chips options={[{ v: 'right', label: 'يمين' }, { v: 'left', label: 'شمال' }, { v: 'both', label: 'الاتنين' }]} selected={[side]} onPick={(v) => setSide(side === v ? '' : v)} /> : null}
        <Press onPress={async () => { try { const u = await pickPhoto(); if (u) setPhoto(u); } catch { toast('الصورة دي مش مدعومة. اختار صورة JPG أو PNG.'); } }}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: 16, borderWidth: 1.5, borderStyle: 'dashed', borderColor: photo || part.photo_path ? colors.good : colors.line }}>
          {photo ? <Image source={{ uri: photo }} style={{ width: 44, height: 44, borderRadius: 10 }} /> : part.photo_path ? <Photo uri={photoUrl(part.photo_path)} size={44} /> : (
            <View style={{ width: 44, height: 44, borderRadius: 10, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' }}><Icon name="camera" size={20} color={colors.accentDeep} /></View>
          )}
          <T size={13.5} w="medium" style={{ flex: 1 }}>{photo || part.photo_path ? 'الصورة اتضافت · تغيير' : 'صوّر القطعة القديمة (اختياري)'}</T>
        </Press>
        <Field value={notes} onChangeText={setNotes} placeholder="ملاحظة للمحل (اختياري)" />
        <Btn title="احفظ" loading={busy} onPress={save} />
      </View>
    </Sheet>
  );
}

import { AppointmentPicker } from '@/components/Appointment';
import { AddressPicker, addressProblem, rememberAddress, type AddressChoice } from '@/components/AddressPicker';
import { ConfirmSheet, GuaranteeSheet } from '@/components/Confirm';
import { PushPrompt } from '@/components/PushPrompt';
import { LegalLinks } from '@/components/LegalLinks';
import { isFeatured } from '@/components/AdBanner';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, Platform, Pressable, View } from 'react-native';
import { PaymentPicker, payOptions, type Handover } from '@/components/Payment';
import {
  BackBar, Btn, Chips, Empty, Field, Icon, Lines, Loading, Muted, Photo, Pill, Press, Row, Screen, Seg, Sheet, T, TabPills, toast,
} from '@/components/ui';
import { useAuth } from '@/lib/auth';
import {
  CONDITIONS, warrantyLabel, ORDER_LABEL, SIDES, WANTED, ar, elapsed, friendlyError, money, orderNo, replyLabel, reqNo,
  type Order, type PayMethod, type Quote, type Request, type Shop, type ShopCard, SHOP_COLS,
} from '@/lib/data';
import { partIsSided } from '@/lib/assistant';
import { depositFor, depositRules, payByCard, type DepositRules } from '@/lib/payments';
import { pickPhoto, uploadPhoto } from '@/lib/photos';
import { must, useLive, useNow } from '@/lib/live';
import { photoUrl, supabase } from '@/lib/supabase';
import { colors, lift } from '@/lib/theme';
import { t } from '@/lib/i18n';
import { carLabel } from '@/lib/catalogue';

type Mode = 'delivery' | 'pickup';
type Declines = Record<string, { n: number; reasons: string[] }>;
type Data = { req: Request | null; parts: Request[]; quotes: Quote[]; shops: Record<string, Shop>; orders: Record<string, Order>; declines: Declines; shopCount: number; transfer: Record<string, boolean>; fees: Record<string, number | null>; cards: Record<string, ShopCard> };
type Step = 'offers' | 'checkout';
type Sort = 'best' | 'cheap' | 'warranty' | 'fast';
const SORTS: { v: Sort; label: string }[] = [{ v: 'best', label: t('الأنسب') }, { v: 'cheap', label: t('الأرخص') }, { v: 'warranty', label: t('الضمان') }, { v: 'fast', label: t('الأسرع رد') }];

/** A price request: offers per part, side by side. Accepted parts move into orders. */
export default function PriceRequest() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { ready, session, profile } = useAuth();
  const [tab, setTab] = useState<string | null>(null);
  const [sel, setSel] = useState<Record<string, string>>({}); // part id → quote id
  const [modes, setModes] = useState<Record<string, Mode>>({});
  const [inst, setInst] = useState<Record<string, boolean>>({}); // shop id → install at the shop
  const [instAt, setInstAt] = useState<Record<string, string>>({}); // shop id → appointment (ISO)
  const [step, setStep] = useState<Step>('offers'); // checkout is one page: handover, payment and the summary together
  const [sort, setSort] = useState<Sort>('best');
  const [pay, setPay] = useState<PayMethod>('cash');
  const card = false; // card payment stays hidden until it is switched on (A19)
  const [busy, setBusy] = useState(false);
  const [addr, setAddr] = useState<AddressChoice | null>(null);
  const [askCancel, setAskCancel] = useState(false);
  const [guarantee, setGuarantee] = useState(false);
  const [editing, setEditing] = useState<Request | null>(null);
  const now = useNow(60000);
  const [rules, setRules] = useState<DepositRules | null>(null);
  useEffect(() => { depositRules().then(setRules); }, []);

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
      supabase.from('shops').select(SHOP_COLS),
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
  if (!r) return <Screen><BackBar title={t('الطلب')} onBack={back} /><Empty text={t('الطلب ده مش موجود.')} /></Screen>;
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
  // the customer's sort; «الأنسب» keeps the default order (cheapest total, one marked featured offer on top). Ended offers stay last.
  const sorted = (qs: Quote[], p: Request) => {
    if (sort === 'best') return qs;
    const live = qs.filter((q) => !expiredQ(q)), ended = qs.filter(expiredQ);
    const key = (q: Quote) => sort === 'cheap' ? totalOf(q, p) : sort === 'warranty' ? -(q.warranty_days || 0) : (d.cards[q.shop_id]?.reply_min ?? 9999);
    return [...[...live].sort((a, b) => key(a) - key(b)), ...ended];
  };
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
  const canInstall = (sid: string) => groupOf(sid).some((c) => c.quote.install_available);
  const installing = (sid: string) => canInstall(sid) && !!inst[sid];
  const modeOf = (sid: string): Mode => (!canDeliver(sid) || installing(sid) ? 'pickup' : modes[sid] ?? 'delivery');
  const installFeeOf = (sid: string) => installing(sid) ? groupOf(sid).filter((c) => c.quote.install_available).reduce((s, c) => s + Number(c.quote.install_fee ?? 0), 0) : 0;
  const installInspect = (sid: string) => installing(sid) && groupOf(sid).some((c) => c.quote.install_available && c.quote.install_fee == null);
  const partsTotal = chosen.reduce((s, c) => s + c.quote.price * (c.part.qty || 1), 0);
  const deliveryTotal = byShop.filter((g) => modeOf(g[0].quote.shop_id) === 'delivery').reduce((s, g) => s + feeOf(g[0].quote.shop_id), 0);
  // pickup deposit (change 1.33): each pickup shop is reserved with a small deposit, the rest is paid at the counter
  const depOn = !!rules?.on;
  const shopTotal = (sid: string) => groupOf(sid).reduce((s, c) => s + c.quote.price * (c.part.qty || 1), 0);
  // shops that subscribe to be visible take no deposit (change 1.35)
  const depositOf = (sid: string) => (depOn && rules && modeOf(sid) === 'pickup' && !d.cards[sid]?.visible ? depositFor(shopTotal(sid), rules) : 0);
  const depositTotal = byShop.reduce((s, g) => s + depositOf(g[0].quote.shop_id), 0);
  const bundle = open.length > 1
    ? [...new Set(d.quotes.map((q) => q.shop_id))]
        .filter((sid) => open.every((p) => quotesOf(p).some((q) => q.shop_id === sid && !expiredQ(q))))
        .map((sid) => ({ sid, qs: open.map((p) => quotesOf(p).find((q) => q.shop_id === sid && !expiredQ(q))!), total: open.reduce((s, p) => s + quotesOf(p).find((q) => q.shop_id === sid && !expiredQ(q))!.price * (p.qty || 1), 0) }))
        .sort((a, b) => a.total - b.total)[0]
    : undefined;

  function pick(p: Request, q: Quote) {
    if (expiredQ(q)) return toast(t('العرض ده انتهى.'));
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
  const method: PayMethod = depOn && allPickup ? 'shop'
    : allowed.includes(pay) ? pay : pay === 'cash' && allowed.includes('shop') ? 'shop' : pay === 'shop' && allowed.includes('cash') ? 'cash' : allowed[0];

  async function accept() {
    setBusy(true);
    const { data: made, error } = await supabase.rpc('place_order', {
      p_choices: chosen.map((c) => {
        const sid = c.quote.shop_id, withI = installing(sid) && !!c.quote.install_available;
        return { request: c.part.id, quote: c.quote.id, mode: modeOf(sid), install: withI, install_at: withI ? instAt[sid] : null };
      }), p_payment: method,
      p_address: !allPickup && addr ? addr.address : null,
    });
    if (error) {
      setBusy(false);
      const m = friendlyError(error);
      if (/offer expired|cannot choose/i.test(String(error.message))) { setStep('offers'); setSel({}); }
      return toast(m === t('حصلت مشكلة. جرّب تاني.') ? t('الأوردر مااتأكدش. اتأكد من النت وجرّب تاني.') : m);
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
    toast(depositTotal > 0 ? t('فاضل تدفع العربون عشان المحل يحجز القطعة باسمك.') : method === 'instapay' ? t('الأوردر اتسجّل. فاضل تحوّل وترفع صورة الإيصال.') : method === 'card' ? t('اتعمل {0} أوردرات، ادفع كل واحد من صفحته', ar(ids.length)) : ids.length > 1 ? t('اتعمل {0} أوردرات.', ar(ids.length)) : t('الأوردر اتأكد. المحل بدأ يجهّزه.'));
    if (ids.length === 1) router.push({ pathname: '/order/[id]', params: { id: ids[0], done: '1' } });
    else router.push('/customer/requests');
  }
  async function cancelOpen() {
    setBusy(true);
    for (const p of open) await supabase.rpc('cancel_request', { p_request: p.id });
    setBusy(false); setAskCancel(false); toast(t('الطلب اتلغى.'));
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
    const extras = [WANTED[p.wanted_condition], p.side ? SIDES[p.side] : '', p.qty > 1 ? t('العدد {0}', ar(p.qty)) : '', p.notes ? `«${p.notes}»` : ''].filter(Boolean);
    const liveQs = qs.filter((q) => !expiredQ(q));
    const low = Math.min(...liveQs.map((y) => totalOf(y, p)));
    const feat = featuredOf(p);
    const editLink = p.status === 'open' ? <Btn kind="link" title={t('عدّل الطلب')} onPress={() => setEditing(p)} style={{ alignSelf: 'flex-start' }} /> : null;
    const longWait = Date.now() - new Date(p.created_at).getTime() > 2 * 3600000;
    return (
      <View style={{ gap: 12 }}>
        <Row gap={12}>
          <Photo uri={photoUrl(p.photo_path)} size={52} />
          <View style={{ flex: 1 }}>
            <T w="bold" size={18}>{t(p.part)}</T>
            <Muted size={12.5}>{extras.join(' · ')}</Muted>
          </View>
          {liveQs.length && !order ? <Pill label={liveQs.length > 1 ? t('{0} عروض', ar(liveQs.length)) : t('عرض')} tone="new" /> : null}
        </Row>

        {order ? (
          <Press onPress={() => router.push({ pathname: '/order/[id]', params: { id: order.id } })}
            style={[{ backgroundColor: colors.goodSoft, borderRadius: 20, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }]}>
            <Icon name={ORDER_LABEL[order.status].icon} size={26} color={colors.good} />
            <View style={{ flex: 1 }}>
              <T w="bold" size={15}>{t('القطعة دي في أوردر')}{' '}{orderNo(order.order_no)} · {ORDER_LABEL[order.status].short}</T>
              <Muted size={12.5}>{t('اضغط لمتابعة الأوردر.')}</Muted>
            </View>
            <Icon name="chevron-back" size={18} color={colors.good} />
          </Press>
        ) : p.status === 'cancelled' ? (
          <Empty icon="close-circle-outline" text={t('القطعة دي اتلغت من الطلب.')} />
        ) : p.status === 'expired' ? (
          <Empty icon="time-outline" text={t('الطلب ده انتهى من غير أوردر.')} action={{ label: t('اطلب تاني'), onPress: () => router.push({ pathname: '/customer/new', params: { part: p.part, cond: p.wanted_condition, notes: p.notes, side: p.side } }) }} />
        ) : qs.length ? (
          <>
            {liveQs.length > 1 ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {SORTS.map((o) => {
                  const on = sort === o.v;
                  return (
                    <Press key={o.v} onPress={() => setSort(o.v)} selected={on} label={t('رتّب: ') + o.label}
                      style={{ height: 36, paddingHorizontal: 14, borderRadius: 18, justifyContent: 'center', backgroundColor: on ? colors.ink : colors.surface, borderWidth: 1, borderColor: on ? colors.ink : '#D5DAE1' }}>
                      <T size={14} w={on ? 'semibold' : 'regular'} color={on ? '#fff' : colors.ink}>{o.label}</T>
                    </Press>
                  );
                })}
              </View>
            ) : null}
            <Pressable onPress={() => setGuarantee(true)} accessibilityRole="button" hitSlop={4}>
              <Row gap={6}>
                <Icon name="shield-checkmark" size={16} color={colors.good} />
                <T size={13} color={colors.good} style={{ flexShrink: 1 }}>{t('كل العروض محمية بضمان ضغطة لما تأكّد من التطبيق')}</T>
                <T size={13} w="semibold" color={colors.primary}>{t('إيه ده؟')}</T>
              </Row>
            </Pressable>
            <View style={{ gap: 10 }}>
              {sorted(qs, p).map((q) => (
                <OfferRow key={q.id} q={q} shop={d.shops[q.shop_id]} card={d.cards[q.shop_id]} fee={d.fees[q.id]} on={sel[p.id] === q.id}
                  cheapest={liveQs.length > 1 && !expiredQ(q) && liveQs.findIndex((x) => totalOf(x, p) === low) === liveQs.indexOf(q)} featured={q.id === feat}
                  expired={expiredQ(q)} now={now} qty={p.qty || 1}
                  onPick={() => pick(p, q)} onChat={() => router.push(`/chat/${p.id}/${q.shop_id}`)} />
              ))}
            </View>
            {dec?.n ? <Muted size={12.5}>{dec.n > 1 ? t('{0} محلات قالوا إنها مش عندهم.', ar(dec.n)) : t('محل قال إنها مش عنده.')}</Muted> : null}
          </>
        ) : dec?.n && dec.n >= d.shopCount ? (
          <View style={{ backgroundColor: colors.badSoft, borderRadius: 20, padding: 16, gap: 6 }}>
            <Row gap={8}><Icon name="alert-circle" size={22} color={colors.bad} /><T w="bold" size={15} color={colors.bad}>{t('مش متوفرة دلوقتي')}</T></Row>
            <Muted size={13}>{t('كل المحلات اللي شافت الطلب قالت إنها مش عندها. جرّب تختار «جديد أو مستعمل» أو تضيف صورة.')}</Muted>
            {editLink}
          </View>
        ) : (
          <>
            <Searching since={p.created_at} make={p.car_make} />
            {longWait ? (
              <View style={{ backgroundColor: colors.warnSoft, borderRadius: 16, padding: 14, gap: 4 }}>
                <Row gap={8} style={{ alignItems: 'flex-start' }}><Icon name="bulb" size={18} color={colors.warn} />
                  <T size={13.5} style={{ flex: 1 }}>{t('لسه مفيش عروض. صورة القطعة أو اختيار «جديد أو مستعمل» بتجيب عروض أكتر.')}</T></Row>
                {editLink}
              </View>
            ) : null}
            {dec?.n ? (
              <Row gap={8} style={{ backgroundColor: colors.surface, borderRadius: 16, padding: 12 }}>
                <Icon name="information-circle" size={18} color={colors.muted} />
                <Muted size={13} style={{ flex: 1 }}>{t('محل قال إنها مش عنده')}{dec.reasons.length ? ` («${dec.reasons[0]}»)` : ''}{t('. لسه مستنيين باقي المحلات.')}</Muted>
              </Row>
            ) : null}
          </>
        )}
      </View>
    );
  };

  /* ---------------------------------------------------------------- checkout: one page */
  if (step === 'checkout' && chosen.length) {
    const grand = partsTotal + deliveryTotal;
    const shopName = (sid: string) => d.cards[sid]?.name ?? t('المحل');
    const installTotal = byShop.reduce((s, g) => s + installFeeOf(g[0].quote.shop_id), 0);
    const confirm = () => {
      if (byShop.some((g) => installing(g[0].quote.shop_id) && !instAt[g[0].quote.shop_id])) return toast(t('اختار معاد التركيب.'));
      if (!allPickup) { const bad = addressProblem(addr); if (bad) return toast(bad); }
      accept();
    };
    const footer = (
      <Btn title={depOn && allPickup ? t('احجز بعربون {0} ج.م', money(depositTotal)) : t('{0} · {1} ج.م', method === 'card' ? 'كمّل للدفع' : 'أكّد الأوردر', money(grand))} loading={busy} onPress={confirm} />
    );
    return (
      <Screen footer={footer}>
        <BackBar title={t('راجع وأكّد')} onBack={() => setStep('offers')} />

        <View style={{ gap: 10 }}>
          <T w="bold" size={16}>{t('هتستلم إزاي؟')}</T>
          {byShop.map((g) => {
            const sid = g[0].quote.shop_id;
            const shop = d.shops[sid];
            const opts: { v: Mode; label: string }[] = canDeliver(sid)
              ? [{ v: 'delivery', label: t('توصيل · {0} ج.م', money(feeOf(sid))) }, { v: 'pickup', label: t('أستلم من المحل') }]
              : [{ v: 'pickup', label: t('أستلم من المحل') }];
            return (
              <View key={sid} style={{ gap: 8 }}>
                {byShop.length > 1 ? <ShopLine name={shopName(sid)} card={d.cards[sid]} sub={[`${ar(g.length)} ${g.length > 1 ? t('قطع') : t('قطعة')}`, shop?.area].filter(Boolean).join(' · ')} /> : null}
                {canInstall(sid) ? (
                  <View style={{ gap: 8 }}>
                    <Seg options={[{ v: 'no', label: t('القطعة بس') }, { v: 'yes', label: t('مع التركيب في المحل') }]} value={installing(sid) ? 'yes' : 'no'}
                      onPick={(v) => setInst((m) => ({ ...m, [sid]: v === 'yes' }))} />
                    {installing(sid) ? (
                      <View style={{ gap: 8, backgroundColor: colors.primarySoft, borderRadius: 14, padding: 12 }}>
                        <T w="semibold" size={14}>{t('معاد التركيب')}</T>
                        <AppointmentPicker hours={shop?.hours} value={instAt[sid] ?? ''} onPick={(v) => setInstAt((m) => ({ ...m, [sid]: v }))} />
                        <Muted size={12.5}>{installInspect(sid) ? t('سعر التركيب هيتحدد في المحل بعد المعاينة، وبيتدفع هناك.') : t('سعر التركيب {0} ج.م، وبيتدفع في المحل.', money(installFeeOf(sid)))}</Muted>
                      </View>
                    ) : null}
                  </View>
                ) : null}
                {!installing(sid) ? <Seg options={opts} value={modeOf(sid)} onPick={(v) => setModes((m) => ({ ...m, [sid]: v }))} /> : null}
                {!canDeliver(sid) ? <Muted size={12.5}>{!shop?.offers_delivery ? t('المحل ده مش بيوصّل') : g.length > 1 && g.some((c) => d.fees[c.quote.id] != null) ? t('قطعة من دول استلام من المحل بس') : t('المحل مش بيوصّل لمنطقتك')}</Muted>
                  : modeOf(sid) === 'pickup' ? <Muted size={12.5}>{depositOf(sid) ? t('اسم المحل ورقمه وعنوانه هيظهروا بعد دفع العربون.') : t('عنوان المحل ومواعيده هيظهروا بعد التأكيد.')}</Muted> : null}
              </View>
            );
          })}
          {!allPickup && profile ? <AddressPicker profile={profile} value={addr} onChange={setAddr} /> : null}
        </View>

        {depositTotal > 0 ? (
          <View style={{ gap: 10 }}>
            <T w="bold" size={16}>{t('عربون الحجز')}</T>
            <View style={{ backgroundColor: colors.primarySoft, borderRadius: 16, padding: 16, gap: 8 }}>
              <Row gap={10} style={{ alignItems: 'flex-start' }}>
                <Icon name="bookmark" size={20} color={colors.primary} />
                <T size={14} style={{ flex: 1 }}>{t('هتدفع لضغطة عربون')}{' '}<T w="bold" size={14}>{money(depositTotal)} {t('ج.م')}</T>{' '}{t('عشان المحل يحجز القطعة باسمك. الباقي تدفعه كاش في المحل وانت بتستلم.')}</T>
              </Row>
              <Muted size={12.5}>{t('القطعة بتفضل محجوزة {0} ساعة من ما تجهز. لو ماجيتش، أو لغيت بعد الدفع، العربون مش بيرجع. لو المحل لغى أو القطعة طلعت مش زي العرض، بيرجعلك.', ar(rules?.holdHours ?? 48))}</Muted>
            </View>
          </View>
        ) : null}

        {!(depOn && allPickup) ? (
          <View style={{ gap: 10 }}>
            <T w="bold" size={16}>{depositTotal > 0 ? t('هتدفع التوصيل إزاي؟') : t('هتدفع إزاي؟')}</T>
            <PaymentPicker value={method} onPick={setPay} card={card} instapay={transferOk} handover={depositTotal > 0 ? 'delivery' : handover} />
          </View>
        ) : null}

        <View style={{ gap: 10 }}>
          <T w="bold" size={16}>{t('الأوردر')}</T>
          <View style={{ backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.line, overflow: 'hidden' }}>
            {byShop.map((g, gi) => {
              const sid = g[0].quote.shop_id;
              return (
                <View key={sid} style={{ padding: 16, gap: 10, borderTopWidth: gi ? 1 : 0, borderColor: '#EEF0F3' }}>
                  {g.map((c) => (
                    <Row key={c.part.id} gap={10} style={{ alignItems: 'flex-start' }}>
                      <View style={{ flex: 1 }}>
                        <T w="semibold" size={15}>{t(c.part.part)}{c.quote.brand ? ` (${c.quote.brand})` : ''}{c.part.qty > 1 ? ` × ${ar(c.part.qty)}` : ''}</T>
                        <Muted size={13}>{shopName(sid)} · {CONDITIONS[c.quote.condition]} · {warrantyLabel(c.quote.warranty_days)}</Muted>
                      </View>
                      <T w="semibold" size={15}>{money(c.quote.price * (c.part.qty || 1))} {t('ج.م')}</T>
                    </Row>
                  ))}
                </View>
              );
            })}
            <View style={{ padding: 16, gap: 8, borderTopWidth: 1, borderColor: '#EEF0F3' }}>
              <Lines rows={[[t('القطع'), money(partsTotal) + t(' ج.م')], [t('التوصيل'), deliveryTotal ? money(deliveryTotal) + t(' ج.م') : t('مجاناً')]]} total={[t('الإجمالي'), money(grand) + t(' ج.م')]} />
              {depositTotal > 0 ? (
                <Lines rows={[[t('العربون دلوقتي (لضغطة)'), money(depositTotal) + t(' ج.م')]]} total={[t('الباقي وانت بتستلم'), money(grand - depositTotal) + t(' ج.م')]} />
                ) : null}
              {byShop.some((g) => installing(g[0].quote.shop_id)) ? (
                <Lines rows={[[t('التركيب (بيتدفع في المحل)'), installTotal ? money(installTotal) + t(' ج.م') + (byShop.some((g) => installInspect(g[0].quote.shop_id)) ? t(' + بعد المعاينة') : '') : t('بعد المعاينة')]]} />
              ) : null}
            </View>
          </View>
          {byShop.length > 1 ? <Muted size={12.5}>{t('هيتعمل')}{' '}{ar(byShop.length)} {t('أوردرات، واحد لكل محل.')}</Muted> : null}
          {open.length > chosen.length ? <Muted size={12.5}>{t('باقي القطع (')}{ar(open.length - chosen.length)}{t(') هتفضل في الطلب مستنية عروض.')}</Muted> : null}
        </View>

        <Row gap={10} style={{ alignItems: 'flex-start', backgroundColor: colors.goodSoft, borderRadius: 14, padding: 14 }}>
          <Icon name="shield-checkmark" size={20} color={colors.good} />
          <T size={13.5} color="#0B4D37" style={{ flex: 1 }}>{t('افحص القطعة قبل ما تدّي الكود أو تدفع. لو مش زي العرض، ارفضها. بعد الاستلام، الاسترجاع بيكون مع المحل حسب القانون.')}</T>
        </Row>
        <LegalLinks lead={t('بتأكيد الأوردر بتوافق على')} withCancellation />
      </Screen>
    );
  }

  /* ---------------------------------------------------------------- page */
  const footer = chosen.length ? (
    <Row gap={12}>
      <View style={{ flex: 1 }}>
        <Muted size={13}>{t('اخترت')}{' '}{ar(chosen.length)} {t('من')}{' '}{ar(open.length)}</Muted>
        <T w="bold" size={19}>{money(partsTotal)} {t('ج.م')}</T>
      </View>
      <Btn title={t('كمّل الأوردر')} onPress={() => setStep('checkout')} style={{ minWidth: 160 }} />
    </Row>
  ) : undefined;
  const withOffers = d.parts.filter((p) => quotesOf(p).some((q) => !expiredQ(q)) && p.status === 'open').length;
  const liveCount = d.quotes.filter((q) => !expiredQ(q) && open.some((p) => p.id === q.request_id)).length;

  return (
    <Screen footer={footer}>
      <BackBar title={t('عروض طلب ') + reqNo(first.num)} onBack={back} />
      <Muted size={13} center style={{ marginTop: -14 }}>{carLabel(first.car_make, first.car_model, first.car_year)} · <SinceText iso={first.created_at} /></Muted>

      {bundle && !chosen.length ? (
        <Press onPress={() => setSel(Object.fromEntries(open.map((p, i) => [p.id, bundle.qs[i].id])))}
          style={{ backgroundColor: colors.surface, borderRadius: 16, padding: 16, gap: 6, borderWidth: 1, borderColor: colors.line }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Row gap={8}><Icon name="bag-check" size={20} color={colors.primary} /><T w="bold" size={15}>{t('كل القطع من محل واحد')}</T></Row>
            <T w="bold" size={17}>{money(bundle.total)} {t('ج.م')}</T>
          </Row>
          <Muted size={12.5}>{d.cards[bundle.sid]?.name ?? t('محل موثّق')} {t('عنده كل القطع. أوردر واحد وتوصيل واحد.')}</Muted>
        </Press>
      ) : null}

      {!d.quotes.length ? <PushPrompt kind="ask" /> : null}

      {d.parts.length > 1 ? (
        <TabPills items={d.parts.map((p) => ({ v: p.id, label: p.part, mark: partMark(p) }))} value={current.id} onPick={setTab} />
      ) : null}
      {panel(current)}

      {open.length ? (
        <View style={{ gap: 6, alignItems: 'center' }}>
          <Muted center size={12}>{t('رقمك وعنوانك بيظهروا للمحل بس بعد تأكيد الأوردر. ضمان ضغطة بيغطي الأوردرات اللي بتتأكد من التطبيق بس.')}</Muted>
          <Btn kind="link" title={open.length > 1 ? t('إلغاء القطع المفتوحة') : t('إلغاء الطلب')} onPress={() => setAskCancel(true)} style={{ alignSelf: 'center' }} />
        </View>
      ) : null}

      <ConfirmSheet open={askCancel} title={t('تلغي الطلب؟')} body={t('المحلات مش هتقدر تبعت عروض تاني.')} yes={t('أيوه، الغي')} danger busy={busy} onYes={cancelOpen} onClose={() => setAskCancel(false)} />
      <GuaranteeSheet open={guarantee} onClose={() => setGuarantee(false)} />
      {editing ? <EditRequest part={editing} onClose={() => setEditing(null)} /> : null}

    </Screen>
  );
}

/** Shop name with rating and how fast it usually answers. */
function ShopLine({ name, card, sub }: { name: string; card?: ShopCard; sub?: string }) {
  return (
    <Row gap={10}>
      <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}><Icon name="storefront" size={18} color={colors.primary} /></View>
      <View style={{ flex: 1 }}>
        <Row gap={6}><T w="bold" size={14.5} numberOfLines={1}>{name}</T>{card?.rating ? <T size={12.5} w="semibold" color={colors.warn}>★ {ar(card.rating.toFixed(1)).replace('.', t('٫'))}</T> : null}</Row>
        {sub ? <Muted size={12}>{sub}</Muted> : null}
      </View>
    </Row>
  );
}

/** One offer as its own card: shop and rating, the price large on the far side, then condition, warranty and delivery as tags. */
function OfferRow({ q, card, fee, on, cheapest, featured, expired, now, qty, onPick, onChat }: {
  q: Quote; shop?: Shop; card?: ShopCard; fee?: number | null; on: boolean; cheapest: boolean; featured: boolean; expired: boolean; now: number; qty: number;
  onPick: () => void; onChat: () => void;
}) {
  const tags = [[q.brand, CONDITIONS[q.condition]].filter(Boolean).join(' · '), warrantyLabel(q.warranty_days), fee != null ? t('توصيل {0} ج.م', money(fee)) : t('استلام من المحل بس'),
    q.install_available ? (q.install_fee != null ? t('+ تركيب {0} ج.م', money(q.install_fee)) : t('تركيب متاح · السعر بعد المعاينة')) : ''];
  const left = new Date(q.expires_at).getTime() - now;
  const soon = !expired && left < 6 * 3600000;
  const leftText = left >= 3600000 ? t('{0} ساعة', ar(Math.floor(left / 3600000))) : t('{0} دقيقة', ar(Math.max(1, Math.ceil(left / 60000))));
  const rating = card?.rating ? `★ ${ar(card.rating.toFixed(1)).replace('.', t('٫'))}` : '';
  return (
    <Press onPress={onPick} selected={on} label={t('عرض {0} جنيه', money(q.price))}
      style={{ gap: 12, padding: 16, borderRadius: 16, backgroundColor: colors.surface, borderWidth: on ? 2 : 1, borderColor: on ? colors.primary : colors.line, opacity: expired ? 0.55 : 1 }}>
      <Row gap={12} style={{ alignItems: 'flex-start' }}>
        <View style={{ width: 24, height: 24, marginTop: 2, borderRadius: 12, borderWidth: on ? 7 : 2, borderColor: on ? colors.primary : '#C9D0DA' }} />
        {card?.photo_path ? <Image source={{ uri: photoUrl(card.photo_path)! }} style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: colors.soft }} accessibilityLabel={t('صورة المحل')} /> : null}
        <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
          <Pressable onPress={() => router.push(`/shop-profile/${q.shop_id}`)} hitSlop={4} accessibilityRole="link">
            <T w="semibold" size={16} numberOfLines={1}>{card?.name ?? t('محل موثّق')}</T>
          </Pressable>
          <Muted size={13} numberOfLines={1}>{[rating, replyLabel(card?.reply_min)].filter(Boolean).join(' · ')}</Muted>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 4 }}>
          <Row gap={4} style={{ alignItems: 'baseline' }}>
            <T w="bold" size={22} style={{ lineHeight: 30 }}>{money(q.price)}</T>
            <T size={13} color={colors.muted}>{t('ج.م')}{qty > 1 ? t(' للقطعة') : ''}</T>
          </Row>
          {expired ? <Pill label={t('العرض انتهى')} tone="plain" /> : featured ? <Pill label={t('مميّز · إعلان')} tone="plain" /> : cheapest ? <Pill label={t('الأرخص')} tone="good" /> : null}
        </View>
      </Row>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingStart: 36 }}>
        {tags.filter(Boolean).map((t) => (
          <View key={t} style={{ backgroundColor: colors.soft, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 3 }}>
            <T size={12.5} style={{ lineHeight: 19 }}>{t}</T>
          </View>
        ))}
      </View>
      {q.note || q.photo_path || !expired ? (
        <Row gap={10} style={{ paddingStart: 36 }}>
          {q.photo_path ? <Photo uri={photoUrl(q.photo_path)} size={44} /> : null}
          <View style={{ flex: 1, gap: 2 }}>
            {q.note ? <Muted size={13}>«{q.note}»</Muted> : null}
            {soon ? <T size={12.5} color={colors.warn}>{t('العرض بينتهي بعد')}{' '}{leftText}</T> : null}
          </View>
          {!expired ? (
            <Pressable onPress={onChat} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('اسأل المحل')}>
              <Row gap={4}><Icon name="chatbubble-ellipses" size={15} color={colors.primary} /><T size={13.5} w="medium" color={colors.primary}>{t('اسأل المحل')}</T></Row>
            </Pressable>
          ) : null}
        </Row>
      ) : null}
    </Press>
  );
}

/** How long ago the request went out, ticking: the app is about speed. */
function SinceText({ iso }: { iso: string }) {
  const now = useNow(1000);
  return <>{t('من')}{' '}{elapsed(iso, now)}</>;
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
        <View style={{ width: 54, height: 54, borderRadius: 27, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}><Icon name="storefront" size={24} color="#fff" /></View>
      </View>
      <T w="bold" size={16}>{t('طلبك وصل لمحلات')}{' '}{make}</T>
      <Row gap={4}><Icon name="time" size={14} color={colors.muted} /><Muted size={13}>{t('بقاله')}{' '}{elapsed(since, now)}</Muted></Row>
      <Muted center size={13}>{t('أول ما محل يبعت عرض هيظهر هنا وهيوصلك إشعار.')}</Muted>
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
      toast(t('الطلب اتعدّل.')); onClose();
    } catch (e) { toast(friendlyError(e)); }
    setBusy(false);
  }
  return (
    <Sheet open onClose={onClose} title={t('عدّل الطلب')}>
      <View style={{ gap: 14 }}>
        <T w="bold" size={16}>{t(part.part)}</T>
        <Seg options={[{ v: 'any', label: t('جديد أو مستعمل') }, { v: 'used', label: t('مستعمل بس') }, { v: 'new', label: t('جديد بس') }]} value={cond} onPick={(v) => setCond(v as Request['wanted_condition'])} />
        {partIsSided(part.part) ? <Chips options={[{ v: 'right', label: t('يمين') }, { v: 'left', label: t('شمال') }, { v: 'both', label: t('الاتنين') }]} selected={[side]} onPick={(v) => setSide(side === v ? '' : v)} /> : null}
        <Press onPress={async () => { try { const u = await pickPhoto(); if (u) setPhoto(u); } catch { toast(t('الصورة دي مش مدعومة. اختار صورة JPG أو PNG.')); } }}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: 16, borderWidth: 1.5, borderStyle: 'dashed', borderColor: photo || part.photo_path ? colors.good : colors.line }}>
          {photo ? <Image source={{ uri: photo }} style={{ width: 44, height: 44, borderRadius: 10 }} /> : part.photo_path ? <Photo uri={photoUrl(part.photo_path)} size={44} /> : (
            <View style={{ width: 44, height: 44, borderRadius: 10, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' }}><Icon name="camera" size={20} color={colors.accentDeep} /></View>
          )}
          <T size={13.5} w="medium" style={{ flex: 1 }}>{photo || part.photo_path ? t('الصورة اتضافت · تغيير') : t('صوّر القطعة القديمة (اختياري)')}</T>
        </Press>
        <Field value={notes} onChangeText={setNotes} placeholder={t('ملاحظة للمحل (اختياري)')} />
        <Btn title={t('احفظ')} loading={busy} onPress={save} />
      </View>
    </Sheet>
  );
}

import { PushPrompt } from '@/components/PushPrompt';
import { Redirect, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { BottomNav, rememberRole } from '@/components/AppHeader';
import { Bell } from '@/components/Bell';
import { shopPill, shopState, type ShopState } from '@/components/status';
import { OrderRow, RowList, StatusTabs, bucketOf, type Bucket } from '@/components/OrderRows';
import { Btn, Empty, Icon, Labeled, Loading, Muted, Notice, Pill, Press, Row, Screen, Seg, Select, T, Toggle } from '@/components/ui';
import { Pressable, TextInput } from 'react-native';
import { InstallCard } from '@/components/InstallCard';
import { ptShort } from '@/lib/catalogue';
import { useAuth } from '@/lib/auth';
import { WANTED, ar, elapsed, minutesSince, money, orderActive, partsLabel, reqNo, type Order, type Quote, type Request } from '@/lib/data';
import { must, useLive, useNow } from '@/lib/live';
import { supabase } from '@/lib/supabase';
import { colors, fonts, lift } from '@/lib/theme';
import { whenLabel } from '@/components/Appointment';
import { BOOKING_STATUS, type Booking } from '@/components/BookingView';
import type { InstallRequest } from '@/lib/install';
import { serviceName, useInstallServices } from '@/lib/shops';

type Tab = 'open' | 'quoted' | 'preparing' | 'ready' | 'done' | 'install';
const SLOW_MIN = 15; // after this, an unanswered request turns red

export default function ShopInbox() {
  const { ready, session, profile, shop, shopPrivate, refresh } = useAuth();
  const [switching, setSwitching] = useState(false);
  const [tab, setTab] = useState<Tab>('open');
  const [q, setQ] = useState('');
  const [cond, setCond] = useState<'all' | 'used' | 'new'>('all');
  const [area, setArea] = useState('الكل');
  const [showFilters, setShowFilters] = useState(false);
  const uid = session?.user.id;
  const now = useNow(60000);
  useEffect(() => { rememberRole('shop'); }, []);

  const { data, loading } = useLive(async () => {
    if (!uid) return { reqs: [] as Request[], mine: [] as Quote[], declined: new Set<string>(), orders: [] as Order[], ireqs: [] as InstallRequest[], iquoted: new Set<string>(), bookings: [] as Booking[] };
    const [ir, iq, bk] = await Promise.all([
      supabase.from('install_requests').select('*').order('created_at', { ascending: false }).limit(100),
      supabase.from('install_quotes').select('request_id').eq('shop_id', uid),
      supabase.from('bookings').select('*').eq('shop_id', uid).order('appointment_at', { ascending: true }).limit(100),
    ]);
    const ireqs = ((ir.data ?? []) as InstallRequest[]).filter((x) => x.customer_id !== uid);
    const iquoted = new Set(((iq.data ?? []) as { request_id: string }[]).map((x) => x.request_id));
    const bookings = (bk.data ?? []) as Booking[];
    const reqs = must(await supabase.from('requests').select('*').order('created_at', { ascending: false }).limit(200)) as Request[];
    const mine = must(await supabase.from('quotes').select('*').eq('shop_id', uid)) as Quote[];
    const dec = must(await supabase.from('declines').select('request_id').eq('shop_id', uid)) as { request_id: string }[];
    const orders = must(await supabase.from('orders').select('*').eq('shop_id', uid).order('created_at', { ascending: false }).limit(100)) as Order[];
    return { reqs, mine, declined: new Set(dec.map((d) => d.request_id)), orders, ireqs, iquoted, bookings };
  }, ['requests', 'quotes', 'orders', 'install_requests', 'install_quotes', 'bookings'], [uid, shop?.status], { pollMs: 20000 });

  if (ready && !session) return <Redirect href="/login" />;
  if (profile && (!shop || shop.status === 'draft' || shop.status === 'changes')) return <Redirect href="/shop-setup" />;
  if (!profile || !shop) return <Screen><Loading /></Screen>;

  const rows = (data?.reqs ?? [])
    .filter((r) => r.customer_id !== uid || profile.is_admin)
    .map((r) => {
      const mqs = data!.mine.filter((q) => q.request_id === r.id);
      const mq = mqs.find((q) => q.id === r.chosen_quote_id) ?? mqs[0];
      return { r, mq, st: shopState(r, mq, data!.declined.has(r.id)) as ShopState };
    });
  const areas = ['الكل', ...Array.from(new Set(rows.map((x) => x.r.area))).sort()];
  const needle = q.trim();
  const shown = rows
    .filter((x) => cond === 'all' || x.r.wanted_condition === cond || x.r.wanted_condition === 'any')
    .filter((x) => area === 'الكل' || x.r.area === area)
    .filter((x) => !needle || `${x.r.part} ${x.r.car_make} ${x.r.car_model} ${x.r.notes}`.includes(needle))
    .sort((a, b) => Number(!shop.brands.includes(a.r.car_make)) - Number(!shop.brands.includes(b.r.car_make)) || b.r.created_at.localeCompare(a.r.created_at));
  const activeFilters = Number(cond !== 'all') + Number(area !== 'الكل');
  const orders = data?.orders ?? [];
  const activeOrders = orders.filter(orderActive);
  const monthStart = new Date(new Date(now).getFullYear(), new Date(now).getMonth(), 1).getTime();
  const sales = orders.filter((o) => o.status === 'received' && new Date(o.received_at ?? o.updated_at).getTime() >= monthStart).reduce((s, o) => s + Number(o.items_total), 0);
  const left = (fromIso: string | null | undefined, hours: number) => {
    const ms = Math.max(0, new Date(fromIso ?? 0).getTime() + hours * 3600000 - now);
    return ms >= 3600000 ? `${ar(Math.floor(ms / 3600000))} ساعة` : `${ar(Math.max(1, Math.ceil(ms / 60000)))} دقيقة`;
  };
  const toConfirm = orders.filter((o) => o.payment_status === 'review');
  const toRefund = orders.filter((o) => o.payment_status === 'refund_due');
  const accepting = shop.accepting !== false;
  async function toggleOpen(v: boolean) {
    setSwitching(true);
    await supabase.from('shops').update({ accepting: v }).eq('id', shop!.id);
    await refresh(); setSwitching(false);
  }
  const waiting = rows.filter((x) => x.st === 'open').length;
  const inTab = (b: Bucket) => orders.filter((o) => bucketOf(o) === b);
  const sells = shop.sells !== false, installs = !!shop.installs;
  const curTab: Tab = !sells ? 'install' : tab;
  const liveBookings = (data?.bookings ?? []).filter((b) => ['pending', 'confirmed', 'in_progress', 'ready', 'disputed'].includes(b.status));
  const newInstalls = (data?.ireqs ?? []).filter((x) => x.status === 'open' && !data!.iquoted.has(x.id));
  const quotedInstalls = (data?.ireqs ?? []).filter((x) => x.status === 'open' && data!.iquoted.has(x.id));
  const installHot = newInstalls.length + liveBookings.filter((b) => b.status === 'pending').length;
  const isOrders = tab === 'preparing' || tab === 'ready' || tab === 'done';
  const groups = groupShown(shown).filter((g) => g.some((x) => x.st === tab));

  return (
    <Screen nav={<BottomNav role="shop" />} top={
      <View style={{ backgroundColor: colors.ink, borderBottomLeftRadius: 28, borderBottomRightRadius: 28, paddingBottom: 56 }}>
        <View style={{ width: '100%', maxWidth: 560, alignSelf: 'center', paddingHorizontal: 18, paddingTop: 14, gap: 14 }}>
          <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <View style={{ flex: 1 }}>
              <T size={13} color="rgba(255,255,255,.65)">{shop.area}، {shop.governorate} · {shop.offers_delivery ? 'بيوصّل' : 'استلام من المحل'}</T>
              <T w="bold" size={26} color="#fff" style={{ lineHeight: 36 }}>{shopPrivate?.name}</T>
            </View>
            <Bell light />
          </Row>
          {shop.status === 'approved' ? (
            <Row gap={10} style={{ backgroundColor: 'rgba(255,255,255,.08)', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8 }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: accepting ? colors.good : colors.faint }} />
              <T w="semibold" size={14} color="#fff" style={{ flex: 1 }}>{accepting ? 'مستقبل طلبات' : 'مقفول دلوقتي'}</T>
              <Toggle value={accepting} disabled={switching} onValueChange={toggleOpen} onColor={colors.good} offColor={'rgba(255,255,255,.25)'} accessibilityLabel={accepting ? 'مستقبل طلبات' : 'مقفول دلوقتي'} />
            </Row>
          ) : null}
          <Row gap={8}>
            {[[ar(waiting), 'طلبات مستنية ردّك', true], [ar(activeOrders.length), 'أوردرات تجهّزها', false], [money(sales), 'مبيعات الشهر (ج.م)', false]].map(([v, l, hot]) => (
              <View key={String(l)} style={{ flex: 1, backgroundColor: hot ? colors.accent : 'rgba(255,255,255,.08)', borderRadius: 18, padding: 12, gap: 2 }}>
                <T w="bold" size={22} color={hot ? colors.ink : '#fff'}>{String(v)}</T>
                <T size={12} color={hot ? colors.ink : 'rgba(255,255,255,.7)'}>{String(l)}</T>
              </View>
            ))}
          </Row>
        </View>
      </View>
    }>
      <View style={{ marginTop: -40, gap: 12 }}>
      {shop.status === 'pending' ? <Notice><T w="semibold" size={14}>محلك تحت المراجعة</T><T size={13}>أول ما نوافق، الطلبات هتظهر هنا.</T></Notice> : null}
      {shop.status === 'approved' && !accepting ? <Notice icon="moon">مش هتوصلك طلبات جديدة لحد ما تفتح. الأوردرات الشغالة لسه محتاجاك.</Notice> : null}
      {shop.status === 'approved' ? <PushPrompt kind="banner" shop /> : null}
      {shop.status === 'suspended' ? (
        <Press onPress={() => router.push('/shop/performance')} style={{ backgroundColor: colors.badSoft, borderRadius: 16, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Icon name="pause-circle" size={22} color={colors.bad} /><T w="bold" size={14.5} color={colors.bad} style={{ flex: 1 }}>المحل موقوف مؤقتاً</T>
          <T w="semibold" size={13.5} color={colors.bad}>اعرف السبب</T>
        </Press>
      ) : null}
      {toConfirm.map((o) => (
        <Press key={o.id} onPress={() => router.push({ pathname: '/shop/order/[id]', params: { id: o.id } })}
          style={{ backgroundColor: colors.warnSoft, borderRadius: 16, padding: 14, gap: 4 }}>
          <T w="bold" size={14.5}>عميل حوّللك {money(Number(o.items_total) + Number(o.delivery_fee))} ج.م</T>
          <Row style={{ justifyContent: 'space-between' }}><Muted size={13}>أكّد خلال {left(o.updated_at, 2)}</Muted><T w="semibold" size={13.5} color={colors.primary}>راجع الإيصال</T></Row>
        </Press>
      ))}
      {toRefund.map((o) => (
        <Press key={o.id} onPress={() => router.push({ pathname: '/shop/order/[id]', params: { id: o.id } })}
          style={{ backgroundColor: colors.badSoft, borderRadius: 16, padding: 14, gap: 4 }}>
          <T w="bold" size={14.5} color={colors.bad}>لازم ترجّع {money(Number(o.items_total) + Number(o.delivery_fee))} ج.م لعميل</T>
          <Row style={{ justifyContent: 'space-between' }}><Muted size={13}>فاضل {left(o.refund_due_at ?? o.updated_at, 48)}</Muted><T w="semibold" size={13.5} color={colors.primary}>سجّل الاسترجاع</T></Row>
        </Press>
      ))}
      <StatusTabs<Tab> value={curTab} onPick={setTab} items={([
        { v: 'open', label: 'جديد', n: waiting, hot: waiting > 0 },
        { v: 'quoted', label: 'عروضي', n: rows.filter((x) => x.st === 'quoted').length },
        { v: 'preparing', label: 'بيتجهّز', n: inTab('preparing').length, hot: inTab('preparing').length > 0 },
        { v: 'ready', label: 'جاهز', n: inTab('ready').length },
        { v: 'done', label: 'السابقة' },
        ...(installs ? [{ v: 'install' as Tab, label: 'التركيب', n: installHot, hot: installHot > 0 }] : []),
      ] as { v: Tab; label: string; n?: number; hot?: boolean }[]).filter((x) => sells || x.v === 'install')} />
      </View>
      {curTab === 'install' ? (
        <InstallInbox newOnes={newInstalls} quoted={quotedInstalls} bookings={liveBookings} past={(data?.bookings ?? []).filter((b) => b.status === 'done' || b.status === 'cancelled')} now={now} />
      ) : null}
      {curTab !== 'install' && !isOrders ? <Row gap={8}>
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.surface, borderRadius: 16, paddingHorizontal: 12, borderWidth: 1.5, borderColor: colors.line }}>
          <Icon name="search" size={18} color={colors.muted} />
          <TextInput value={q} onChangeText={setQ} placeholder="دوّر: فانوس، سنترا…" placeholderTextColor={colors.faint}
            style={[{ flex: 1, paddingVertical: 11, fontFamily: fonts.medium, fontSize: 15, color: colors.ink, textAlign: 'right' }, { outlineStyle: 'none' } as any]} />
        </View>
        <Pressable onPress={() => setShowFilters((v) => !v)} accessibilityRole="button" accessibilityLabel="الفلاتر"
          style={{ height: 48, paddingHorizontal: 14, borderRadius: 16, backgroundColor: showFilters || activeFilters ? colors.ink : colors.surface, borderWidth: 1.5, borderColor: showFilters || activeFilters ? colors.ink : colors.line, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Icon name="options-outline" size={18} color={showFilters || activeFilters ? '#fff' : colors.ink} />
          {activeFilters ? <T size={13} w="bold" color="#fff">{ar(activeFilters)}</T> : null}
        </Pressable>
      </Row> : null}
      {curTab === 'install' ? null : showFilters && !isOrders ? (
        <View style={[{ gap: 14, backgroundColor: colors.surface, borderRadius: 20, padding: 14 }, lift]}>
          <Labeled label="العميل عايزها">
            <Seg options={[{ v: 'all', label: 'الكل' }, { v: 'used', label: 'مستعمل' }, { v: 'new', label: 'جديد' }] as { v: 'all' | 'used' | 'new'; label: string }[]} value={cond} onPick={setCond} />
          </Labeled>
          <Select label="المنطقة" value={area} options={areas.map((a) => ({ v: a, label: a }))} onPick={setArea} />
          {activeFilters ? <Btn kind="link" title="امسح الفلاتر" onPress={() => { setCond('all'); setArea('الكل'); }} /> : null}
        </View>
      ) : null}
      {curTab === 'install' ? null : isOrders ? (
        inTab(tab).length ? (
          <RowList>
            {inTab(tab).map((o, i) => {
              const ps = (data?.reqs ?? []).filter((r) => r.order_id === o.id);
              return <OrderRow key={o.id} o={o} first={i === 0} title={ps.length ? partsLabel(ps) : 'أوردر'}
                flag={o.payment_status === 'review' ? { label: 'راجع الدفع', tone: 'wait' } : o.payment_status === 'refund_due' ? { label: 'رجّع الفلوس', tone: 'wait' } : undefined}
                onPress={() => router.push({ pathname: '/shop/order/[id]', params: { id: o.id } })} />;
            })}
          </RowList>
        ) : <Empty icon="cube-outline" text={tab === 'done' ? 'لسه مفيش أوردرات سابقة.' : tab === 'ready' ? 'مفيش أوردرات جاهزة مستنية تسليم.' : 'مفيش أوردرات بتتجهّز. لما عميل يختار عرضك، الأوردر بيظهر هنا.'} />
      ) : loading && !data ? <Loading /> : groups.length ? (
        <RowList>
          {groups.map((g, i) => {
            const r = g[0].r;
            const open = g.some((x) => x.st === 'open');
            const slow = open && minutesSince(r.created_at, now) >= SLOW_MIN;
            return (
              <Press key={r.batch_id ?? r.id} onPress={() => router.push(`/shop/${(g.find((x) => x.st === 'open') ?? g[0]).r.id}`)} label={r.part}
                style={{ flexDirection: 'row', gap: 12, paddingHorizontal: 14, paddingVertical: 13, borderTopWidth: i ? 1 : 0, borderColor: colors.line, backgroundColor: open ? colors.surface : colors.surface }}>
                {open ? <View style={{ width: 4, borderRadius: 2, backgroundColor: slow ? colors.bad : colors.accent }} /> : null}
                <View style={{ flex: 1, gap: 4 }}>
                  <Row gap={8}>
                    <T w="bold" size={13.5} color={colors.muted}>{reqNo(r.num)}</T>
                    <T w="bold" size={15} numberOfLines={1} style={{ flex: 1 }}>{g.length > 1 ? `${ar(g.length)} قطع: ${g.map((x) => x.r.part).join('، ')}` : r.part + (r.qty > 1 ? ` × ${ar(r.qty)}` : '')}</T>
                    {open ? (
                      <Row gap={3} style={{ backgroundColor: slow ? colors.badSoft : colors.soft, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}>
                        <Icon name="time" size={12} color={slow ? colors.bad : colors.ink} />
                        <T w="bold" size={12.5} color={slow ? colors.bad : colors.ink}>من {elapsed(r.created_at, now)}</T>
                      </Row>
                    ) : null}
                  </Row>
                  <Row gap={8}>
                    <Muted size={12.5} numberOfLines={1} style={{ flex: 1 }}>{r.car_make} {r.car_model} {ar(r.car_year)}{r.powertrain && r.powertrain !== 'petrol' ? ` · ${ptShort(r.powertrain)}` : ''} · {WANTED[r.wanted_condition]} · {r.area}</Muted>
                    {g.some((x) => x.r.photo_path) ? <Pill label="فيه صورة" tone="plain" /> : null}
                    {shop.brands.includes(r.car_make) ? <Pill label="في تخصصك" tone="good" /> : null}
                    {open && closesIn(r.created_at, now) ? <Pill label={`بيقفل بعد ${closesIn(r.created_at, now)}`} tone="wait" /> : null}
                    {g.length === 1 || !open ? shopPill(g[0].st) : null}
                  </Row>
                </View>
              </Press>
            );
          })}
        </RowList>
      ) : <Empty icon="file-tray-outline" text={shop.status !== 'approved' ? 'الطلبات هتظهر هنا بعد الموافقة على المحل.' : tab === 'open' ? 'مفيش طلبات جديدة دلوقتي. أول ما عميل يبعت طلب هيظهر هنا وهيوصلك إشعار.' : 'لسه مابعتش عروض.'} />}
      {curTab === 'open' && waiting ? <Muted center size={12}>العميل بيشوف إنت بترد في قد إيه. المحلات اللي بترد بسرعة بتبيع أكتر.</Muted> : null}
      <InstallCard />
    </Screen>
  );
}

/** The shop's installation work: bookings coming up, new requests to price, and requests already priced. */
function InstallInbox({ newOnes, quoted, bookings, past, now }: { newOnes: InstallRequest[]; quoted: InstallRequest[]; bookings: Booking[]; past: Booking[]; now: number }) {
  const services = useInstallServices(true);
  const name = (id: string) => serviceName(services.find((s) => s.id === id)) || 'تركيب';
  const reqRow = (r: InstallRequest, i: number, priced: boolean) => (
    <Press key={r.id} onPress={() => router.push(`/shop/install/${r.id}`)} label={name(r.service_id)}
      style={{ paddingHorizontal: 14, paddingVertical: 13, gap: 3, borderTopWidth: i ? 1 : 0, borderColor: colors.line }}>
      <Row gap={8}>
        <T w="bold" size={15} style={{ flex: 1 }} numberOfLines={1}>{name(r.service_id)}</T>
        {priced ? <Pill label="بعت سعر" tone="plain" /> : <T w="bold" size={12.5}>من {elapsed(r.created_at, now)}</T>}
      </Row>
      <Muted size={12.5} numberOfLines={1}>{[r.car_make, r.car_model, r.car_year ? ar(r.car_year) : ''].filter(Boolean).join(' ')} · {r.part_desc} · {r.area}</Muted>
    </Press>
  );
  return (
    <View style={{ gap: 14 }}>
      <Btn kind="link" title="خدمات التركيب وأسعارها" onPress={() => router.push('/shop/services')} />
      {bookings.length ? (
        <View style={{ gap: 8 }}>
          <T w="bold" size={16}>الحجوزات</T>
          <RowList>
            {bookings.map((b, i) => (
              <Press key={b.id} onPress={() => router.push(`/shop/booking/${b.id}`)} label={`حجز ${b.num}`}
                style={{ paddingHorizontal: 14, paddingVertical: 13, flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: i ? 1 : 0, borderColor: colors.line }}>
                <View style={{ flex: 1 }}>
                  <T w="bold" size={15}>{whenLabel(b.appointment_at)}</T>
                  <Muted size={12.5}>حجز #{ar(b.num)}{b.price != null ? ` · ${money(Number(b.price))} ج.م` : ' · بعد المعاينة'}</Muted>
                </View>
                <Pill label={BOOKING_STATUS[b.status].label} tone={BOOKING_STATUS[b.status].tone} />
              </Press>
            ))}
          </RowList>
        </View>
      ) : null}
      <View style={{ gap: 8 }}>
        <T w="bold" size={16}>طلبات تركيب جديدة</T>
        {newOnes.length ? <RowList>{newOnes.map((r, i) => reqRow(r, i, false))}</RowList>
          : <Empty icon="construct-outline" text="مفيش طلبات تركيب جديدة دلوقتي. أول ما عميل يطلب تركيب في محافظتك هيوصلك إشعار." />}
      </View>
      {quoted.length ? <View style={{ gap: 8 }}><T w="bold" size={16}>بعتّ سعرك</T><RowList>{quoted.map((r, i) => reqRow(r, i, true))}</RowList></View> : null}
      {past.length ? (
        <View style={{ gap: 8 }}>
          <T w="bold" size={16}>حجوزات سابقة</T>
          <RowList>
            {past.slice(0, 10).map((b, i) => (
              <Press key={b.id} onPress={() => router.push(`/shop/booking/${b.id}`)} style={{ paddingHorizontal: 14, paddingVertical: 12, flexDirection: 'row', gap: 10, borderTopWidth: i ? 1 : 0, borderColor: colors.line }}>
                <T size={14} style={{ flex: 1 }}>حجز #{ar(b.num)} · {whenLabel(b.appointment_at)}</T>
                <Pill label={BOOKING_STATUS[b.status].label} tone={BOOKING_STATUS[b.status].tone} />
              </Press>
            ))}
          </RowList>
        </View>
      ) : null}
    </View>
  );
}

/** Parts sent together arrive as one card, in the order of the first part's place in the list. */
function groupShown<X extends { r: Request }>(rows: X[]): X[][] {
  const out: X[][] = []; const at = new Map<string, number>();
  for (const x of rows) {
    const k = x.r.batch_id ?? x.r.id;
    if (at.has(k)) out[at.get(k)!].push(x); else { at.set(k, out.length); out.push([x]); }
  }
  return out.map((g) => g.sort((a, b) => a.r.num - b.r.num));
}

/** Requests close 7 days after they are sent: in the last day the row says how long is left. */
function closesIn(created: string, now: number): string | null {
  const ms = new Date(created).getTime() + 7 * 86400000 - now;
  if (ms <= 0 || ms > 86400000) return null;
  return ms >= 3600000 ? `${ar(Math.floor(ms / 3600000))} ساعة` : `${ar(Math.max(1, Math.ceil(ms / 60000)))} دقيقة`;
}

import { Redirect, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { BottomNav, rememberRole } from '@/components/AppHeader';
import { Bell } from '@/components/Bell';
import { shopPill, shopState, type ShopState } from '@/components/status';
import { Btn, Chips, Empty, Icon, Labeled, Loading, Muted, Notice, Photo, Pill, Press, Row, Screen, Seg, Select, T } from '@/components/ui';
import { Pressable, TextInput } from 'react-native';
import { InstallCard } from '@/components/InstallCard';
import { useAuth } from '@/lib/auth';
import { ORDER_LABEL, URGENCY, WANTED, ago, ar, money, orderActive, orderNo, partsLabel, reqNo, type Order, type Quote, type Request } from '@/lib/data';
import { must, useLive } from '@/lib/live';
import { photoUrl, supabase } from '@/lib/supabase';
import { colors, fonts, lift } from '@/lib/theme';

type Tab = 'open' | 'quoted' | 'orders' | 'all';

export default function ShopInbox() {
  const { ready, session, profile, shop, shopPrivate } = useAuth();
  const [tab, setTab] = useState<Tab>('open');
  const [q, setQ] = useState('');
  const [mineOnly, setMineOnly] = useState(false);
  const [cond, setCond] = useState<'all' | 'used' | 'new'>('all');
  const [urgentFirst, setUrgentFirst] = useState(false);
  const [area, setArea] = useState('الكل');
  const [showFilters, setShowFilters] = useState(false);
  const uid = session?.user.id;
  useEffect(() => { rememberRole('shop'); }, []);

  const { data, loading } = useLive(async () => {
    if (!uid) return { reqs: [] as Request[], mine: [] as Quote[], declined: new Set<string>(), orders: [] as Order[] };
    const reqs = must(await supabase.from('requests').select('*').order('created_at', { ascending: false }).limit(200)) as Request[];
    const mine = must(await supabase.from('quotes').select('*').eq('shop_id', uid)) as Quote[];
    const dec = must(await supabase.from('declines').select('request_id').eq('shop_id', uid)) as { request_id: string }[];
    const orders = must(await supabase.from('orders').select('*').eq('shop_id', uid).order('created_at', { ascending: false }).limit(100)) as Order[];
    return { reqs, mine, declined: new Set(dec.map((d) => d.request_id)), orders };
  }, ['requests', 'quotes', 'orders'], [uid, shop?.status]);

  if (ready && !session) return <Redirect href="/login" />;
  if (profile && (!shop || !shop.governorate)) return <Redirect href="/shop-setup" />;
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
  const urgencyRank = { urgent: 0, today: 1, normal: 2 } as const;
  const shown = rows
    .filter((x) => !mineOnly || shop.brands.includes(x.r.car_make))
    .filter((x) => cond === 'all' || x.r.wanted_condition === cond || x.r.wanted_condition === 'any')
    .filter((x) => area === 'الكل' || x.r.area === area)
    .filter((x) => !needle || `${x.r.part} ${x.r.car_make} ${x.r.car_model} ${x.r.notes}`.includes(needle))
    .sort((a, b) => (urgentFirst ? urgencyRank[a.r.urgency] - urgencyRank[b.r.urgency] : 0)
      || Number(!shop.brands.includes(a.r.car_make)) - Number(!shop.brands.includes(b.r.car_make)) || b.r.created_at.localeCompare(a.r.created_at));
  const activeFilters = Number(mineOnly) + Number(cond !== 'all') + Number(urgentFirst) + Number(area !== 'الكل');
  const orders = data?.orders ?? [];
  const activeOrders = orders.filter(orderActive);
  const sales = orders.filter((o) => o.status === 'received').reduce((s, o) => s + Number(o.items_total), 0);
  const waiting = rows.filter((x) => x.st === 'open').length;

  return (
    <Screen nav={<BottomNav role="shop" />} top={
      <View style={{ backgroundColor: colors.ink, borderBottomLeftRadius: 28, borderBottomRightRadius: 28, paddingBottom: 56 }}>
        <View style={{ width: '100%', maxWidth: 560, alignSelf: 'center', paddingHorizontal: 18, paddingTop: 14, gap: 14 }}>
          <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <View style={{ flex: 1 }}>
              <T size={13} color="rgba(255,255,255,.65)">{shop.area}، {shop.governorate}، {shop.offers_delivery ? 'بيوصّل' : 'استلام من المحل'}</T>
              <T w="bold" size={26} color="#fff" style={{ lineHeight: 36 }}>{shopPrivate?.name}</T>
            </View>
            <Bell light />
          </Row>
          <Row gap={8}>
            {[[ar(waiting), 'طلبات مستنية ردّك', true], [ar(activeOrders.length), 'أوردرات تجهّزها', false], [money(sales), 'مبيعات ج.م', false]].map(([v, l, hot]) => (
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
      {shop.status === 'pending' ? <Notice><T w="semibold" size={14}>محلك تحت المراجعة</T><T size={13}>أول ما نوافق، الطلبات هتظهر هنا وتقدر تبعت عروض.</T></Notice> : null}
      {shop.status === 'suspended' ? <Notice>المحل موقوف مؤقتاً. كلّمنا لو فيه سؤال.</Notice> : null}
      <View style={[{ backgroundColor: colors.surface, borderRadius: 20, padding: 6 }, lift]}>
      <Seg options={[{ v: 'open', label: 'جديد' }, { v: 'quoted', label: 'عروضي' }, { v: 'orders', label: `أوردرات${activeOrders.length ? ' ' + ar(activeOrders.length) : ''}` }, { v: 'all', label: 'الكل' }] as { v: Tab; label: string }[]}
        value={tab} onPick={setTab} />
      </View>
      </View>
      <Row gap={8}>
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
      </Row>
      {showFilters ? (
        <View style={[{ gap: 14, backgroundColor: colors.surface, borderRadius: 20, padding: 14 }, lift]}>
          <Chips options={[{ v: 'mine', label: 'ماركاتي بس' }, { v: 'urgent', label: 'المستعجل الأول' }]} selected={[...(mineOnly ? ['mine'] : []), ...(urgentFirst ? ['urgent'] : [])]}
            onPick={(v) => (v === 'mine' ? setMineOnly((x) => !x) : setUrgentFirst((x) => !x))} />
          <Labeled label="العميل عايزها">
            <Seg options={[{ v: 'all', label: 'الكل' }, { v: 'used', label: 'مستعمل' }, { v: 'new', label: 'جديد' }] as { v: 'all' | 'used' | 'new'; label: string }[]} value={cond} onPick={setCond} />
          </Labeled>
          <Select label="المنطقة" value={area} options={areas.map((a) => ({ v: a, label: a }))} onPick={setArea} />
          {activeFilters ? <Btn kind="link" title="امسح الفلاتر" onPress={() => { setMineOnly(false); setCond('all'); setUrgentFirst(false); setArea('الكل'); }} /> : null}
        </View>
      ) : null}
      {tab === 'orders' ? (
        orders.length ? (
          <View style={{ gap: 12 }}>
            {orders.map((o) => {
              const ps = (data?.reqs ?? []).filter((r) => r.order_id === o.id);
              const live = orderActive(o);
              return (
                <Press key={o.id} onPress={() => router.push({ pathname: '/shop/order/[id]', params: { id: o.id } })}
                  style={[{ backgroundColor: live ? colors.ink : colors.surface, borderRadius: 18, padding: 16, gap: 10 }, lift]}>
                  <Row gap={12}>
                    <View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: live ? colors.accent : colors.soft, alignItems: 'center', justifyContent: 'center' }}>
                      <Icon name={ORDER_LABEL[o.status].icon} size={22} color={live ? colors.ink : colors.muted} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <T w="bold" size={15} color={live ? '#fff' : colors.ink}>أوردر {orderNo(o.order_no)}، {ORDER_LABEL[o.status].short}</T>
                      <T size={12.5} color={live ? 'rgba(255,255,255,.7)' : colors.muted} numberOfLines={1}>{ps.length ? partsLabel(ps) : ''}، {o.delivery_mode === 'delivery' ? 'توصيل' : 'استلام'}</T>
                    </View>
                    <T w="bold" size={15} color={live ? colors.accent : colors.ink}>{money(Number(o.items_total))}</T>
                  </Row>
                </Press>
              );
            })}
          </View>
        ) : <Empty icon="cube-outline" text={'مفيش أوردرات لسه.\nلما عميل يختار عرضك، الأوردر بيظهر هنا.'} />
      ) : loading && !data ? <Loading /> : groupShown(shown).some((g) => tab === 'all' || g.some((x) => x.st === tab)) ? (
        <View style={{ gap: 12 }}>
          {groupShown(shown).filter((g) => tab === 'all' || g.some((x) => x.st === tab)).map((g) => {
            const r = g[0].r;
            const fresh = g.some((x) => x.st === 'open');
            return (
              <Press key={r.batch_id ?? r.id} onPress={() => router.push(`/shop/${(g.find((x) => x.st === 'open') ?? g[0]).r.id}`)}
                style={[lift, { backgroundColor: colors.surface, borderRadius: 18, padding: 14, gap: 10, borderWidth: 2, borderColor: fresh ? colors.accent : colors.line }]}>
                <Row gap={12}>
                  <Photo uri={photoUrl(g.find((x) => x.r.photo_path)?.r.photo_path)} size={50} />
                  <View style={{ flex: 1, gap: 1 }}>
                    <Row gap={6}>
                      <T w="bold" size={15} numberOfLines={1} style={{ flexShrink: 1 }}>{g.length > 1 ? `${ar(g.length)} قطع` : r.part}</T>
                      {shop.brands.includes(r.car_make) ? <Pill label="تخصصك" tone="good" /> : null}
                    </Row>
                    <Muted size={12.5} numberOfLines={1}>{r.car_make} {r.car_model} {ar(r.car_year)}، {r.area}</Muted>
                  </View>
                  {g.length === 1 ? shopPill(g[0].st) : null}
                </Row>
                {g.length > 1 ? (
                  <View style={{ gap: 6, backgroundColor: colors.soft, borderRadius: 14, padding: 10 }}>
                    {g.map((x) => (
                      <Row key={x.r.id} style={{ justifyContent: 'space-between' }}>
                        <T size={13.5} w="medium" numberOfLines={1} style={{ flex: 1 }}>{x.r.part}{x.r.qty > 1 ? ` × ${ar(x.r.qty)}` : ''} <T size={12} color={colors.muted}>، {WANTED[x.r.wanted_condition]}</T></T>
                        {shopPill(x.st)}
                      </Row>
                    ))}
                  </View>
                ) : null}
                <Row gap={6}>
                  <Icon name="time-outline" size={14} color={colors.faint} />
                  <Muted size={12}>{reqNo(r.num)}، {ago(r.created_at)}{r.urgency !== 'normal' ? '، ' + URGENCY[r.urgency] : ''}{r.budget && g.length === 1 ? '، ميزانية ' + money(r.budget) : ''}</Muted>
                </Row>
              </Press>
            );
          })}
        </View>
      ) : <Empty icon="file-tray-outline" text={shop.status !== 'approved' ? 'الطلبات هتظهر هنا بعد الموافقة على المحل.' : tab === 'open' ? 'مفيش طلبات جديدة دلوقتي.\nأول ما عميل يبعت طلب هيظهر هنا.' : 'مفيش حاجة هنا لسه.'} />}
      <InstallCard />
    </Screen>
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

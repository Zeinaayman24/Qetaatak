import { Redirect, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { BottomNav, rememberRole } from '@/components/AppHeader';
import { Bell } from '@/components/Bell';
import { shopPill, shopState, type ShopState } from '@/components/status';
import { Btn, Chips, Empty, Icon, Labeled, ListRow, Loading, Muted, Notice, Photo, Row, Screen, Seg, Select, Stats, T } from '@/components/ui';
import { Pressable, TextInput } from 'react-native';
import { useAuth } from '@/lib/auth';
import { URGENCY, WANTED, ago, ar, money, reqNo, type Quote, type Request } from '@/lib/data';
import { must, useLive } from '@/lib/live';
import { photoUrl, supabase } from '@/lib/supabase';
import { colors, fonts } from '@/lib/theme';

type Tab = 'open' | 'quoted' | 'sold' | 'all';

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
    if (!uid) return { reqs: [] as Request[], mine: [] as Quote[], declined: new Set<string>() };
    const reqs = must(await supabase.from('requests').select('*').order('created_at', { ascending: false }).limit(200)) as Request[];
    const mine = must(await supabase.from('quotes').select('*').eq('shop_id', uid)) as Quote[];
    const dec = must(await supabase.from('declines').select('request_id').eq('shop_id', uid)) as { request_id: string }[];
    return { reqs, mine, declined: new Set(dec.map((d) => d.request_id)) };
  }, ['requests', 'quotes'], [uid, shop?.status]);

  if (ready && !session) return <Redirect href="/login" />;
  if (profile && (!shop || !shop.governorate)) return <Redirect href="/shop-setup" />;
  if (!profile || !shop) return <Screen><Loading /></Screen>;

  const rows = (data?.reqs ?? [])
    .filter((r) => r.customer_id !== uid || profile.is_admin)
    .map((r) => {
      const mq = data!.mine.find((q) => q.request_id === r.id);
      return { r, mq, st: shopState(r, mq, data!.declined.has(r.id)) as ShopState };
    });
  const areas = ['الكل', ...Array.from(new Set(rows.map((x) => x.r.area))).sort()];
  const needle = q.trim();
  const urgencyRank = { urgent: 0, today: 1, normal: 2 } as const;
  const shown = rows
    .filter((x) => (tab === 'all' ? true : x.st === tab))
    .filter((x) => !mineOnly || shop.brands.includes(x.r.car_make))
    .filter((x) => cond === 'all' || x.r.wanted_condition === cond || x.r.wanted_condition === 'any')
    .filter((x) => area === 'الكل' || x.r.area === area)
    .filter((x) => !needle || `${x.r.part} ${x.r.car_make} ${x.r.car_model} ${x.r.notes}`.includes(needle))
    .sort((a, b) => (urgentFirst ? urgencyRank[a.r.urgency] - urgencyRank[b.r.urgency] : 0)
      || Number(!shop.brands.includes(a.r.car_make)) - Number(!shop.brands.includes(b.r.car_make)) || b.r.created_at.localeCompare(a.r.created_at));
  const activeFilters = Number(mineOnly) + Number(cond !== 'all') + Number(urgentFirst) + Number(area !== 'الكل');
  const sales = rows.filter((x) => x.st === 'sold').reduce((s, x) => s + (x.mq?.price ?? 0), 0);
  const waiting = rows.filter((x) => x.st === 'open').length;

  return (
    <Screen nav={<BottomNav role="shop" />}>
      <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View style={{ flex: 1 }}>
          <Muted size={14}>{shop.area}، {shop.governorate} · {shop.offers_delivery ? 'بيوصّل' : 'استلام من المحل'}</Muted>
          <T w="bold" size={26} style={{ lineHeight: 36 }}>{shopPrivate?.name}</T>
        </View>
        <Bell />
      </Row>
      {shop.status === 'pending' ? <Notice><T w="semibold" size={14}>محلك تحت المراجعة</T><T size={13}>أول ما نوافق، الطلبات هتظهر هنا وتقدر تبعت عروض.</T></Notice> : null}
      {shop.status === 'suspended' ? <Notice>المحل موقوف مؤقتاً. كلّمنا لو فيه سؤال.</Notice> : null}
      <Stats items={[[ar(waiting), 'مستنية ردّك'], [ar(data?.mine.length ?? 0), 'عروض بعتها'], [money(sales), 'مبيعات (ج.م)']]} />
      <Seg options={[{ v: 'open', label: 'جديد' }, { v: 'quoted', label: 'بعت عرض' }, { v: 'sold', label: 'مبيعات' }, { v: 'all', label: 'الكل' }] as { v: Tab; label: string }[]}
        value={tab} onPick={setTab} />
      <Row gap={8}>
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.card, borderRadius: 14, paddingHorizontal: 12 }}>
          <Icon name="search" size={18} color={colors.muted} />
          <TextInput value={q} onChangeText={setQ} placeholder="دوّر: فانوس، سنترا…" placeholderTextColor={colors.faint}
            style={[{ flex: 1, paddingVertical: 11, fontFamily: fonts.medium, fontSize: 15, color: colors.ink, textAlign: 'right' }, { outlineStyle: 'none' } as any]} />
        </View>
        <Pressable onPress={() => setShowFilters((v) => !v)} accessibilityRole="button" accessibilityLabel="الفلاتر"
          style={{ height: 46, paddingHorizontal: 14, borderRadius: 14, backgroundColor: showFilters || activeFilters ? colors.ink : colors.card, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Icon name="options-outline" size={18} color={showFilters || activeFilters ? '#fff' : colors.ink} />
          {activeFilters ? <T size={13} w="bold" color="#fff">{ar(activeFilters)}</T> : null}
        </Pressable>
      </Row>
      {showFilters ? (
        <View style={{ gap: 14, backgroundColor: colors.card, borderRadius: 18, padding: 14 }}>
          <Chips options={[{ v: 'mine', label: 'ماركاتي بس' }, { v: 'urgent', label: 'المستعجل الأول' }]} selected={[...(mineOnly ? ['mine'] : []), ...(urgentFirst ? ['urgent'] : [])]}
            onPick={(v) => (v === 'mine' ? setMineOnly((x) => !x) : setUrgentFirst((x) => !x))} />
          <Labeled label="العميل عايزها">
            <Seg options={[{ v: 'all', label: 'الكل' }, { v: 'used', label: 'مستعمل' }, { v: 'new', label: 'جديد' }] as { v: 'all' | 'used' | 'new'; label: string }[]} value={cond} onPick={setCond} />
          </Labeled>
          <Select label="المنطقة" value={area} options={areas.map((a) => ({ v: a, label: a }))} onPick={setArea} />
          {activeFilters ? <Btn kind="link" title="امسح الفلاتر" onPress={() => { setMineOnly(false); setCond('all'); setUrgentFirst(false); setArea('الكل'); }} /> : null}
        </View>
      ) : null}
      {loading && !data ? <Loading /> : shown.length ? (
        <View>
          {shown.map(({ r, st }, i) => (
            <ListRow key={r.id} last={i === shown.length - 1} onPress={() => router.push(`/shop/${r.id}`)}
              leading={<Photo uri={photoUrl(r.photo_path)} size={48} />}
              title={r.part}
              subtitle={<Muted numberOfLines={1}>{r.car_make} {r.car_model} {ar(r.car_year)} · {WANTED[r.wanted_condition]}{shop.brands.includes(r.car_make) ? <T size={13} color={colors.good} w="semibold">  · تخصصك</T> : null}</Muted>}
              meta={`${r.area} · ${reqNo(r.num)} · ${ago(r.created_at)}${r.urgency !== 'normal' ? ' · ' + URGENCY[r.urgency] : ''}${r.budget ? ' · ميزانية ' + money(r.budget) : ''}`}
              trailing={shopPill(st)} />
          ))}
        </View>
      ) : <Empty icon="📭" text={shop.status !== 'approved' ? 'الطلبات هتظهر هنا بعد الموافقة على المحل.' : tab === 'open' ? 'مفيش طلبات جديدة دلوقتي.\nأول ما عميل يبعت طلب هيظهر هنا.' : 'مفيش حاجة هنا لسه.'} />}
    </Screen>
  );
}

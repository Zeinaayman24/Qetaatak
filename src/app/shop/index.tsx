import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { AppHeader } from '@/components/AppHeader';
import { shopPill, shopState, type ShopState } from '@/components/status';
import { Btn, Empty, ListRow, Loading, Muted, Notice, Photo, Row, Screen, Seg, Stats, T } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { WANTED, ago, ar, money, reqNo, type Quote, type Request } from '@/lib/data';
import { must, useLive } from '@/lib/live';
import { photoUrl, supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';

type Tab = 'open' | 'quoted' | 'sold' | 'all';

export default function ShopInbox() {
  const { ready, session, profile, shop, shopPrivate } = useAuth();
  const [tab, setTab] = useState<Tab>('open');
  const uid = session?.user.id;

  const { data, loading } = useLive(async () => {
    if (!uid) return { reqs: [] as Request[], mine: [] as Quote[], declined: new Set<string>() };
    const reqs = must(await supabase.from('requests').select('*').order('created_at', { ascending: false }).limit(200)) as Request[];
    const mine = must(await supabase.from('quotes').select('*').eq('shop_id', uid)) as Quote[];
    const dec = must(await supabase.from('declines').select('request_id').eq('shop_id', uid)) as { request_id: string }[];
    return { reqs, mine, declined: new Set(dec.map((d) => d.request_id)) };
  }, ['requests', 'quotes'], [uid, shop?.status]);

  if (ready && !session) return <Redirect href="/login" />;
  if (profile && !shop) return <Redirect href="/shop-setup" />;
  if (!profile || !shop) return <Screen header={<AppHeader role="shop" />}><Loading /></Screen>;

  const rows = (data?.reqs ?? [])
    .filter((r) => r.customer_id !== uid || profile.is_admin)
    .map((r) => {
      const mq = data!.mine.find((q) => q.request_id === r.id);
      return { r, mq, st: shopState(r, mq, data!.declined.has(r.id)) as ShopState };
    });
  const shown = rows
    .filter((x) => (tab === 'all' ? true : x.st === tab))
    .sort((a, b) => Number(!shop.brands.includes(a.r.car_make)) - Number(!shop.brands.includes(b.r.car_make)) || b.r.created_at.localeCompare(a.r.created_at));
  const sales = rows.filter((x) => x.st === 'sold').reduce((s, x) => s + (x.mq?.price ?? 0), 0);
  const waiting = rows.filter((x) => x.st === 'open').length;

  return (
    <Screen header={<AppHeader role="shop" />}>
      <Row style={{ justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <View style={{ flex: 1 }}>
          <Muted size={14}>{shop.area}</Muted>
          <T w="bold" size={26} style={{ lineHeight: 36 }}>{shopPrivate?.name}</T>
        </View>
        <Btn kind="link" title="تعديل" onPress={() => router.push('/shop-setup')} />
      </Row>
      {shop.status === 'pending' ? <Notice><T w="semibold" size={14}>محلك تحت المراجعة</T><T size={13}>أول ما نوافق، الطلبات هتظهر هنا وتقدر تبعت عروض.</T></Notice> : null}
      {shop.status === 'suspended' ? <Notice>المحل موقوف مؤقتاً. كلّمنا لو فيه سؤال.</Notice> : null}
      <Stats items={[[ar(waiting), 'مستنية ردّك'], [ar(data?.mine.length ?? 0), 'عروض بعتها'], [money(sales), 'مبيعات (ج.م)']]} />
      <Seg options={[{ v: 'open', label: 'جديد' }, { v: 'quoted', label: 'بعت عرض' }, { v: 'sold', label: 'مبيعات' }, { v: 'all', label: 'الكل' }] as { v: Tab; label: string }[]}
        value={tab} onPick={setTab} />
      {loading && !data ? <Loading /> : shown.length ? (
        <View>
          {shown.map(({ r, st }, i) => (
            <ListRow key={r.id} last={i === shown.length - 1} onPress={() => router.push(`/shop/${r.id}`)}
              leading={<Photo uri={photoUrl(r.photo_path)} size={48} />}
              title={r.part}
              subtitle={<Muted numberOfLines={1}>{r.car_make} {r.car_model} {ar(r.car_year)} · {WANTED[r.wanted_condition]}{shop.brands.includes(r.car_make) ? <T size={13} color={colors.good} w="semibold">  · تخصصك</T> : null}</Muted>}
              meta={`${r.area} · ${reqNo(r.num)} · ${ago(r.created_at)}`}
              trailing={shopPill(st)} />
          ))}
        </View>
      ) : <Empty icon="📭" text={shop.status !== 'approved' ? 'الطلبات هتظهر هنا بعد الموافقة على المحل.' : tab === 'open' ? 'مفيش طلبات جديدة دلوقتي.\nأول ما عميل يبعت طلب هيظهر هنا.' : 'مفيش حاجة هنا لسه.'} />}
    </Screen>
  );
}

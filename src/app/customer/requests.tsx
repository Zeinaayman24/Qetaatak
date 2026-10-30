import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { BottomNav } from '@/components/AppHeader';
import { Empty, Icon, Loading, Muted, Photo, Pill, Plate, Press, Row, Screen, Seg, T } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { ORDER_LABEL, ago, ar, groupRequests, money, orderActive, orderNo, orderStep, orderSteps, partsLabel, reqNo, type Order, type Quote, type Request } from '@/lib/data';
import { must, useLive } from '@/lib/live';
import { needsPayment } from '@/lib/payments';
import { photoUrl, supabase } from '@/lib/supabase';
import { colors, lift } from '@/lib/theme';

type Tab = 'orders' | 'quotes' | 'past';

/** Everything the customer started: orders on the way, price requests waiting for offers, and history. */
export default function MyRequests() {
  const { ready, session } = useAuth();
  const params = useLocalSearchParams<{ tab?: string }>();
  const uid = session?.user.id;
  const [tab, setTab] = useState<Tab>((['orders', 'quotes', 'past'].includes(String(params.tab)) ? params.tab : 'orders') as Tab);
  const { data, loading } = useLive(async () => {
    if (!uid) return { reqs: [] as Request[], quotes: [] as Pick<Quote, 'id' | 'request_id'>[], orders: [] as Order[] };
    const [reqs, orders] = await Promise.all([
      supabase.from('requests').select('*').eq('customer_id', uid).order('created_at', { ascending: false }).limit(200),
      supabase.from('orders').select('*').eq('customer_id', uid).order('created_at', { ascending: false }).limit(100),
    ]);
    const rs = must(reqs) as Request[];
    const ids = rs.filter((r) => r.status === 'open').map((r) => r.id);
    const quotes = ids.length ? (must(await supabase.from('quotes').select('id, request_id').in('request_id', ids)) as Pick<Quote, 'id' | 'request_id'>[]) : [];
    return { reqs: rs, quotes, orders: must(orders) as Order[] };
  }, ['requests', 'quotes', 'orders'], [uid]);

  if (ready && !session) return <Redirect href="/login" />;
  const reqs = data?.reqs ?? [];
  const orders = data?.orders ?? [];
  const activeOrders = orders.filter(orderActive);
  const pastOrders = orders.filter((o) => !orderActive(o));
  const openGroups = groupRequests(reqs).filter((g) => g.items.some((r) => r.status === 'open'));
  const partsOf = (o: Order) => reqs.filter((r) => r.order_id === o.id);

  const orderCard = (o: Order) => {
    const ps = partsOf(o);
    const steps = orderSteps(o.delivery_mode);
    const at = orderStep(o);
    const live = orderActive(o);
    return (
      <Press key={o.id} onPress={() => router.push({ pathname: '/order/[id]', params: { id: o.id } })}
        style={[lift, { backgroundColor: colors.surface, borderRadius: 16, padding: 14, gap: 12 }]}>
        <Row gap={12}>
          <View style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: live ? colors.primarySoft : o.status === 'received' ? colors.goodSoft : colors.soft, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name={ORDER_LABEL[o.status].icon} size={22} color={live ? colors.primary : o.status === 'received' ? colors.good : colors.faint} />
          </View>
          <View style={{ flex: 1, gap: 1 }}>
            <T w="bold" size={15} numberOfLines={1}>{ps.length ? partsLabel(ps) : 'أوردر'}</T>
            <Muted size={12}>أوردر {orderNo(o.order_no)}، {money(Number(o.items_total) + Number(o.delivery_fee))} ج.م، {ago(o.created_at)}</Muted>
          </View>
          {needsPayment(o) ? <Pill label="ادفع" tone="wait" icon="card" /> : o.status === 'received' && !o.rating ? <Pill label="قيّم" tone="wait" icon="star" /> : <Pill label={ORDER_LABEL[o.status].short} tone={live ? 'new' : o.status === 'received' ? 'good' : 'plain'} />}
        </Row>
        {live ? (
          <Row gap={4}>{steps.map((s, i) => <View key={s} style={{ flex: 1, height: 5, borderRadius: 3, backgroundColor: i <= at ? colors.primary : colors.soft }} />)}</Row>
        ) : null}
      </Press>
    );
  };

  return (
    <Screen nav={<BottomNav role="customer" />}>
      <T w="bold" size={28} style={{ lineHeight: 40 }}>طلباتي</T>
      <Seg options={[
        { v: 'orders', label: `أوردرات${activeOrders.length ? '، ' + ar(activeOrders.length) : ''}` },
        { v: 'quotes', label: `عروض أسعار${openGroups.length ? '، ' + ar(openGroups.length) : ''}` },
        { v: 'past', label: 'خلصت' },
      ] as { v: Tab; label: string }[]} value={tab} onPick={setTab} />

      {loading && !data ? <Loading /> : tab === 'orders' ? (
        activeOrders.length ? <View style={{ gap: 12 }}>{activeOrders.map(orderCard)}</View>
          : <Empty icon="cube-outline" text={'مفيش أوردرات شغالة.\nلما تختار عرض، الأوردر بيظهر هنا.'} action={openGroups.length ? { label: 'شوف العروض', onPress: () => setTab('quotes') } : undefined} />
      ) : tab === 'quotes' ? (
        openGroups.length ? (
          <View style={{ gap: 12 }}>
            {openGroups.map((g) => {
              const open = g.items.filter((r) => r.status === 'open');
              const n = data!.quotes.filter((q) => open.some((r) => r.id === q.request_id)).length;
              const photo = g.items.find((r) => r.photo_path)?.photo_path;
              return (
                <Press key={g.key} onPress={() => router.push(`/customer/${g.first.id}`)}
                  style={[lift, { backgroundColor: colors.surface, borderRadius: 16, padding: 14, gap: 12, borderWidth: n ? 1.5 : 1, borderColor: n ? colors.primary : colors.line }]}>
                  <Row gap={12}>
                    {photo ? <Photo uri={photoUrl(photo)} size={52} /> : <Plate top="طلب" bottom={reqNo(g.first.num).replace('#', '')} size="sm" />}
                    <View style={{ flex: 1, gap: 1 }}>
                      <T w="bold" size={15} numberOfLines={1}>{partsLabel(open)}</T>
                      <Muted size={12}>{g.first.car_make} {g.first.car_model}، {reqNo(g.first.num)}، {ago(g.first.created_at)}</Muted>
                    </View>
                  </Row>
                  <Row gap={8}>
                    <Icon name={n ? 'pricetags' : 'time'} size={18} color={n ? colors.accentDeep : colors.muted} />
                    <T size={13} w="semibold" color={n ? colors.accentDeep : colors.muted} style={{ flex: 1 }}>{n ? `${ar(n)} عروض مستنياك تختار` : 'بندوّر عند المحلات'}</T>
                    {g.items.length > open.length ? <Muted size={12}>{ar(g.items.length - open.length)} في أوردرات</Muted> : null}
                    <Icon name="chevron-back" size={15} color={colors.faint} />
                  </Row>
                </Press>
              );
            })}
          </View>
        ) : <Empty icon="pricetags-outline" text="مفيش طلبات أسعار مفتوحة." action={{ label: 'اطلب قطعة', onPress: () => router.push('/customer/new') }} />
      ) : (
        pastOrders.length ? <View style={{ gap: 12 }}>{pastOrders.map(orderCard)}</View> : <Empty icon="time-outline" text="لسه مفيش أوردرات خلصت." />
      )}
    </Screen>
  );
}

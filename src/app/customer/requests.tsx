import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { BottomNav } from '@/components/AppHeader';
import { OrderRow, RowList, StatusTabs, bucketOf, type Bucket } from '@/components/OrderRows';
import { Empty, Icon, Loading, Muted, Press, Row, Screen, T } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { ar, elapsed, groupRequests, partsLabel, reqNo, type Order, type Quote, type Request } from '@/lib/data';
import { must, useLive, useNow } from '@/lib/live';
import { needsPayment } from '@/lib/payments';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';

type Tab = 'quotes' | 'preparing' | 'ready' | 'done';

/** Everything the customer started: price requests waiting for a choice, and orders by status. */
export default function MyRequests() {
  const { ready, session } = useAuth();
  const params = useLocalSearchParams<{ tab?: string }>();
  const uid = session?.user.id;
  const [picked, setTab] = useState<Tab | null>((['quotes', 'preparing', 'ready', 'done'].includes(String(params.tab)) ? params.tab : null) as Tab | null);
  const now = useNow(1000);
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
  const openGroups = groupRequests(reqs).filter((g) => g.items.some((r) => r.status === 'open'));
  const offersOf = (g: (typeof openGroups)[number]) => data!.quotes.filter((q) => g.items.some((r) => r.id === q.request_id && r.status === 'open')).length;
  const withOffers = openGroups.filter((g) => offersOf(g) > 0).length;
  const inTab = (b: Bucket) => orders.filter((o) => bucketOf(o) === b);
  // open on whatever needs the customer most: offers to choose, then ready orders
  const tab: Tab = picked ?? (withOffers ? 'quotes' : inTab('ready').length ? 'ready' : inTab('preparing').length ? 'preparing' : openGroups.length ? 'quotes' : 'done');
  const partsOf = (o: Order) => reqs.filter((r) => r.order_id === o.id);
  const list = tab === 'quotes' ? [] : inTab(tab);

  return (
    <Screen nav={<BottomNav role="customer" />}>
      <T w="bold" size={28} style={{ lineHeight: 40 }}>طلباتي</T>
      <StatusTabs<Tab> value={tab} onPick={setTab} items={[
        { v: 'quotes', label: 'عروض الأسعار', n: openGroups.length, hot: withOffers > 0 },
        { v: 'preparing', label: 'بيتجهز', n: inTab('preparing').length },
        { v: 'ready', label: 'جاهز', n: inTab('ready').length, hot: inTab('ready').length > 0 },
        { v: 'done', label: 'خلصت' },
      ]} />

      {loading && !data ? <Loading /> : tab === 'quotes' ? (
        openGroups.length ? (
          <RowList>
            {openGroups.map((g, i) => {
              const open = g.items.filter((r) => r.status === 'open');
              const n = offersOf(g);
              return (
                <Press key={g.key} onPress={() => router.push(`/customer/${g.first.id}`)} label={partsLabel(open)}
                  style={{ paddingHorizontal: 14, paddingVertical: 13, gap: 6, borderTopWidth: i ? 1 : 0, borderColor: colors.line, backgroundColor: n ? colors.primarySoft : colors.surface }}>
                  <Row gap={8}>
                    <T w="bold" size={13.5} color={colors.muted}>{reqNo(g.first.num)}</T>
                    <T w="bold" size={15} numberOfLines={1} style={{ flex: 1 }}>{partsLabel(open)}</T>
                    <Row gap={3}><Icon name="time-outline" size={13} color={colors.muted} /><T size={12.5} w="semibold" color={colors.muted}>{elapsed(g.first.created_at, now)}</T></Row>
                  </Row>
                  <Row gap={8}>
                    <Muted size={12.5} style={{ flex: 1 }}>{g.first.car_make} {g.first.car_model}{g.items.length > open.length ? `، ${ar(g.items.length - open.length)} في أوردرات` : ''}</Muted>
                    {n ? (
                      <Row gap={5} style={{ backgroundColor: colors.lime, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 }}>
                        <Icon name="pricetags" size={13} color={colors.ink} /><T w="bold" size={12.5} color={colors.ink}>{ar(n)} {n > 1 ? 'عروض' : 'عرض'}، اختار</T>
                      </Row>
                    ) : <Muted size={12.5}>بندوّر عند المحلات…</Muted>}
                  </Row>
                </Press>
              );
            })}
          </RowList>
        ) : <Empty icon="pricetags-outline" text="مفيش طلبات أسعار مفتوحة." action={{ label: 'اطلب قطعة', onPress: () => router.push('/customer/new') }} />
      ) : list.length ? (
        <RowList>
          {list.map((o, i) => {
            const ps = partsOf(o);
            return (
              <OrderRow key={o.id} o={o} first={i === 0} title={ps.length ? partsLabel(ps) : 'أوردر'}
                flag={needsPayment(o) ? { label: 'ادفع', tone: 'wait' } : o.status === 'received' && !o.rating ? { label: 'قيّم', tone: 'wait' } : undefined}
                onPress={() => router.push({ pathname: '/order/[id]', params: { id: o.id } })} />
            );
          })}
        </RowList>
      ) : (
        <Empty icon={tab === 'done' ? 'time-outline' : 'cube-outline'}
          text={tab === 'done' ? 'لسه مفيش أوردرات خلصت.' : tab === 'ready' ? 'مفيش أوردرات جاهزة دلوقتي.' : 'مفيش أوردرات بتتجهز دلوقتي.\nلما تختار عرض، الأوردر بيظهر هنا.'} />
      )}
    </Screen>
  );
}

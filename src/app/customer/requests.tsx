import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { BottomNav } from '@/components/AppHeader';
import { bucketOf, type Bucket } from '@/components/OrderRows';
import { Btn, Empty, Loading, Muted, Press, Row, Screen, Seg, T } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { ORDER_LABEL, ar, elapsed, groupRequests, money, orderNo, partsLabel, reqNo, type Order, type Quote, type Request } from '@/lib/data';
import { must, useLive, useNow } from '@/lib/live';
import { needsPayment } from '@/lib/payments';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';
import { t } from '@/lib/i18n';
import { carLabel } from '@/lib/catalogue';

type Tab = 'active' | 'done';

/** Everything the customer started, in two tabs: still going (requests and open orders, what needs you first) and finished. */
export default function MyRequests() {
  const { ready, session } = useAuth();
  const params = useLocalSearchParams<{ tab?: string }>();
  const uid = session?.user.id;
  // older links still say quotes / preparing / ready: they all open the «شغّالة» tab
  const [picked, setTab] = useState<Tab | null>(params.tab === 'done' ? 'done' : params.tab ? 'active' : null);
  const now = useNow(60000);
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
  const inTab = (b: Bucket) => orders.filter((o) => bucketOf(o) === b);
  const live = [...inTab('ready'), ...inTab('preparing')];
  const tab: Tab = picked ?? (openGroups.length || live.length ? 'active' : 'done');
  const partsOf = (o: Order) => reqs.filter((r) => r.order_id === o.id);
  // requests that closed after 7 days with no order (A16)
  const expired = groupRequests(reqs).filter((g) => g.items.some((r) => r.status === 'expired') && g.items.every((r) => r.status === 'expired' || r.status === 'cancelled'));
  const finished = inTab('done');

  /** One card: what it is, its status, and the next step on the bottom line. */
  const card = (key: string, title: string, sub: string, status: string, tone: [string, string], when: string, next: string, go: () => void) => (
    <Press key={key} onPress={go} label={title}
      style={{ backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.line, padding: 16, gap: 10 }}>
      <Row style={{ alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <T w="semibold" size={16} numberOfLines={1}>{title}</T>
          <Muted size={13} numberOfLines={1}>{sub}</Muted>
        </View>
        <View style={{ backgroundColor: tone[0], borderRadius: 10, paddingHorizontal: 10, paddingVertical: 3 }}><T size={13} w="semibold" color={tone[1]} style={{ lineHeight: 19 }}>{status}</T></View>
      </Row>
      <Row style={{ justifyContent: 'space-between', borderTopWidth: 1, borderColor: '#EEF0F3', paddingTop: 10 }}>
        <Muted size={13.5}>{when}</Muted>
        {next ? <T size={14} w="semibold" color={colors.primary}>{next}</T> : null}
      </Row>
    </Press>
  );
  const blue: [string, string] = [colors.primarySoft, colors.primary], grey: [string, string] = [colors.soft, colors.muted];
  const green: [string, string] = [colors.goodSoft, colors.good], orange: [string, string] = [colors.warnSoft, colors.warn], red: [string, string] = [colors.badSoft, colors.bad];
  const groupsSorted = [...openGroups].sort((a, b) => offersOf(b) - offersOf(a));

  return (
    <Screen nav={<BottomNav role="customer" />}>
      <Row style={{ justifyContent: 'space-between' }}>
        <T w="bold" size={24} style={{ lineHeight: 36 }}>{t('طلباتي')}</T>
        <Btn kind="small" icon="add" title={t('طلب جديد')} onPress={() => router.push('/customer/new')} />
      </Row>
      <Seg options={[{ v: 'active', label: openGroups.length + live.length ? t('شغّالة ({0})', ar(openGroups.length + live.length)) : t('شغّالة') }, { v: 'done', label: t('خلصت') }]} value={tab} onPick={(v) => setTab(v as Tab)} />

      {loading && !data ? <Loading /> : tab === 'active' ? (
        groupsSorted.length || live.length ? (
          <View style={{ gap: 10 }}>
            {groupsSorted.filter((g) => offersOf(g) > 0).map((g) => {
              const open = g.items.filter((r) => r.status === 'open'); const n = offersOf(g);
              return card(g.key, partsLabel(open), t('طلب {0} · {1}', reqNo(g.first.num), carLabel(g.first.car_make, g.first.car_model)), n > 1 ? t('{0} عروض', ar(n)) : t('عرض'), blue, t('من {0}', elapsed(g.first.created_at, now)), t('قارن العروض'), () => router.push(`/customer/${g.first.id}`));
            })}
            {live.map((o) => {
              const ps = partsOf(o); const pay = needsPayment(o); const ready = bucketOf(o) === 'ready';
              return card(o.id, ps.length ? partsLabel(ps) : t('أوردر'), t('أوردر {0} · {1} ج.م', orderNo(o.order_no), money(Number(o.items_total) + Number(o.delivery_fee))),
                pay ? t('ادفع') : ORDER_LABEL[o.status].short, pay ? orange : ready ? green : orange, t('من {0}', elapsed(o.created_at, now)), pay ? t('ادفع دلوقتي') : t('تابع الأوردر'),
                () => router.push({ pathname: '/order/[id]', params: { id: o.id } }));
            })}
            {groupsSorted.filter((g) => !offersOf(g)).map((g) => {
              const open = g.items.filter((r) => r.status === 'open');
              return card(g.key, partsLabel(open), t('طلب {0} · {1}', reqNo(g.first.num), carLabel(g.first.car_make, g.first.car_model)), t('بندوّر'), grey, t('من {0}', elapsed(g.first.created_at, now)), '', () => router.push(`/customer/${g.first.id}`));
            })}
          </View>
        ) : <Empty icon="pricetags-outline" text={t('مفيش طلبات شغّالة دلوقتي.')} action={{ label: t('اطلب قطعة'), onPress: () => router.push('/customer/new') }} />
      ) : finished.length || expired.length ? (
        <View style={{ gap: 10 }}>
          {finished.map((o) => {
            const ps = partsOf(o);
            return card(o.id, ps.length ? partsLabel(ps) : t('أوردر'), t('أوردر {0} · {1} ج.م', orderNo(o.order_no), money(Number(o.items_total) + Number(o.delivery_fee))),
              ORDER_LABEL[o.status].short, o.status === 'cancelled' ? red : grey,
              new Date(o.created_at).toLocaleDateString('ar-EG', { day: 'numeric', month: 'short' }), o.status === 'received' && !o.rating ? t('قيّم المحل') : '',
              () => router.push({ pathname: '/order/[id]', params: { id: o.id } }));
          })}
          {expired.map((g) => card(g.key, partsLabel(g.items), t('طلب {0}', reqNo(g.first.num)), t('انتهى'), grey, t('من غير أوردر'), t('اطلب تاني'),
            () => router.push({ pathname: '/customer/new', params: { part: g.first.part, cond: g.first.wanted_condition } })))}
        </View>
      ) : <Empty icon="time-outline" text={t('لسه مفيش أوردرات خلصت.')} />}
    </Screen>
  );
}

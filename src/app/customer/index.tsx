import { Redirect, router } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';
import { BottomNav, rememberRole } from '@/components/AppHeader';
import { Bell } from '@/components/Bell';
import { Icon, Loading, Muted, Pill, Press, Row, Screen, Section, T } from '@/components/ui';
import { OrderRow, RowList } from '@/components/OrderRows';
import { AdBanner } from '@/components/AdBanner';
import { useAuth } from '@/lib/auth';
import { ar, groupRequests, partsLabel, reqNo, type Order, type Quote, type Request } from '@/lib/data';
import { must, useLive } from '@/lib/live';
import { needsPayment } from '@/lib/payments';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';

const CATEGORIES: { label: string; part: string; icon: string }[] = [
  { label: 'فوانيس', part: 'فانوس أمامي', icon: 'car-light-high' },
  { label: 'مرايات', part: 'مراية جانبية', icon: 'mirror' },
  { label: 'رديتر', part: 'رديتر مياه', icon: 'radiator' },
  { label: 'تكييف', part: 'كمبروسر تكييف', icon: 'air-conditioner' },
  { label: 'فرامل', part: 'تيل فرامل', icon: 'car-brake-alert' },
  { label: 'دبرياج', part: 'طقم دبرياج', icon: 'car-clutch' },
  { label: 'كهرباء', part: 'دينامو', icon: 'car-battery' },
  { label: 'صاج', part: 'رفرف', icon: 'car-door' },
];

export default function CustomerHome() {
  const { ready, session, profile } = useAuth();
  const uid = session?.user.id;
  useEffect(() => { rememberRole('customer'); }, []);
  const { data } = useLive(async () => {
    if (!uid) return { reqs: [] as Request[], quotes: [] as Pick<Quote, 'id' | 'request_id'>[], orders: [] as Order[] };
    const reqs = must(await supabase.from('requests').select('*').eq('customer_id', uid).in('status', ['open', 'chosen']).order('created_at', { ascending: false }).limit(30)) as Request[];
    const ids = reqs.filter((r) => r.status === 'open').map((r) => r.id);
    const quotes = ids.length ? (must(await supabase.from('quotes').select('id, request_id').in('request_id', ids)) as Pick<Quote, 'id' | 'request_id'>[]) : [];
    const orders = must(await supabase.from('orders').select('*').eq('customer_id', uid).in('status', ['preparing', 'ready', 'out_for_delivery', 'delivered']).order('created_at', { ascending: false }).limit(10)) as Order[];
    return { reqs, quotes, orders };
  }, ['requests', 'quotes', 'orders'], [uid], { pollMs: 20000 });

  if (ready && !session) return <Redirect href="/login" />;
  if (profile && (!profile.is_customer || !profile.street)) return <Redirect href="/profile" />;
  if (!profile) return <Screen><Loading /></Screen>;
  const first = (profile.full_name || '').split(' ')[0];
  const newReq = (part?: string) => router.push(part ? { pathname: '/customer/new', params: { part } } : '/customer/new');
  const groups = groupRequests((data?.reqs ?? []).filter((r) => r.status === 'open')).slice(0, 6);
  const orders = data?.orders ?? [];
  const offersIn = (g: (typeof groups)[number]) => (data?.quotes ?? []).filter((q) => g.items.some((r) => r.id === q.request_id && r.status === 'open')).length;
  const hot = groups.map((g) => ({ g, n: offersIn(g) })).filter((x) => x.n > 0);
  const waiting = groups.filter((g) => !offersIn(g));

  // the top band: greeting, the car, and one big search bar. Everything else waits below it.
  const hero = (
    <View style={{ backgroundColor: colors.surface, borderBottomWidth: 1, borderColor: colors.line }}>
      <View style={{ width: '100%', maxWidth: 560, alignSelf: 'center', paddingHorizontal: 18, paddingTop: 14, paddingBottom: 20, gap: 16 }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <View style={{ gap: 0, flex: 1 }}>
            <T size={14} color={colors.muted}>أهلاً يا {first}</T>
            <T w="bold" size={23} style={{ lineHeight: 34 }}>محتاج قطعة إيه؟</T>
          </View>
          <Bell />
        </Row>
        <Press onPress={() => router.push('/cars')} label="غيّر العربية"
          style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 8, height: 36, paddingHorizontal: 14, borderRadius: 18, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.ground }}>
          <Icon set="mci" name="car-side" size={18} color={colors.ink} />
          <T size={14} w="medium">{profile.car_make} {profile.car_model} {ar(profile.car_year ?? '')}</T>
          <Icon name="chevron-down" size={14} color={colors.muted} />
        </Press>
        <Press onPress={() => newReq()} label="اكتب اسم القطعة"
          style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1.5, borderColor: colors.ink, paddingStart: 16, paddingEnd: 8, height: 58,
            shadowColor: colors.shadow, shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } }}>
          <Icon name="search" size={21} color={colors.ink} stroke={2.2} />
          <T size={15.5} color={colors.faint} style={{ flex: 1 }} numberOfLines={1}>اكتب اسم القطعة، مثلاً فانوس أمامي</T>
          <View style={{ width: 42, height: 42, borderRadius: 12, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="camera" size={20} color={colors.primary} />
          </View>
        </Press>
        <Press onPress={() => router.push('/assistant')} label="اوصف القطعة للمساعد" role="link" style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 2 }}>
          <Icon name="sparkles" size={16} color={colors.primary} />
          <T size={14} w="medium" color={colors.primary}>مش عارف اسمها؟ اوصفها للمساعد</T>
        </Press>
      </View>
    </View>
  );

  const top1 = hot[0];
  const nothingYet = !groups.length && !orders.length;

  return (
    <Screen top={hero} nav={<BottomNav role="customer" />}>
      {/* ONE card for the thing that needs the customer most: offers to compare */}
      {top1 ? (
        <Press onPress={() => router.push(`/customer/${top1.g.first.id}`)} label="قارن العروض"
          style={{ flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: colors.ink, borderRadius: 16, padding: 16 }}>
          <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: '#1E3354', alignItems: 'center', justifyContent: 'center' }}>
            <T w="bold" size={19} color="#fff" style={{ lineHeight: 26 }}>{ar(top1.n)}</T>
          </View>
          <View style={{ flex: 1 }}>
            <T w="semibold" size={16} color="#fff">{top1.n > 1 ? `وصلك ${ar(top1.n)} عروض على طلبك` : 'وصلك عرض على طلبك'}</T>
            <T size={13} color="#B9C3D3" numberOfLines={1}>{partsLabel(top1.g.items.filter((r) => r.status === 'open'))}{hot.length > 1 ? ` · و${ar(hot.length - 1)} طلب تاني` : ''}</T>
          </View>
          <View style={{ height: 36, paddingHorizontal: 14, borderRadius: 10, backgroundColor: '#fff', justifyContent: 'center' }}>
            <T w="semibold" size={14}>قارن</T>
          </View>
        </Press>
      ) : null}

      <View style={{ gap: 14 }}>
        <T w="bold" size={17}>اختار من الأقسام</T>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 16 }}>
          {CATEGORIES.map((c) => (
            <Press key={c.label} onPress={() => router.push({ pathname: '/customer/new', params: { cat: c.label } })} label={c.label} style={{ width: '25%', alignItems: 'center', gap: 8 }}>
              <View style={{ width: 60, height: 60, borderRadius: 18, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' }}>
                <Icon set="mci" name={c.icon} size={27} color={colors.ink} />
              </View>
              <T size={13} w="medium">{c.label}</T>
            </Press>
          ))}
        </View>
      </View>

      {orders.length || waiting.length ? (
        <Section title="طلباتك الحالية" action={{ label: 'الكل', onPress: () => router.push('/customer/requests') }}>
          <RowList>
            {orders.slice(0, 3).map((o, i) => {
              const ps = (data?.reqs ?? []).filter((r) => r.order_id === o.id);
              return <OrderRow key={o.id} o={o} first={i === 0} title={ps.length ? partsLabel(ps) : 'أوردر'}
                flag={needsPayment(o) ? { label: 'ادفع', tone: 'wait' } : undefined}
                onPress={() => router.push({ pathname: '/order/[id]', params: { id: o.id } })} />;
            })}
            {waiting.slice(0, Math.max(0, 3 - Math.min(orders.length, 3))).map((g, i) => (
              <Press key={g.key} onPress={() => router.push(`/customer/${g.first.id}`)} label={partsLabel(g.items)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 14, borderTopWidth: i || orders.length ? 1 : 0, borderColor: '#EEF0F3' }}>
                <View style={{ flex: 1 }}>
                  <T w="semibold" size={15} numberOfLines={1}>{partsLabel(g.items)}</T>
                  <Muted size={13}>طلب {reqNo(g.first.num)}</Muted>
                </View>
                <Pill label="بندوّر على عروض" tone="plain" />
              </Press>
            ))}
          </RowList>
        </Section>
      ) : null}

      <AdBanner />

      {/* first visit only: three quiet steps instead of an empty screen */}
      {nothingYet ? (
        <Section title="إزاي بيشتغل">
          <View style={{ gap: 12 }}>
            {[
              ['camera-outline', 'اكتب اسم القطعة أو صوّرها'],
              ['pricetags-outline', 'المحلات تبعتلك أسعارها'],
              ['bicycle-outline', 'اختار العرض اللي يناسبك'],
            ].map(([icon, text], i) => (
              <Row key={text} gap={12}>
                <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}><T w="bold" size={14} color={colors.primary}>{ar(i + 1)}</T></View>
                <T size={15}>{text}</T>
              </Row>
            ))}
          </View>
        </Section>
      ) : null}
    </Screen>
  );
}

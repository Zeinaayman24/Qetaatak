import { Redirect, router } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';
import { BottomNav, Logo, rememberRole } from '@/components/AppHeader';
import { Bell } from '@/components/Bell';
import { Icon, Loading, Muted, Plate, Press, Row, Screen, Section, T } from '@/components/ui';
import { InstallCard } from '@/components/InstallCard';
import { OrderRow, RowList } from '@/components/OrderRows';
import { AdBanner } from '@/components/AdBanner';
import { useAuth } from '@/lib/auth';
import { ar, groupRequests, partsLabel, reqNo, type Order, type Quote, type Request } from '@/lib/data';
import { must, useLive } from '@/lib/live';
import { needsPayment } from '@/lib/payments';
import { supabase } from '@/lib/supabase';
import { colors, lift } from '@/lib/theme';

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
  }, ['requests', 'quotes', 'orders'], [uid]);

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

  const hero = (
    <View style={{ backgroundColor: colors.ink, borderBottomLeftRadius: 28, borderBottomRightRadius: 28, paddingBottom: 64 }}>
      <View style={{ width: '100%', maxWidth: 560, alignSelf: 'center', paddingHorizontal: 18, paddingTop: 12, gap: 18 }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Logo size={24} on="dark" />
          <Bell light />
        </Row>
        <View style={{ gap: 2 }}>
          <T size={15} w="medium" color="rgba(255,255,255,.72)">أهلاً يا {first} 👋</T>
          <T w="bold" size={28} color="#fff" style={{ lineHeight: 40, letterSpacing: -0.4 }}>محتاج قطعة إيه النهارده؟</T>
        </View>
        <Press onPress={() => newReq()} label="اكتب اسم القطعة"
          style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.surface, borderRadius: 16, paddingStart: 16, paddingEnd: 6, height: 56 }}>
          <Icon name="search" size={21} color={colors.faint} />
          <T size={15} color={colors.faint} style={{ flex: 1 }} numberOfLines={1}>فانوس، رديتر، مراية…</T>
          <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="camera" size={21} color="#fff" />
          </View>
        </Press>
      </View>
    </View>
  );

  return (
    <Screen top={hero} nav={<BottomNav role="customer" />}>
      {/* offers waiting: the first thing the customer sees */}
      {hot.length ? (
        <View style={{ marginTop: -60, gap: 8 }}>
          {hot.slice(0, 3).map(({ g, n }) => (
            <Press key={g.key} onPress={() => router.push(`/customer/${g.first.id}`)} label="شوف العروض"
              style={[lift, { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.lime, borderRadius: 18, padding: 14 }]}>
              <View style={{ width: 46, height: 46, borderRadius: 14, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' }}>
                <T w="bold" size={19} color={colors.lime} style={{ lineHeight: 26 }}>{ar(n)}</T>
              </View>
              <View style={{ flex: 1 }}>
                <T w="bold" size={16} color={colors.ink}>{n > 1 ? `${ar(n)} عروض وصلتك` : 'وصلك عرض'}</T>
                <T size={13} color={colors.ink} numberOfLines={1}>على {partsLabel(g.items.filter((r) => r.status === 'open'))}، اختار دلوقتي</T>
              </View>
              <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="chevron-back" size={18} color={colors.lime} />
              </View>
            </Press>
          ))}
        </View>
      ) : null}

      {/* car + categories card overlapping the hero */}
      <View style={[lift, { marginTop: hot.length ? 0 : -60, backgroundColor: colors.surface, borderRadius: 20, padding: 16, gap: 16 }]}>
        <Press onPress={() => router.push('/cars')} label="غيّر العربية" style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Plate top={profile.car_model || '—'} bottom={ar(profile.car_year ?? '')} size="sm" />
          <View style={{ flex: 1 }}>
            <T w="semibold" size={14}>{profile.car_make} {profile.car_model}</T>
            <Muted size={12}>الطلبات هتروح لمحلات {profile.car_make}</Muted>
          </View>
          <Row gap={2}><T size={12.5} w="semibold" color={colors.primary}>تغيير</T><Icon name="chevron-back" size={14} color={colors.primary} /></Row>
        </Press>
        <View style={{ height: 1, backgroundColor: colors.line }} />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 14 }}>
          {CATEGORIES.map((c) => (
            <Press key={c.label} onPress={() => newReq(c.part)} label={c.label} style={{ width: '25%', alignItems: 'center', gap: 6 }}>
              <View style={{ width: 58, height: 58, borderRadius: 16, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
                <Icon set="mci" name={c.icon} size={27} color={colors.primary} />
              </View>
              <T size={12.5} w="medium">{c.label}</T>
            </Press>
          ))}
        </View>
      </View>

      <AdBanner />

      {orders.length ? (
        <Section title="أوردراتك" action={{ label: 'الكل', onPress: () => router.push('/customer/requests') }}>
          <RowList>
            {orders.slice(0, 3).map((o, i) => {
              const ps = (data?.reqs ?? []).filter((r) => r.order_id === o.id);
              return <OrderRow key={o.id} o={o} first={i === 0} title={ps.length ? partsLabel(ps) : 'أوردر'}
                flag={needsPayment(o) ? { label: 'ادفع', tone: 'wait' } : undefined}
                onPress={() => router.push({ pathname: '/order/[id]', params: { id: o.id } })} />;
            })}
          </RowList>
        </Section>
      ) : null}

      {waiting.length ? (
        <Section title="مستنيين عروض" action={{ label: 'الكل', onPress: () => router.push({ pathname: '/customer/requests', params: { tab: 'quotes' } }) }}>
          <RowList>
            {waiting.map((g, i) => (
              <Press key={g.key} onPress={() => router.push(`/customer/${g.first.id}`)} label={partsLabel(g.items)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 13, borderTopWidth: i ? 1 : 0, borderColor: colors.line }}>
                <T w="bold" size={13.5} color={colors.muted}>{reqNo(g.first.num)}</T>
                <T w="bold" size={15} numberOfLines={1} style={{ flex: 1 }}>{partsLabel(g.items)}</T>
                <Row gap={3}><Icon name="time-outline" size={13} color={colors.muted} /><Muted size={12.5}>بندوّر</Muted></Row>
              </Press>
            ))}
          </RowList>
        </Section>
      ) : null}

      <Press onPress={() => router.push('/assistant')} style={{ backgroundColor: colors.ink, borderRadius: 20, padding: 18, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <View style={{ width: 50, height: 50, borderRadius: 14, backgroundColor: 'rgba(10,171,254,.16)', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="sparkles" size={24} color={colors.accent} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <T w="bold" size={16} color="#fff">مش عارف اسم القطعة؟</T>
          <T size={13} color="rgba(255,255,255,.7)">اوصفها للمساعد بكلامك وهو يكمّل الطلب</T>
        </View>
        <Icon name="chevron-back" size={18} color="rgba(255,255,255,.6)" />
      </Press>

      <InstallCard />

      <Section title="إزاي بيشتغل">
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {[
            ['camera-outline', 'صوّر أو اكتب القطعة'],
            ['pricetags-outline', 'المحلات تبعت أسعارها'],
            ['bicycle-outline', 'اختار ويوصلك لحد البيت'],
          ].map(([icon, text], i) => (
            <View key={text} style={[lift, { flex: 1, backgroundColor: colors.surface, borderRadius: 16, padding: 12, gap: 8 }]}>
              <Row style={{ justifyContent: 'space-between' }}>
                <View style={{ width: 38, height: 38, borderRadius: 11, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}><Icon name={icon} size={20} color={colors.primary} /></View>
                <T size={12} w="bold" color={colors.faint}>{ar(i + 1)}</T>
              </Row>
              <T size={13} w="medium" style={{ lineHeight: 20 }}>{text}</T>
            </View>
          ))}
        </View>
      </Section>
    </Screen>
  );
}

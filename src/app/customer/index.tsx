import { Redirect, router } from 'expo-router';
import { useEffect } from 'react';
import { ScrollView, View } from 'react-native';
import { BottomNav, Logo, rememberRole } from '@/components/AppHeader';
import { Bell } from '@/components/Bell';
import { Icon, Loading, Muted, Plate, Press, Row, Screen, Section, T } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { ORDER_LABEL, ar, groupRequests, orderNo, orderSteps, partsLabel, reqNo, type Order, type Quote, type Request } from '@/lib/data';
import { must, useLive } from '@/lib/live';
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
      {/* car + categories card overlapping the hero */}
      <View style={[lift, { marginTop: -60, backgroundColor: colors.surface, borderRadius: 20, padding: 16, gap: 16 }]}>
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

      {orders.length ? (
        <Section title="أوردراتك" action={{ label: 'الكل', onPress: () => router.push('/customer/requests') }}>
          {orders.slice(0, 3).map((o) => {
            const ps = (data?.reqs ?? []).filter((r) => r.order_id === o.id);
            const steps = orderSteps(o.delivery_mode); const at = steps.indexOf(o.status);
            return (
              <Press key={o.id} onPress={() => router.push({ pathname: '/order/[id]', params: { id: o.id } })}
                style={[lift, { backgroundColor: colors.surface, borderRadius: 16, padding: 14, gap: 12 }]}>
                <Row gap={12}>
                  <View style={{ width: 46, height: 46, borderRadius: 14, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name={ORDER_LABEL[o.status].icon} size={22} color={colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <T w="bold" size={15}>{ORDER_LABEL[o.status].title}</T>
                    <T size={12.5} color={colors.muted} numberOfLines={1}>{orderNo(o.order_no)} · {ps.length ? partsLabel(ps) : ''}</T>
                  </View>
                  <Icon name="chevron-back" size={18} color={colors.faint} />
                </Row>
                <Row gap={4}>{steps.map((st, i) => <View key={st} style={{ flex: 1, height: 5, borderRadius: 3, backgroundColor: i <= at ? colors.primary : colors.soft }} />)}</Row>
              </Press>
            );
          })}
        </Section>
      ) : null}

      {groups.length ? (
        <Section title="عروض الأسعار" action={{ label: 'الكل', onPress: () => router.push({ pathname: '/customer/requests', params: { tab: 'quotes' } }) }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingVertical: 6, paddingHorizontal: 2 }} style={{ marginHorizontal: -2 }}>
            {groups.map((g) => {
              const n = data!.quotes.filter((q) => g.items.some((r) => r.id === q.request_id)).length;
              return (
                <Press key={g.key} onPress={() => router.push(`/customer/${g.first.id}`)}
                  style={[lift, { width: 240, backgroundColor: colors.surface, borderRadius: 16, padding: 14, gap: 10, borderWidth: n ? 1.5 : 1, borderColor: n ? colors.primary : colors.line }]}>
                  <Row style={{ justifyContent: 'space-between' }}>
                    <Plate top="طلب" bottom={reqNo(g.first.num).replace('#', '')} size="sm" />
                    {g.items.length > 1 ? <View style={{ backgroundColor: colors.soft, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 }}><T size={11.5} w="semibold">{ar(g.items.length)} قطع</T></View> : null}
                  </Row>
                  <T w="bold" size={15} numberOfLines={1}>{partsLabel(g.items)}</T>
                  <Row gap={6}>
                    <Icon name={n ? 'pricetags' : 'time'} size={16} color={n ? colors.primary : colors.muted} />
                    <T size={12.5} w="semibold" color={n ? colors.primary : colors.muted}>{n ? `${ar(n)} عروض مستنياك` : 'بندوّر عند المحلات'}</T>
                  </Row>
                </Press>
              );
            })}
          </ScrollView>
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

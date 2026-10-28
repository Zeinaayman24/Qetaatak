import { Redirect, router } from 'expo-router';
import { useEffect } from 'react';
import { Pressable, View } from 'react-native';
import { BottomNav, Logo, rememberRole } from '@/components/AppHeader';
import { customerPill } from '@/components/status';
import { Icon, Loading, Muted, Photo, Row, Screen, T } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { ar, reqNo, type Quote, type Request } from '@/lib/data';
import { must, useLive } from '@/lib/live';
import { photoUrl, supabase } from '@/lib/supabase';
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
    if (!uid) return { reqs: [] as Request[], quotes: [] as Pick<Quote, 'id' | 'request_id'>[] };
    const reqs = must(await supabase.from('requests').select('*').eq('customer_id', uid).in('status', ['open', 'chosen']).order('created_at', { ascending: false }).limit(3)) as Request[];
    const ids = reqs.map((r) => r.id);
    const quotes = ids.length ? (must(await supabase.from('quotes').select('id, request_id').in('request_id', ids)) as Pick<Quote, 'id' | 'request_id'>[]) : [];
    return { reqs, quotes };
  }, ['requests', 'quotes'], [uid]);

  if (ready && !session) return <Redirect href="/login" />;
  if (profile && (!profile.is_customer || !profile.street)) return <Redirect href="/profile" />;
  if (!profile) return <Screen><Loading /></Screen>;
  const first = (profile.full_name || '').split(' ')[0];
  const newReq = (part?: string) => router.push(part ? { pathname: '/customer/new', params: { part } } : '/customer/new');

  return (
    <Screen nav={<BottomNav role="customer" />}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Logo size={22} />
        <Pressable onPress={() => router.push('/profile')} accessibilityRole="button"
          style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.card, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 }}>
          <Icon name="car-sport-outline" size={16} />
          <T size={13} w="medium">{profile.car_make} {profile.car_model} {ar(profile.car_year ?? '')}</T>
          <Icon name="chevron-down" size={12} color={colors.muted} />
        </Pressable>
      </Row>

      <View style={{ gap: 4 }}>
        <Muted size={15}>أهلاً يا {first} 👋</Muted>
        <T w="bold" size={30} style={{ lineHeight: 42 }}>عايز قطعة إيه{'\n'}النهارده؟</T>
      </View>

      <Row gap={12} style={{ alignItems: 'stretch' }}>
        <Pressable onPress={() => newReq()} accessibilityRole="button"
          style={({ pressed }) => [{ flex: 1, backgroundColor: colors.ink, borderRadius: 22, padding: 18, minHeight: 150, justifyContent: 'space-between' }, pressed && { opacity: 0.9 }]}>
          <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,.12)', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="camera" size={22} color="#fff" />
          </View>
          <View>
            <T w="bold" size={17} color="#fff">صوّر القطعة</T>
            <T size={12.5} color="rgba(255,255,255,.7)">والمحلات تبعتلك أسعار</T>
          </View>
        </Pressable>
        <Pressable onPress={() => newReq()} accessibilityRole="button"
          style={({ pressed }) => [{ flex: 1, backgroundColor: colors.card, borderRadius: 22, padding: 18, minHeight: 150, justifyContent: 'space-between' }, pressed && { opacity: 0.85 }]}>
          <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.ground, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="search" size={22} />
          </View>
          <View>
            <T w="bold" size={17}>اكتب اسمها</T>
            <Muted size={12.5}>لو عارف اسم القطعة</Muted>
          </View>
        </Pressable>
      </Row>

      {data?.reqs.length ? (
        <View style={{ gap: 10 }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <T w="bold" size={18}>طلباتك الشغالة</T>
            <Pressable onPress={() => router.push('/customer/requests')} hitSlop={8}><T size={13} color={colors.muted}>الكل</T></Pressable>
          </Row>
          {data.reqs.map((r) => {
            const n = data.quotes.filter((q) => q.request_id === r.id).length;
            return (
              <Pressable key={r.id} onPress={() => router.push(`/customer/${r.id}`)} accessibilityRole="button"
                style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: colors.line, borderRadius: 18, padding: 12 }, pressed && { opacity: 0.8 }]}>
                <Photo uri={photoUrl(r.photo_path)} size={56} />
                <View style={{ flex: 1, gap: 2 }}>
                  <T w="semibold" numberOfLines={1}>{r.part}</T>
                  <Muted size={12.5}>{reqNo(r.num)} · {r.status === 'chosen' ? 'اتأكد مع المحل' : n ? 'اختار عرض من ' + ar(n) : 'بندوّر عند المحلات'}</Muted>
                </View>
                {customerPill(r, n)}
              </Pressable>
            );
          })}
        </View>
      ) : null}

      <View style={{ gap: 12 }}>
        <T w="bold" size={18}>أشهر القطع</T>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 16 }}>
          {CATEGORIES.map((c) => (
            <Pressable key={c.label} onPress={() => newReq(c.part)} accessibilityRole="button" accessibilityLabel={c.label}
              style={({ pressed }) => [{ width: '25%', alignItems: 'center', gap: 6 }, pressed && { opacity: 0.6 }]}>
              <View style={{ width: 62, height: 62, borderRadius: 20, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' }}>
                <Icon set="mci" name={c.icon} size={28} />
              </View>
              <T size={12.5} w="medium">{c.label}</T>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={{ backgroundColor: colors.accentSoft, borderRadius: 20, padding: 16, gap: 12 }}>
        <T w="bold" size={16}>ليه قطعتك؟</T>
        {[
          ['flash-outline', 'أسعار من كذا محل في أقل من ساعة'],
          ['shield-checkmark-outline', 'محلات متراجعة وضمان على كل قطعة'],
          ['bicycle-outline', 'توصيل لحد البيت أو استلام من المحل'],
        ].map(([icon, text]) => (
          <Row key={text} gap={10}><Icon name={icon} size={20} /><T size={14} style={{ flex: 1 }}>{text}</T></Row>
        ))}
      </View>
    </Screen>
  );
}

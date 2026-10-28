import { Redirect, router } from 'expo-router';
import { Pressable, View } from 'react-native';
import { AppHeader } from '@/components/AppHeader';
import { customerPill } from '@/components/status';
import { Btn, Empty, ListRow, Loading, Muted, Photo, Row, Screen, Section, T } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { ago, ar, reqNo, type Quote, type Request } from '@/lib/data';
import { must, useLive } from '@/lib/live';
import { photoUrl, supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';

export default function CustomerHome() {
  const { ready, session, profile } = useAuth();
  const uid = session?.user.id;
  const { data, loading } = useLive(async () => {
    if (!uid) return { reqs: [] as Request[], quotes: [] as Pick<Quote, 'id' | 'request_id'>[] };
    const reqs = must(await supabase.from('requests').select('*').eq('customer_id', uid!).order('created_at', { ascending: false }).limit(100)) as Request[];
    const ids = reqs.map((r) => r.id);
    const quotes = ids.length ? (must(await supabase.from('quotes').select('id, request_id').in('request_id', ids)) as Pick<Quote, 'id' | 'request_id'>[]) : [];
    return { reqs, quotes };
  }, ['requests', 'quotes'], [uid]);

  if (ready && !session) return <Redirect href="/login" />;
  if (profile && (!profile.is_customer || !profile.street)) return <Redirect href="/profile" />;
  if (!profile) return <Screen header={<AppHeader role="customer" />}><Loading /></Screen>;

  const reqs = data?.reqs ?? [];
  const active = reqs.filter((r) => r.status === 'open' || r.status === 'chosen');
  const past = reqs.filter((r) => r.status === 'done' || r.status === 'cancelled');
  const row = (r: Request, i: number, arr: Request[]) => (
    <ListRow key={r.id} last={i === arr.length - 1} onPress={() => router.push(`/customer/${r.id}`)}
      leading={<Photo uri={photoUrl(r.photo_path)} size={48} />}
      title={r.part}
      subtitle={`${r.car_make} ${r.car_model} · ${reqNo(r.num)}`}
      meta={ago(r.created_at)}
      trailing={customerPill(r, data!.quotes.filter((q) => q.request_id === r.id).length)} />
  );

  return (
    <Screen header={<AppHeader role="customer" />}>
      <View style={{ gap: 2 }}>
        <Muted size={14}>أهلاً يا {profile.full_name}</Muted>
        <T w="bold" size={26} style={{ lineHeight: 36 }}>عايز قطعة إيه؟</T>
      </View>

      <Pressable onPress={() => router.push('/customer/new')} accessibilityRole="button"
        style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.card, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 16 }, pressed && { opacity: 0.8 }]}>
        <T size={18}>🔍</T>
        <T color={colors.faint} size={16} style={{ flex: 1 }}>فانوس، مراية، رديتر…</T>
        <View style={{ backgroundColor: colors.ink, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 6 }}><T color={colors.brandInk} w="semibold" size={13}>اطلب</T></View>
      </Pressable>

      <Row style={{ justifyContent: 'space-between' }}>
        <Muted size={14}>عربيتك: <T w="semibold" size={14}>{profile.car_make} {profile.car_model} {ar(profile.car_year ?? '')}</T></Muted>
        <Btn kind="link" title="تغيير" onPress={() => router.push('/profile')} />
      </Row>

      {loading && !data ? <Loading /> : reqs.length === 0 ? (
        <Empty icon="🧰" text={'لسه مفيش طلبات.\nاكتب اسم القطعة فوق وابعت أول طلب.'} />
      ) : (
        <>
          {active.length ? <Section title="طلبات شغالة">{active.map(row)}</Section> : null}
          {past.length ? <Section title="طلبات قديمة">{past.map(row)}</Section> : null}
        </>
      )}
    </Screen>
  );
}

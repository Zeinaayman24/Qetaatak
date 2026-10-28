import { Redirect, router } from 'expo-router';
import { View } from 'react-native';
import { AppHeader } from '@/components/AppHeader';
import { customerPill } from '@/components/status';
import { Btn, Card, Empty, Loading, Muted, Photo, Plate, Row, Screen, T } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { ago, ar, reqNo, type Quote, type Request } from '@/lib/data';
import { must, useLive } from '@/lib/live';
import { photoUrl, supabase } from '@/lib/supabase';

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
  if (profile && !profile.is_customer) return <Redirect href="/profile" />;
  if (!profile) return <Screen header={<AppHeader role="customer" />}><Loading /></Screen>;

  return (
    <Screen header={<AppHeader role="customer" />}>
      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <View style={{ flex: 1, gap: 2 }}>
            <Muted>أهلاً يا {profile.full_name}، عربيتك</Muted>
            <T w="bold">{profile.car_make} {profile.car_model} {ar(profile.car_year ?? '')}</T>
            <Btn kind="small" title="تعديل" onPress={() => router.push('/profile')} style={{ marginTop: 6 }} />
          </View>
          <Plate top={(profile.car_make || '').slice(0, 3)} bottom={ar(profile.car_year ?? '')} />
        </Row>
      </Card>
      <Btn title="+  اطلب قطعة" onPress={() => router.push('/customer/new')} />
      <T w="bold">طلباتك</T>
      {loading && !data ? <Loading /> : data && data.reqs.length ? (
        data.reqs.map((r) => (
          <Card key={r.id} onPress={() => router.push(`/customer/${r.id}`)}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Muted size={12}>{reqNo(r.num)} · {ago(r.created_at)}</Muted>
              {customerPill(r, data.quotes.filter((q) => q.request_id === r.id).length)}
            </Row>
            <Row>
              {r.photo_path ? <Photo uri={photoUrl(r.photo_path)} size={52} /> : null}
              <View style={{ flex: 1 }}>
                <T w="bold">{r.part}</T>
                <Muted>{r.car_make} {r.car_model} {ar(r.car_year)}</Muted>
              </View>
            </Row>
          </Card>
        ))
      ) : <Empty text={'لسه مفيش طلبات.\nاضغط «اطلب قطعة» وابعت أول طلب.'} />}
    </Screen>
  );
}

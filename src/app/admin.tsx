import { Redirect } from 'expo-router';
import { View } from 'react-native';
import { AppHeader } from '@/components/AppHeader';
import { customerPill } from '@/components/status';
import { Btn, Card, Empty, Loading, Muted, Pill, Row, Screen, Stat, T, toast } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { COMMISSION, ago, ar, friendlyError, money, reqNo, type Profile, type Quote, type Request, type Shop, type ShopPrivate } from '@/lib/data';
import { must, useLive } from '@/lib/live';
import { supabase } from '@/lib/supabase';

export default function Admin() {
  const { ready, session, profile } = useAuth();
  const { data, loading } = useLive(async () => {
    const [shops, priv, reqs, quotes, people] = await Promise.all([
      supabase.from('shops').select('*').order('created_at', { ascending: false }),
      supabase.from('shop_private').select('*'),
      supabase.from('requests').select('*').order('created_at', { ascending: false }).limit(200),
      supabase.from('quotes').select('*'),
      supabase.from('profiles').select('id, full_name, phone'),
    ]);
    return {
      shops: must(shops) as Shop[], priv: Object.fromEntries((must(priv) as ShopPrivate[]).map((p) => [p.id, p])),
      reqs: must(reqs) as Request[], quotes: must(quotes) as Quote[],
      people: Object.fromEntries((must(people) as Pick<Profile, 'id' | 'full_name' | 'phone'>[]).map((p) => [p.id, p])),
    };
  }, ['shops', 'requests', 'quotes'], [profile?.is_admin]);

  if (ready && !session) return <Redirect href="/login" />;
  if (profile && !profile.is_admin) return <Redirect href="/" />;
  if (loading && !data) return <Screen header={<AppHeader role="admin" />}><Loading /></Screen>;
  const d = data!;
  const sold = d.reqs.filter((r) => r.status === 'chosen' || r.status === 'done');
  const gmv = sold.reduce((s, r) => s + (d.quotes.find((q) => q.id === r.chosen_quote_id)?.price ?? 0), 0);
  const found = d.reqs.filter((r) => d.quotes.some((q) => q.request_id === r.id)).length;
  const pct = (a: number, b: number) => (b ? ar(Math.round((a / b) * 100)) + '٪' : '—');

  async function setStatus(id: string, status: Shop['status']) {
    const { error } = await supabase.from('shops').update({ status }).eq('id', id);
    toast(error ? friendlyError(error) : status === 'approved' ? 'المحل اتوافق عليه' : 'المحل اتوقف');
  }

  const order = { pending: 0, approved: 1, suspended: 2 } as const;
  return (
    <Screen header={<AppHeader role="admin" />}>
      <Row gap={8}><Stat value={ar(d.reqs.length)} label="طلبات" /><Stat value={ar(sold.length)} label="مبيعات" /><Stat value={money(gmv * COMMISSION)} label="عمولتك (ج.م)" /></Row>
      <Row gap={8}><Stat value={pct(found, d.reqs.length)} label="طلبات لقت عرض" /><Stat value={pct(sold.length, found)} label="نسبة الإغلاق" /><Stat value={money(gmv)} label="قيمة المبيعات (ج.م)" /></Row>

      <T w="bold">المحلات ({ar(d.shops.length)})</T>
      {d.shops.length ? [...d.shops].sort((a, b) => order[a.status] - order[b.status]).map((s) => {
        const p = d.priv[s.id];
        return (
          <Card key={s.id}>
            <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <View style={{ flex: 1 }}>
                <T w="bold">{p?.name ?? '—'}</T>
                <Muted>{s.area} · {p?.owner_name}</Muted>
                <Muted><T size={13} selectable style={{ writingDirection: 'ltr' }}>{p?.phone}</T></Muted>
                <Muted size={12}>{s.brands.join('، ')}</Muted>
              </View>
              <Pill label={s.status === 'approved' ? 'موافق عليه' : s.status === 'pending' ? 'مستني موافقة' : 'موقوف'} tone={s.status === 'approved' ? 'good' : s.status === 'pending' ? 'wait' : 'plain'} />
            </Row>
            {s.status === 'approved'
              ? <Btn kind="small" title="إيقاف المحل" onPress={() => setStatus(s.id, 'suspended')} />
              : <Btn kind="small" title="وافق على المحل" onPress={() => setStatus(s.id, 'approved')} />}
          </Card>
        );
      }) : <Empty text="لسه مفيش محلات مسجلة." />}

      <T w="bold">كل الطلبات</T>
      {d.reqs.length ? d.reqs.map((r) => {
        const qs = d.quotes.filter((q) => q.request_id === r.id);
        return (
          <Card key={r.id}>
            <Row style={{ justifyContent: 'space-between' }}><Muted size={12}>{reqNo(r.num)} · {ago(r.created_at)}</Muted>{customerPill(r, qs.length)}</Row>
            <T w="bold">{r.part}</T>
            <Muted>{r.car_make} {r.car_model} {ar(r.car_year)} · {d.people[r.customer_id]?.full_name} · {r.area}</Muted>
            {qs.length ? <Muted>{qs.map((q) => `${d.priv[q.shop_id]?.name ?? 'محل'}: ${money(q.price)} ج.م${q.id === r.chosen_quote_id ? ' ✓' : ''}`).join(' · ')}</Muted> : null}
          </Card>
        );
      }) : <Empty text="لسه مفيش طلبات." />}
    </Screen>
  );
}

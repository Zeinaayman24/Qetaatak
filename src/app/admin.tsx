import { Redirect } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { customerPill } from '@/components/status';
import { BackBar, Btn, Card, Empty, Field, Lines, ListRow, Loading, Muted, Pill, Row, Screen, Section, Stats, T, toast } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { COMMISSION, SHOP_TYPES, addressLine, ago, ar, friendlyError, money, reqNo, REPORT_CATEGORIES, type Profile, type Quote, type Report, type Request, type Shop, type ShopPrivate } from '@/lib/data';
import { must, useLive } from '@/lib/live';
import { supabase } from '@/lib/supabase';

export default function Admin() {
  const { ready, session, profile } = useAuth();
  const [openId, setOpenId] = useState<string | null>(null);
  const [replies, setReplies] = useState<Record<string, string>>({});
  const { data, loading, reload } = useLive(async () => {
    const [shops, priv, reqs, quotes, people, reports] = await Promise.all([
      supabase.from('shops').select('*').order('created_at', { ascending: false }),
      supabase.from('shop_private').select('*'),
      supabase.from('requests').select('*').order('created_at', { ascending: false }).limit(200),
      supabase.from('quotes').select('*'),
      supabase.from('profiles').select('id, full_name, phone, email'),
      supabase.from('reports').select('*').order('created_at', { ascending: false }).limit(100),
    ]);
    return {
      shops: must(shops) as Shop[], priv: Object.fromEntries((must(priv) as ShopPrivate[]).map((p) => [p.id, p])),
      reqs: must(reqs) as Request[], quotes: must(quotes) as Quote[],
      reports: must(reports) as Report[],
      people: Object.fromEntries((must(people) as Pick<Profile, 'id' | 'full_name' | 'phone' | 'email'>[]).map((p) => [p.id, p])),
    };
  }, ['shops', 'requests', 'quotes', 'reports'], [profile?.is_admin]);

  if (ready && !session) return <Redirect href="/login" />;
  if (profile && !profile.is_admin) return <Redirect href="/" />;
  if (loading && !data) return <Screen><Loading /></Screen>;
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
  const shops = [...d.shops].sort((a, b) => order[a.status] - order[b.status]);
  return (
    <Screen>
      <BackBar title="لوحة الإدارة" onBack={() => (router.canGoBack() ? router.back() : router.replace('/account'))} />
      <Stats items={[[ar(d.reqs.length), 'طلبات'], [ar(sold.length), 'مبيعات'], [money(gmv * COMMISSION), 'عمولتك (ج.م)']]} />
      <Stats items={[[pct(found, d.reqs.length), 'لقت عرض'], [pct(sold.length, found), 'نسبة الإغلاق'], [money(gmv), 'المبيعات (ج.م)']]} />

      <Section title={'المحلات (' + ar(d.shops.length) + ')'}>
        {shops.length ? shops.map((s, i) => {
          const p = d.priv[s.id];
          const owner = d.people[s.id];
          const open = openId === s.id;
          return (
            <View key={s.id}>
              <ListRow last={i === shops.length - 1 && !open} onPress={() => setOpenId(open ? null : s.id)}
                title={<Row gap={8}><T w="semibold">{p?.name ?? '—'}</T><Pill label={s.status === 'approved' ? 'شغال' : s.status === 'pending' ? 'مستني موافقة' : 'موقوف'} tone={s.status === 'approved' ? 'good' : s.status === 'pending' ? 'wait' : 'plain'} /></Row>}
                subtitle={`${s.area}، ${s.governorate}، ${SHOP_TYPES[s.shop_type] ?? ''}`}
                meta={open ? 'اضغط للإخفاء' : 'اضغط لعرض كل البيانات'} />
              {open ? (
                <Card style={{ marginBottom: 12 }}>
                  <Lines rows={[
                    ['صاحب المحل', p?.owner_name ?? '—'],
                    ['موبايل', p?.phone ?? '—'],
                    ...(p?.phone2 ? [['موبايل تاني', p.phone2] as [string, string]] : []),
                    ['الإيميل', owner?.email || '—'],
                    ['العنوان', addressLine({ street: p?.street, building: p?.building, area: s.area, governorate: s.governorate }) || '—'],
                    ...(p?.landmark ? [['علامة مميزة', p.landmark] as [string, string]] : []),
                    ['الرقم البريدي', p?.postal_code || '—'],
                    ['السجل التجاري', p?.commercial_register || '—'],
                    ['التوصيل', s.offers_delivery ? 'بيوصّل' : 'استلام من المحل بس'],
                    ['التخصص', s.specialties.join('، ') || '—'],
                    ['الماركات', s.brands.join('، ') || '—'],
                  ]} />
                  {s.status === 'approved'
                    ? <Btn kind="danger" title="إيقاف المحل" onPress={() => setStatus(s.id, 'suspended')} />
                    : <Btn kind="dark" title="وافق على المحل" onPress={() => setStatus(s.id, 'approved')} />}
                </Card>
              ) : null}
            </View>
          );
        }) : <Empty text="لسه مفيش محلات مسجلة." />}
      </Section>

      <Section title={'الشكاوى (' + ar(d.reports.filter((x) => x.status === 'open').length) + ' مفتوحة)'}>
        {d.reports.length ? d.reports.map((rp) => (
          <Card key={rp.id} style={{ marginTop: 10 }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <T w="semibold" size={14}>{REPORT_CATEGORIES[rp.category]}</T>
              <Pill label={rp.status === 'resolved' ? 'اتحلّت' : 'مفتوحة'} tone={rp.status === 'resolved' ? 'good' : 'wait'} />
            </Row>
            <T size={14}>{rp.body}</T>
            <Muted size={12}>{d.people[rp.reporter_id]?.full_name || d.priv[rp.reporter_id]?.name || ''}، {d.people[rp.reporter_id]?.email ?? ''}، {ago(rp.created_at)}</Muted>
            {rp.admin_reply ? <Muted size={13}>ردّك: {rp.admin_reply}</Muted> : null}
            {rp.status === 'open' ? (
              <>
                <Field value={replies[rp.id] ?? ''} onChangeText={(t) => setReplies((x) => ({ ...x, [rp.id]: t }))} placeholder="اكتب ردّك للعميل أو المحل" multiline />
                <Btn kind="dark" title="ابعت الرد واقفل الشكوى" onPress={async () => {
                  const { error } = await supabase.from('reports').update({ admin_reply: (replies[rp.id] ?? '').trim() || 'تم حل المشكلة.', status: 'resolved', resolved_at: new Date().toISOString() }).eq('id', rp.id);
                  toast(error ? friendlyError(error) : 'اتبعت الرد'); reload();
                }} />
              </>
            ) : null}
          </Card>
        )) : <Empty text="مفيش شكاوى." />}
      </Section>

      <Section title="كل الطلبات">
        {d.reqs.length ? d.reqs.map((r, i) => {
          const qs = d.quotes.filter((q) => q.request_id === r.id);
          return (
            <ListRow key={r.id} last={i === d.reqs.length - 1}
              title={r.part}
              subtitle={`${r.car_make} ${r.car_model}، ${d.people[r.customer_id]?.full_name ?? ''}، ${r.area}`}
              meta={qs.length ? qs.map((q) => `${d.priv[q.shop_id]?.name ?? 'محل'} ${money(q.price)}${q.id === r.chosen_quote_id ? ' ✓' : ''}`).join('، ') : `${reqNo(r.num)}، ${ago(r.created_at)}`}
              trailing={customerPill(r, qs.length)} />
          );
        }) : <Empty text="لسه مفيش طلبات." />}
      </Section>
      <View />
      <Muted center size={12}>الأرقام بتتحدث لوحدها أول ما حاجة تتغير.</Muted>
    </Screen>
  );
}

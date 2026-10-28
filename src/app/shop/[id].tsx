import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { shopState } from '@/components/status';
import { BackBar, Btn, Card, Chips, CopyBox, Empty, ErrorText, Field, Icon, Labeled, Lines, Loading, Muted, Notice, Photo, PhotoPicker, Pill, Press, Row, Screen, Seg, Sheet, T, toast } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { COMMISSION, CONDITIONS, ORDER_STEPS, SIDES, URGENCY, WANTED, WARRANTY_DAYS, addressLine, ago, ar, friendlyError, money, reqNo, type Profile, type Quote, type Request } from '@/lib/data';
import { must, useLive } from '@/lib/live';
import { pickPhoto, uploadPhoto } from '@/lib/photos';
import { photoUrl, supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';

export default function ShopRequest() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { ready, session, shop } = useAuth();
  const uid = session?.user.id;
  const [price, setPrice] = useState('');
  const [cond, setCond] = useState<string>('used_original');
  const [warranty, setWarranty] = useState(7);
  const [photo, setPhoto] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ask, setAsk] = useState(false);
  const [why, setWhy] = useState('');

  const { data, loading, reload } = useLive(async () => {
    const req = must(await supabase.from('requests').select('*').eq('id', id).maybeSingle()) as Request | null;
    type Sib = { r: Request; quoted: boolean; declined: boolean };
    if (!req || !uid) return { req, mine: undefined as Quote | undefined, declined: false, customer: null as Profile | null, sibs: [] as Sib[] };
    let sibs: Sib[] = [];
    if (req.batch_id) {
      const rs = must(await supabase.from('requests').select('*').eq('batch_id', req.batch_id).order('num')) as Request[];
      const ids = rs.map((x) => x.id);
      const qs = must(await supabase.from('quotes').select('request_id').eq('shop_id', uid).in('request_id', ids)) as { request_id: string }[];
      const ds = must(await supabase.from('declines').select('request_id').eq('shop_id', uid).in('request_id', ids)) as { request_id: string }[];
      sibs = rs.map((x) => ({ r: x, quoted: qs.some((q) => q.request_id === x.id), declined: ds.some((d) => d.request_id === x.id) }));
    }
    const mine = (must(await supabase.from('quotes').select('*').eq('request_id', id).eq('shop_id', uid).maybeSingle()) as Quote | null) ?? undefined;
    const dec = must(await supabase.from('declines').select('request_id').eq('request_id', id).eq('shop_id', uid)) as unknown[];
    let customer: Profile | null = null;
    if (mine && req.chosen_quote_id === mine.id) customer = must(await supabase.from('profiles').select('*').eq('id', req.customer_id).maybeSingle()) as Profile | null;
    return { req, mine, declined: dec.length > 0, customer, sibs };
  }, ['requests', 'quotes'], [id, uid]);

  if (ready && !session) return <Redirect href="/login" />;
  const header = undefined;
  const back = () => router.replace('/shop');
  if (loading && !data) return <Screen header={header}><Loading /></Screen>;
  const r = data?.req;
  if (!r) return <Screen header={header}><BackBar title="الطلب" onBack={back} /><Empty text="الطلب ده مش موجود." /></Screen>;
  const st = shopState(r, data!.mine, data!.declined);
  const mine = data!.mine;
  const p = parseInt(price.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))), 10) || 0;
  const approved = shop?.status === 'approved';
  const extras = [
    r.side ? 'الجهة: ' + SIDES[r.side] : '', r.urgency !== 'normal' ? URGENCY[r.urgency] : '',
    r.budget ? 'ميزانية العميل ' + money(r.budget) + ' ج.م' : '', r.vin ? 'شاسيه ' + r.vin : '',
  ].filter(Boolean);
  async function setOrder(status: string) {
    const { error } = await supabase.rpc('update_order_status', { p_request: r!.id, p_status: status });
    if (error) toast(friendlyError(error)); else { toast('اتبعت للعميل'); reload(); }
  }

  async function choosePhoto() {
    try { const uri = await pickPhoto(); if (uri) setPhoto(uri); } catch { toast('الصورة دي مش مدعومة. جرّب صورة تانية.'); }
  }

  async function send() {
    setErr(null);
    if (!p || p < 1) return setErr('اكتب السعر بالجنيه.');
    setBusy(true);
    try {
      const photo_path = photo ? await uploadPhoto(photo, uid!) : null;
      const { error } = await supabase.from('quotes').insert({ request_id: r!.id, shop_id: uid, price: p, condition: cond, warranty_days: warranty, photo_path });
      if (error) throw error;
      setPrice(''); setPhoto(null);
      const next = data!.sibs.find((x) => x.r.id !== r!.id && !x.quoted && !x.declined && x.r.status === 'open');
      if (next) { toast('العرض اتبعت · كمّل القطعة اللي بعدها'); router.replace(`/shop/${next.r.id}`); }
      else { toast('العرض اتبعت للعميل'); reload(); }
    } catch (x) { setErr(friendlyError(x)); }
    finally { setBusy(false); }
  }

  async function decline(reason: string) {
    const { error } = await supabase.from('declines').insert({ request_id: r!.id, shop_id: uid, reason });
    setAsk(false);
    if (error) return toast(friendlyError(error));
    const next = data!.sibs.find((x) => x.r.id !== r!.id && !x.quoted && !x.declined && x.r.status === 'open');
    if (next) { toast('اتسجّل · كمّل القطعة اللي بعدها'); router.replace(`/shop/${next.r.id}`); }
    else { toast('تمام، العميل هيعرف إنها مش متوفرة عندك'); reload(); }
  }

  const sum = mine ? (
    <Row gap={6} style={{ flexWrap: 'wrap' }}>
      <Pill label={money(mine.price) + ' ج.م'} /><Pill label={CONDITIONS[mine.condition]} /><Pill label={'ضمان ' + ar(mine.warranty_days) + ' يوم'} />
    </Row>
  ) : null;

  const canQuote = st === 'open' || st === 'declined';
  const footer = canQuote ? (
    <>
      <ErrorText text={err} />
      <Btn kind="accent" icon="paper-plane" title={p ? 'ابعت العرض · ' + money(p) + ' ج.م' : 'ابعت العرض'} onPress={send} loading={busy} disabled={!approved} />
      {st === 'open' ? <Btn kind="link" title="مش متوفرة عندي" onPress={() => setAsk(true)} style={{ alignSelf: 'center' }} /> : null}
    </>
  ) : undefined;

  let body;
  if (canQuote) {
    body = (
      <>
        {st === 'declined' ? <Notice>قلت إنها مش متوفرة. لو لقيتها، تقدر تبعت عرض.</Notice> : null}
        {!approved ? <Notice>محلك لسه تحت المراجعة، فمش هتقدر تبعت عروض دلوقتي.</Notice> : null}
        <Field big label={r.qty > 1 ? `سعر القطعة الواحدة (العميل طالب ${ar(r.qty)})` : "سعرك (جنيه)"} value={price} onChangeText={setPrice} keyboardType="number-pad" ltr placeholder="0"
          hint={p ? `عمولة قطعتك ٥٪ = ${money(p * COMMISSION)} ج.م · يفضلك ${money(p * (1 - COMMISSION))} ج.م` : 'عمولة ٥٪ بس لو العميل اشترى منك.'} />
        <Labeled label="حالة القطعة">
          <Chips options={Object.entries(CONDITIONS).map(([v, label]) => ({ v, label }))} selected={[cond]} onPick={setCond} />
        </Labeled>
        <Labeled label="الضمان">
          <Seg options={WARRANTY_DAYS.map((w) => ({ v: w, label: ar(w) + ' يوم' }))} value={warranty} onPick={setWarranty} />
        </Labeled>
        <PhotoPicker uri={photo} onPick={choosePhoto} hint="العروض اللي فيها صورة بتتباع أكتر" />
        <Muted size={12}>السعر اللي تبعته هو اللي العميل هيدفعه وقت الاستلام.</Muted>
      </>
    );
  } else if (st === 'quoted') {
    body = <Card><Pill label="بعت عرض" tone="wait" /><T w="bold" size={17}>العرض اتبعت للعميل</T>{sum}<Muted>هنبلغك أول ما العميل يختار.</Muted></Card>;
  } else if (st === 'sold' && mine) {
    body = (
      <Card style={{ backgroundColor: colors.goodSoft }}>
        <T w="bold" size={19}>العميل اختار عرضك 🎉</T>
        {sum}
        <Muted size={13}>القطعة دي بقت جزء من أوردر. جهّزه وحرّكه من صفحة الأوردر.</Muted>
        {r.order_id ? <Btn icon="cube" title="افتح الأوردر" onPress={() => router.push({ pathname: '/shop/order/[id]', params: { id: r.order_id! } })} /> : null}
      </Card>
    );
  } else if (st === 'lost') {
    body = <Card><T w="bold">العميل اختار عرض تاني المرة دي</T>{sum}<Muted>العروض اللي فيها صورة وضمان أطول بتكسب أكتر.</Muted></Card>;
  } else {
    body = <Card><T w="bold">الطلب ده اتقفل</T></Card>;
  }

  return (
    <Screen header={header} footer={footer}>
      <BackBar title={'طلب ' + reqNo((data!.sibs[0]?.r ?? r).num)} onBack={back} />
      {data!.sibs.length > 1 ? (
        <View style={{ gap: 8 }}>
          <Muted size={12.5}>العميل طالب {ar(data!.sibs.length)} قطع؛ سعّر اللي عندك منهم.</Muted>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, padding: 2 }}>
            {data!.sibs.map((x, i) => {
              const on = x.r.id === r.id;
              return (
                <Press key={x.r.id} onPress={() => router.replace(`/shop/${x.r.id}`)} selected={on}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: on ? colors.ink : colors.surface, borderWidth: 1.5, borderColor: on ? colors.ink : colors.line }}>
                  <Icon name={x.quoted ? 'checkmark-circle' : x.declined ? 'remove-circle' : 'ellipse-outline'} size={16} color={on ? colors.accent : x.quoted ? colors.good : colors.faint} />
                  <T size={13} w="medium" color={on ? '#fff' : colors.ink}>{ar(i + 1)}. {x.r.part}</T>
                </Press>
              );
            })}
          </ScrollView>
        </View>
      ) : null}
      <Row style={{ alignItems: 'flex-start' }} gap={14}>
        <Photo uri={photoUrl(r.photo_path)} size={64} />
        <View style={{ flex: 1 }}>
          <T w="bold" size={18}>{r.part}{r.qty > 1 ? ` × ${ar(r.qty)}` : ''}</T>
          <Muted>{r.car_make} {r.car_model} {ar(r.car_year)}</Muted>
          <Muted>عايزها {WANTED[r.wanted_condition]} · {r.area} · {ago(r.created_at)}</Muted>
        </View>
      </Row>
      {extras.length ? <Row gap={6} style={{ flexWrap: 'wrap' }}>{extras.map((e) => <Pill key={e} label={e} tone={e === URGENCY.urgent ? 'wait' : 'plain'} />)}</Row> : null}
      {r.notes ? <View style={{ backgroundColor: colors.surface, borderRadius: 16, padding: 12, borderWidth: 1, borderColor: colors.line }}><Muted size={12}>ملاحظة العميل</Muted><T size={14}>{r.notes}</T></View> : null}
      {approved && (st === 'open' || st === 'quoted' || st === 'declined' || st === 'sold') ? (
        <Btn kind="secondary" title="رسالة للعميل" onPress={() => router.push(`/chat/${r.id}/${uid}`)} />
      ) : null}
      {body}
      <Sheet open={ask} onClose={() => setAsk(false)} title="مش متوفرة؟ قول للعميل ليه">
        <View style={{ gap: 10 }}>
          {['مش متوفرة دلوقتي', 'متوفرة جديد بس', 'متوفرة مستعمل بس', 'مش بشتغل في الماركة دي'].map((x) => (
            <Btn key={x} kind="secondary" title={x} onPress={() => decline(x)} />
          ))}
          <Field value={why} onChangeText={setWhy} placeholder="سبب تاني (اختياري)" />
          <Btn title="ابعت" disabled={!why.trim()} onPress={() => decline(why.trim())} />
          <Muted size={12}>العميل بيشوف السبب بس، مش اسم محلك.</Muted>
        </View>
      </Sheet>
    </Screen>
  );
}

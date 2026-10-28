import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { shopState } from '@/components/status';
import { BackBar, Btn, Card, Chips, CopyBox, Empty, ErrorText, Field, Labeled, Lines, Loading, Muted, Notice, Photo, PhotoPicker, Pill, Row, Screen, Seg, T, toast } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { COMMISSION, CONDITIONS, WANTED, WARRANTY_DAYS, addressLine, ago, ar, friendlyError, money, reqNo, type Profile, type Quote, type Request } from '@/lib/data';
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

  const { data, loading, reload } = useLive(async () => {
    const req = must(await supabase.from('requests').select('*').eq('id', id).maybeSingle()) as Request | null;
    if (!req || !uid) return { req, mine: undefined as Quote | undefined, declined: false, customer: null as Profile | null };
    const mine = (must(await supabase.from('quotes').select('*').eq('request_id', id).eq('shop_id', uid).maybeSingle()) as Quote | null) ?? undefined;
    const dec = must(await supabase.from('declines').select('request_id').eq('request_id', id).eq('shop_id', uid)) as unknown[];
    let customer: Profile | null = null;
    if (mine && req.chosen_quote_id === mine.id) customer = must(await supabase.from('profiles').select('*').eq('id', req.customer_id).maybeSingle()) as Profile | null;
    return { req, mine, declined: dec.length > 0, customer };
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
      toast('العرض اتبعت للعميل');
      setPrice(''); setPhoto(null);
      reload();
    } catch (x) { setErr(friendlyError(x)); }
    finally { setBusy(false); }
  }

  async function decline() {
    const { error } = await supabase.from('declines').insert({ request_id: r!.id, shop_id: uid });
    if (error) toast(friendlyError(error)); else { toast('تمام، سجّلنا إنها مش متوفرة'); reload(); }
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
      <Btn title={p ? 'ابعت العرض · ' + money(p) + ' ج.م' : 'ابعت العرض'} onPress={send} loading={busy} disabled={!approved} />
      {st === 'open' ? <Btn kind="link" title="مش متوفر عندي" onPress={decline} style={{ alignSelf: 'center' }} /> : null}
    </>
  ) : undefined;

  let body;
  if (canQuote) {
    body = (
      <>
        {st === 'declined' ? <Notice>قلت إنها مش متوفرة. لو لقيتها، تقدر تبعت عرض.</Notice> : null}
        {!approved ? <Notice>محلك لسه تحت المراجعة، فمش هتقدر تبعت عروض دلوقتي.</Notice> : null}
        <Field big label="سعرك (جنيه)" value={price} onChangeText={setPrice} keyboardType="number-pad" ltr placeholder="0"
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
    const c = data!.customer;
    body = (
      <Card style={{ backgroundColor: colors.goodSoft }}>
        <T w="bold" size={19}>مبروك! العميل اختار عرضك 🎉</T>
        {sum}
        <T size={14}>{r.delivery_mode === 'pickup' ? 'العميل جاي ياخدها من المحل وهيقولك رقم الطلب ' + reqNo(r.num) + '.' : 'كلّم العميل واتفق على التوصيل. اكتب رقم الطلب ' + reqNo(r.num) + ' على الكيس.'}</T>
        {c ? (
          <View style={{ gap: 6 }}>
            <T w="semibold">{c.full_name}</T>
            <CopyBox text={c.phone} />
            {r.delivery_mode === 'delivery' ? (
              <Muted size={13}>العنوان: {addressLine(c)}{c.landmark ? ' (' + c.landmark + ')' : ''}{c.postal_code ? ' · ' + c.postal_code : ''}</Muted>
            ) : null}
          </View>
        ) : null}
        <Lines rows={[['سعر البيع', money(mine.price) + ' ج.م'], ['عمولة قطعتك ٥٪', money(mine.price * COMMISSION) + ' ج.م']]} total={['صافي ليك', money(mine.price * (1 - COMMISSION)) + ' ج.م']} />
        {r.status === 'done' ? <T size={13} color={colors.good} w="semibold">العميل أكد الاستلام{r.rating ? ' وقيّمك ' + ar(r.rating) + ' من ٥' : ''}.</T> : null}
      </Card>
    );
  } else if (st === 'lost') {
    body = <Card><T w="bold">العميل اختار عرض تاني المرة دي</T>{sum}<Muted>العروض اللي فيها صورة وضمان أطول بتكسب أكتر.</Muted></Card>;
  } else {
    body = <Card><T w="bold">الطلب ده اتقفل</T></Card>;
  }

  return (
    <Screen header={header} footer={footer}>
      <BackBar title={'طلب ' + reqNo(r.num)} onBack={back} />
      <Row style={{ alignItems: 'flex-start' }} gap={14}>
        <Photo uri={photoUrl(r.photo_path)} size={64} />
        <View style={{ flex: 1 }}>
          <T w="bold" size={18}>{r.part}</T>
          <Muted>{r.car_make} {r.car_model} {ar(r.car_year)}</Muted>
          <Muted>عايزها {WANTED[r.wanted_condition]} · {r.area} · {ago(r.created_at)}</Muted>
        </View>
      </Row>
      {r.notes ? <View style={{ backgroundColor: colors.card, borderRadius: 14, padding: 12 }}><Muted size={12}>ملاحظة العميل</Muted><T size={14}>{r.notes}</T></View> : null}
      {body}
    </Screen>
  );
}

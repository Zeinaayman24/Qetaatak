import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { shopState } from '@/components/status';
import { BackBar, Btn, Card, Chips, CopyBox, Empty, ErrorText, Field, Icon, Labeled, Lines, Loading, Muted, Notice, Photo, PhotoPicker, Pill, Press, Row, Screen, Seg, Sheet, T, toast } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { CONDITIONS, MAX_OFFERS, MAX_WARRANTY_DAYS, SIDES, WANTED, ago, ar, friendlyError, money, reqNo, type Profile, type Quote, type Request, warrantyLabel, elapsed, minutesSince } from '@/lib/data';
import { must, useLive, useNow } from '@/lib/live';
import { pickPhoto, uploadPhoto } from '@/lib/photos';
import { photoUrl, supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';

export default function ShopRequest() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { ready, session, shop } = useAuth();
  const uid = session?.user.id;
  const [price, setPrice] = useState('');
  const [cond, setCond] = useState<string>('used_original');
  const [hasWarranty, setHasWarranty] = useState(false);
  const [days, setDays] = useState('');
  const [brand, setBrand] = useState('');
  const [note, setNote] = useState('');
  const [adding, setAdding] = useState(false);
  const [deliverable, setDeliverable] = useState(true);
  const [partFee, setPartFee] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ask, setAsk] = useState(false);
  const [why, setWhy] = useState('');

  const { data, loading, reload } = useLive(async () => {
    const req = must(await supabase.from('requests').select('*').eq('id', id).maybeSingle()) as Request | null;
    type Sib = { r: Request; quoted: boolean; declined: boolean };
    if (!req || !uid) return { req, mine: undefined as Quote | undefined, offers: [] as Quote[], declined: false, customer: null as Profile | null, sibs: [] as Sib[] };
    let sibs: Sib[] = [];
    if (req.batch_id) {
      const rs = must(await supabase.from('requests').select('*').eq('batch_id', req.batch_id).order('num')) as Request[];
      const ids = rs.map((x) => x.id);
      const qs = must(await supabase.from('quotes').select('request_id').eq('shop_id', uid).in('request_id', ids)) as { request_id: string }[];
      const ds = must(await supabase.from('declines').select('request_id').eq('shop_id', uid).in('request_id', ids)) as { request_id: string }[];
      sibs = rs.map((x) => ({ r: x, quoted: qs.some((q) => q.request_id === x.id), declined: ds.some((d) => d.request_id === x.id) }));
    }
    const offers = must(await supabase.from('quotes').select('*').eq('request_id', id).eq('shop_id', uid).order('price')) as Quote[];
    const mine = offers.find((q) => q.id === req.chosen_quote_id) ?? offers[0];
    const dec = must(await supabase.from('declines').select('request_id').eq('request_id', id).eq('shop_id', uid)) as unknown[];
    let customer: Profile | null = null;
    if (mine && req.chosen_quote_id === mine.id) customer = must(await supabase.from('profiles').select('*').eq('id', req.customer_id).maybeSingle()) as Profile | null;
    return { req, mine, offers, declined: dec.length > 0, customer, sibs };
  }, ['requests', 'quotes'], [id, uid]);

  if (ready && !session) return <Redirect href="/login" />;
  const header = undefined;
  const back = () => router.replace('/shop');
  if (loading && !data) return <Screen header={header}><Loading /></Screen>;
  const r = data?.req;
  if (!r) return <Screen header={header}><BackBar title="الطلب" onBack={back} /><Empty text="الطلب ده مش موجود." /></Screen>;
  const st = shopState(r, data!.mine, data!.declined);
  const mine = data!.mine;
  const latin = (t: string) => t.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
  const p = parseInt(latin(price), 10) || 0;
  const wd = parseInt(latin(days), 10) || 0;
  const shopDelivers = !!shop?.offers_delivery;
  const pf = partFee.trim() ? parseFloat(latin(partFee)) : null;
  const offers = data!.offers;
  const approved = shop?.status === 'approved';
  const extras = [
    r.side ? 'الجهة: ' + SIDES[r.side] : '',
    r.budget ? 'ميزانية العميل ' + money(r.budget) + ' ج.م' : '', r.vin ? 'شاسيه ' + r.vin : '',
  ].filter(Boolean);

  async function choosePhoto() {
    try { const uri = await pickPhoto(); if (uri) setPhoto(uri); } catch { toast('الصورة دي مش مدعومة. جرّب صورة تانية.'); }
  }

  async function send() {
    setErr(null);
    if (!p || p < 1) return setErr('اكتب السعر بالجنيه.');
    if (hasWarranty && (wd < 1 || wd > MAX_WARRANTY_DAYS)) return setErr(`اكتب عدد أيام الضمان (من ١ لـ ${ar(MAX_WARRANTY_DAYS)} يوم).`);
    setBusy(true);
    try {
      const photo_path = photo ? await uploadPhoto(photo, uid!) : null;
      const { error } = await supabase.from('quotes').insert({
        request_id: r!.id, shop_id: uid, price: p, condition: cond, warranty_days: hasWarranty ? wd : 0, photo_path, brand: brand.trim(), note: note.trim(),
        can_deliver: shopDelivers && deliverable, delivery_fee: shopDelivers && deliverable && pf != null && !isNaN(pf) ? pf : null,
      });
      if (error) throw error;
      setPrice(''); setPhoto(null); setBrand(''); setNote(''); setPartFee(''); setAdding(false);
      const next = !offers.length ? data!.sibs.find((x) => x.r.id !== r!.id && !x.quoted && !x.declined && x.r.status === 'open') : undefined;
      if (next) { toast('العرض اتبعت، كمّل القطعة اللي بعدها'); router.replace(`/shop/${next.r.id}`); }
      else { toast('العرض اتبعت للعميل'); reload(); }
    } catch (x) { setErr(friendlyError(x)); }
    finally { setBusy(false); }
  }

  async function decline(reason: string) {
    const { error } = await supabase.from('declines').insert({ request_id: r!.id, shop_id: uid, reason });
    setAsk(false);
    if (error) return toast(friendlyError(error));
    const next = data!.sibs.find((x) => x.r.id !== r!.id && !x.quoted && !x.declined && x.r.status === 'open');
    if (next) { toast('اتسجّل، كمّل القطعة اللي بعدها'); router.replace(`/shop/${next.r.id}`); }
    else { toast('تمام، العميل هيعرف إنها مش متوفرة عندك'); reload(); }
  }

  async function removeOffer(q: Quote) {
    const { error } = await supabase.from('quotes').delete().eq('id', q.id);
    if (error) toast(friendlyError(error)); else { toast('العرض اتشال'); reload(); }
  }

  /** One of this shop's offers: brand, price, condition, warranty (and remove while the request is open). */
  const offerRow = (q: Quote, canRemove: boolean) => (
    <View key={q.id} style={{ gap: 6, paddingVertical: 10, borderTopWidth: 1, borderColor: colors.line }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <T w="bold" size={15}>{q.brand || 'بدون ماركة محددة'}</T>
        <T w="bold" size={16} color={colors.primary}>{money(q.price)} ج.م</T>
      </Row>
      <Row gap={6} style={{ flexWrap: 'wrap' }}>
        <Pill label={CONDITIONS[q.condition]} /><Pill label={warrantyLabel(q.warranty_days)} tone={q.warranty_days ? 'good' : 'plain'} />
        <Pill label={!q.can_deliver ? 'استلام من المحل بس' : q.delivery_fee != null ? `توصيل ${money(q.delivery_fee)} ج.م` : 'توصيل حسب المنطقة'} icon={q.can_deliver ? 'bicycle' : 'walk'} />
        {r.chosen_quote_id === q.id ? <Pill label="العميل اختاره" tone="good" icon="checkmark" /> : null}
      </Row>
      {q.note ? <Muted size={12.5}>{q.note}</Muted> : null}
      {canRemove ? <Btn kind="link" title="شيل العرض ده" onPress={() => removeOffer(q)} /> : null}
    </View>
  );
  const sum = offers.length ? <View>{offers.map((q) => offerRow(q, false))}</View> : null;

  const canQuote = st === 'open' || st === 'declined' || (st === 'quoted' && adding);
  const footer = canQuote ? (
    <>
      <ErrorText text={err} />
      <Btn icon="paper-plane" title={p ? 'ابعت العرض، ' + money(p) + ' ج.م' : 'ابعت العرض'} onPress={send} loading={busy} disabled={!approved} />
      {st === 'open' ? <Btn kind="link" title="مش متوفرة عندي" onPress={() => setAsk(true)} style={{ alignSelf: 'center' }} /> : null}
      {st === 'quoted' ? <Btn kind="link" title="إلغاء" onPress={() => setAdding(false)} style={{ alignSelf: 'center' }} /> : null}
    </>
  ) : undefined;

  let body;
  if (canQuote) {
    body = (
      <>
        {st === 'declined' ? <Notice>قلت إنها مش متوفرة. لو لقيتها، تقدر تبعت عرض.</Notice> : null}
        {!approved ? <Notice>محلك لسه تحت المراجعة، فمش هتقدر تبعت عروض دلوقتي.</Notice> : null}
        {offers.length ? <Card><T w="bold" size={15}>عروضك على القطعة دي ({ar(offers.length)})</T>{offers.map((q) => offerRow(q, true))}</Card> : null}
        <T w="bold" size={17}>{offers.length ? 'عرض جديد بماركة أو سعر تاني' : 'ابعت عرضك'}</T>
        <Field label="الماركة / النوع" value={brand} onChangeText={setBrand} placeholder="مثلاً: أصلي هيونداي، Bosch، Valeo، صيني" icon="pricetag"
          hint="لو عندك أكتر من ماركة، ابعت كل واحدة كعرض لوحدها بسعرها." />
        <Field big label={r.qty > 1 ? `سعر القطعة الواحدة (العميل طالب ${ar(r.qty)})` : "سعرك (جنيه)"} value={price} onChangeText={setPrice} keyboardType="number-pad" ltr placeholder="0" hint="ده السعر اللي العميل هيدفعه ليك كامل. ضغطة مجاناً للمحلات." />
        <Labeled label="حالة القطعة">
          <Chips options={Object.entries(CONDITIONS).map(([v, label]) => ({ v, label }))} selected={[cond]} onPick={setCond} />
        </Labeled>
        <Labeled label="فيه ضمان على القطعة؟">
          <Seg options={[{ v: 'no', label: 'لأ، من غير ضمان' }, { v: 'yes', label: 'أيوه، فيه ضمان' }]} value={hasWarranty ? 'yes' : 'no'} onPick={(v) => setHasWarranty(v === 'yes')} />
          {hasWarranty
            ? <Field label="مدة الضمان بالأيام (مطلوب)" value={days} onChangeText={setDays} keyboardType="number-pad" ltr placeholder="مثلاً 30" icon="shield-checkmark" />
            : <Muted size={12}>مش لازم تدي ضمان. العروض اللي عليها ضمان بتظهر بعلامة «بضمان» والعملاء بيختاروها أكتر.</Muted>}
        </Labeled>
        <Labeled label="التوصيل للقطعة دي">
          {shopDelivers ? (
            <>
              <Seg options={[{ v: 'yes', label: 'ينفع تتوصّل' }, { v: 'no', label: 'استلام من المحل بس' }]} value={deliverable ? 'yes' : 'no'} onPick={(v) => setDeliverable(v === 'yes')} />
              {deliverable ? (
                <Field value={partFee} onChangeText={setPartFee} keyboardType="number-pad" ltr icon="bicycle" placeholder="سعر توصيل خاص للقطعة دي (اختياري)"
                  hint={`لو سيبته فاضي: ${shop?.fee_area != null ? money(Number(shop.fee_area)) : '—'} ج.م لنفس المنطقة، ${shop?.fee_city != null ? money(Number(shop.fee_city)) : '—'} ج.م لنفس المحافظة${shop?.fee_far != null ? `، ${money(Number(shop.fee_far))} ج.م لبرّه` : ''}. اكتب سعر لو القطعة تقيلة أو كبيرة.`} />
              ) : <Muted size={12}>العميل هيشوف إن القطعة دي استلام من المحل بس.</Muted>}
            </>
          ) : <Muted size={12.5}>محلك مش بيوصّل، فالعميل هيستلم من المحل. تقدر تفعّل التوصيل وأسعاره من بيانات المحل.</Muted>}
        </Labeled>
        <Field label="ملاحظة للعميل (اختياري)" value={note} onChangeText={setNote} placeholder="مثلاً: فرز أول، متجربة على العربية" multiline />
        <PhotoPicker uri={photo} onPick={choosePhoto} hint="العروض اللي فيها صورة بتتباع أكتر" />
        <Muted size={12}>السعر اللي تبعته هو اللي العميل هيدفعه وقت الاستلام.</Muted>
      </>
    );
  } else if (st === 'quoted') {
    body = (
      <Card>
        <Pill label={offers.length > 1 ? `بعت ${ar(offers.length)} عروض` : 'بعت عرض'} tone="wait" />
        <T w="bold" size={17}>{offers.length > 1 ? 'عروضك اتبعتت للعميل' : 'العرض اتبعت للعميل'}</T>
        <View>{offers.map((q) => offerRow(q, true))}</View>
        <Muted>هنبلغك أول ما العميل يختار.</Muted>
        {offers.length < MAX_OFFERS ? <Btn kind="secondary" icon="add" title="ضيف عرض بماركة أو سعر تاني" onPress={() => setAdding(true)} /> : null}
      </Card>
    );
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
    body = <Card><T w="bold">العميل اختار عرض تاني المرة دي</T>{sum}<Muted>العروض اللي فيها صورة وماركة واضحة وضمان بتكسب أكتر.</Muted></Card>;
  } else {
    body = <Card><T w="bold">الطلب ده اتقفل</T></Card>;
  }

  return (
    <Screen header={header} footer={footer}>
      <BackBar title={'طلب ' + reqNo((data!.sibs[0]?.r ?? r).num)} onBack={back} />
      {r.status === 'open' && !data!.offers.length && !data!.declined ? <WaitTimer since={r.created_at} /> : null}
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
                  <T size={13} w="medium" color={on ? '#fff' : colors.ink}>{x.r.part}</T>
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
          <Muted>عايزها {WANTED[r.wanted_condition]}، {r.area}، {ago(r.created_at)}</Muted>
        </View>
      </Row>
      {extras.length ? <Row gap={6} style={{ flexWrap: 'wrap' }}>{extras.map((e) => <Pill key={e} label={e} tone="plain" />)}</Row> : null}
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

/** The customer has been waiting this long: a live stopwatch that turns red after 15 minutes. */
function WaitTimer({ since }: { since: string }) {
  const now = useNow(1000);
  const slow = minutesSince(since, now) >= 15;
  return (
    <Row gap={10} style={{ backgroundColor: slow ? colors.badSoft : colors.ink, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10 }}>
      <Icon name="time" size={20} color={slow ? colors.bad : colors.accent} />
      <View style={{ flex: 1 }}>
        <T w="bold" size={14} color={slow ? colors.bad : '#fff'}>العميل مستني ردّك من {elapsed(since, now)}</T>
        <T size={12} color={slow ? colors.bad : 'rgba(255,255,255,.7)'}>ابعت السعر أو قول مش متوفرة؛ سرعة ردّك بتظهر للعميل.</T>
      </View>
    </Row>
  );
}

import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { BackBar, Btn, Chips, Empty, ErrorText, Field, Icon, Labeled, Loading, Muted, Photo, Pill, Press, Row, Screen, T, toast } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { ago, ar, friendlyError, toLatin } from '@/lib/data';
import { t } from '@/lib/i18n';
import { must, useLive } from '@/lib/live';
import { serviceName, useInstallServices } from '@/lib/shops';
import { photoUrl, supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';
import { IR_STATUS, quotePrice, type InstallQuote, type InstallRequest } from '@/lib/install';

const EARLIEST = [t('النهارده'), t('بكرة'), t('خلال يومين'), t('خلال أسبوع')];

/** A customer's installation request, seen by a shop that installs: send (or update) a price. */
export default function ShopInstallRequest() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { ready, session, shop } = useAuth();
  const uid = session?.user.id;
  const services = useInstallServices(true);
  const [price, setPrice] = useState('');
  const [max, setMax] = useState('');
  const [inspect, setInspect] = useState(false);
  const [earliest, setEarliest] = useState(EARLIEST[0]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  const { data, loading } = useLive(async () => {
    const r = must(await supabase.from('install_requests').select('*').eq('id', id).maybeSingle()) as InstallRequest | null;
    const mine = uid ? (((await supabase.from('install_quotes').select('*').eq('request_id', id).eq('shop_id', uid)).data ?? [])[0] as InstallQuote | undefined) ?? null : null;
    const booking = uid ? ((await supabase.from('bookings').select('id, status').eq('request_id', id).eq('shop_id', uid).order('created_at', { ascending: false }).limit(1)).data ?? [])[0] ?? null : null;
    return { r, mine, booking };
  }, ['install_requests', 'install_quotes', 'bookings'], [id, uid]);

  useEffect(() => {
    const q = data?.mine;
    if (!q) return;
    setPrice(q.price != null ? String(Number(q.price)) : ''); setMax(q.price_max != null ? String(Number(q.price_max)) : '');
    setInspect(q.needs_inspection); setEarliest(q.earliest || EARLIEST[0]); setNote(q.note);
  }, [data?.mine?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (ready && !session) return <Redirect href="/login" />;
  const back = () => (router.canGoBack() ? router.back() : router.replace('/shop'));
  if (loading && !data) return <Screen><Loading /></Screen>;
  const r = data?.r;
  if (!r) return <Screen><BackBar title={t('طلب تركيب')} onBack={back} /><Empty text={t('الطلب ده مش متاح.')} /></Screen>;
  const svc = services.find((s) => s.id === r.service_id);
  const mine = data?.mine ?? null;
  const showForm = r.status === 'open' && (!mine || editing);

  async function send() {
    setErr(null);
    const p = price.trim() ? parseFloat(toLatin(price)) : null;
    const m = max.trim() ? parseFloat(toLatin(max)) : null;
    if (p == null && !inspect) return setErr(t('اكتب السعر، أو اختار «السعر بعد المعاينة».'));
    if ((p != null && (isNaN(p) || p < 0)) || (m != null && (isNaN(m) || m < 0))) return setErr(t('اكتب السعر أرقام بس.'));
    if (p != null && m != null && m < p) return setErr(t('السعر لحد لازم يكون أكبر من السعر من.'));
    setBusy(true);
    const { error } = await supabase.rpc('send_install_quote', { p_request: r!.id, p_price: p, p_price_max: m, p_needs_inspection: inspect, p_note: note.trim(), p_earliest: earliest });
    setBusy(false);
    if (error) return setErr(friendlyError(error));
    setEditing(false);
    toast(mine ? t('العرض اتعدّل.') : t('العرض اتبعت للعميل.'));
  }

  return (
    <Screen footer={showForm ? <><ErrorText text={err} /><Btn title={mine ? t('عدّل العرض') : t('ابعت السعر')} loading={busy} onPress={send} /></> : undefined}>
      <BackBar title={t('طلب تركيب #{0}', ar(r.num))} onBack={back} />
      {shop && !shop.installs ? <Muted>{t('محلك مش متسجّل إنه بيركّب.')}</Muted> : null}
      <View style={{ backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.line, padding: 16, gap: 8 }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <T w="bold" size={17} style={{ flex: 1 }}>{serviceName(svc) || t('تركيب')}</T>
          <Pill label={IR_STATUS[r.status].label} tone={IR_STATUS[r.status].tone} />
        </Row>
        <T size={14.5} w="semibold">{[r.car_make, r.car_model, r.car_year ? ar(r.car_year) : ''].filter(Boolean).join(' ')}</T>
        <Row gap={12} style={{ alignItems: 'flex-start' }}>
          {r.photo_path ? <Photo uri={photoUrl(r.photo_path)} size={64} /> : null}
          <View style={{ flex: 1 }}>
            <T size={14.5}>{t('القطعة مع العميل: {0}', r.part_desc)}</T>
            {r.notes ? <Muted size={13}>«{r.notes}»</Muted> : null}
          </View>
        </Row>
        <Muted size={12.5}>{[r.area, r.governorate, ago(r.created_at)].filter(Boolean).join(' · ')}</Muted>
        {r.target_shop ? <Pill label={t('العميل طالبك انت بالاسم')} tone="good" /> : null}
      </View>

      {data?.booking ? <Btn title={t('افتح الحجز')} icon="calendar-outline" onPress={() => router.push(`/shop/booking/${data.booking!.id}`)} /> : null}
      {r.status !== 'open' && !data?.booking ? <Muted center>{r.status === 'booked' ? t('العميل حجز مع محل تاني.') : t('الطلب ده اتقفل.')}</Muted> : null}

      {mine && !editing ? (
        <View style={{ backgroundColor: colors.primarySoft, borderRadius: 16, padding: 16, gap: 6 }}>
          <T w="bold" size={15}>{t('عرضك: {0}', quotePrice(mine))}</T>
          <Muted size={13}>{[mine.needs_inspection ? t('السعر النهائي بعد المعاينة') : '', mine.earliest ? t('أقرب معاد: {0}', mine.earliest) : '', mine.note].filter(Boolean).join(' · ')}</Muted>
          {r.status === 'open' ? <Btn kind="link" title={t('عدّل العرض')} onPress={() => setEditing(true)} /> : null}
        </View>
      ) : null}

      {showForm ? (
        <View style={{ gap: 14 }}>
          <Row style={{ alignItems: 'flex-start' }}>
            <View style={{ flex: 1 }}><Field big label={t('سعر التركيب (ج.م)')} value={price} onChangeText={setPrice} keyboardType="number-pad" ltr placeholder="0" /></View>
            <View style={{ flex: 1 }}><Field label={t('لحد (لو السعر مدى)')} value={max} onChangeText={setMax} keyboardType="number-pad" ltr /></View>
          </Row>
          <Press onPress={() => setInspect(!inspect)} selected={inspect} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Icon name={inspect ? 'checkbox' : 'square-outline'} size={22} color={inspect ? colors.primary : colors.muted} />
            <T size={14}>{t('السعر النهائي بعد ما أعاين العربية')}</T>
          </Press>
          <Labeled label={t('أقرب معاد عندك')}><Chips options={EARLIEST.map((e) => ({ v: e, label: e }))} selected={[earliest]} onPick={setEarliest} /></Labeled>
          <Field label={t('ملاحظة للعميل (اختياري)')} value={note} onChangeText={setNote} multiline placeholder={t('مثلاً: التركيب بياخد ساعة، والسعر شامل ضبط الزوايا')} />
          <Muted size={12.5}>{t('العميل بيختار المحل والمعاد. لو السعر اتغيّر بعد المعاينة، العميل لازم يوافق في التطبيق.')}</Muted>
        </View>
      ) : null}
    </Screen>
  );
}

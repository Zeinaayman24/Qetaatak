import { router } from 'expo-router';
import { useState } from 'react';
import { Linking, View } from 'react-native';
import { whenLabel } from './Appointment';
import { BackBar, Btn, Empty, Field, Icon, Loading, Muted, Photo, Pill, Press, Row, Screen, Sheet, Steps, T, toast } from './ui';
import { ar, friendlyError, money, toLatin } from '@/lib/data';
import { t } from '@/lib/i18n';
import { must, useLive } from '@/lib/live';
import { directionsUrl } from '@/lib/shops';
import { photoUrl, supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';

export type Booking = {
  id: string; num: number; request_id: string | null; shop_id: string; customer_id: string; appointment_at: string; price: number | null;
  status: 'pending' | 'confirmed' | 'in_progress' | 'ready' | 'done' | 'cancelled' | 'disputed';
  price_change: number | null; price_change_note: string; cancel_note: string; dispute_note: string; cancelled_by: string;
  rating: number | null; review: string; rated_at: string | null; done_at: string | null; created_at: string;
};
type People = {
  shop_name: string; shop_phone: string; shop_address: string; shop_lat: number | null; shop_lng: number | null;
  customer_name: string; customer_phone: string; service: string; car: string; part_desc: string; photo_path: string | null; notes: string;
};

export const BOOKING_STATUS: Record<Booking['status'], { label: string; tone: 'new' | 'good' | 'wait' | 'plain' | 'bad' }> = {
  pending: { label: t('مستني المحل يأكّد'), tone: 'wait' },
  confirmed: { label: t('المعاد متأكّد'), tone: 'new' },
  in_progress: { label: t('التركيب شغّال'), tone: 'new' },
  ready: { label: t('التركيب خلص'), tone: 'good' },
  done: { label: t('تمّ'), tone: 'good' },
  cancelled: { label: t('اتلغى'), tone: 'plain' },
  disputed: { label: t('فيه مشكلة · بنراجع'), tone: 'bad' },
};
const STEP = ['pending', 'confirmed', 'in_progress', 'ready', 'done'];
const priceText = (p: number | null) => (p == null ? t('بعد المعاينة') : t('{0} ج.م', money(p)));

/** An installation booking, seen by the customer or by the shop, with the actions each side can take. */
export function BookingView({ id, side }: { id: string; side: 'customer' | 'shop' }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [sheet, setSheet] = useState<'price' | 'cancel' | 'dispute' | 'rate' | null>(null);
  const [val, setVal] = useState('');
  const [note, setNote] = useState('');
  const [stars, setStars] = useState(0);

  const { data, loading, reload } = useLive(async () => {
    const b = must(await supabase.from('bookings').select('*').eq('id', id).maybeSingle()) as Booking | null;
    if (!b) return null;
    const p = ((await supabase.rpc('booking_people', { p_booking: id })).data as People[] | null)?.[0] ?? null;
    return { b, p };
  }, ['bookings'], [id], { pollMs: 30000 });

  const back = () => (router.canGoBack() ? router.back() : router.replace(side === 'shop' ? '/shop' : '/customer/requests'));
  if (loading && !data) return <Screen><Loading /></Screen>;
  if (!data) return <Screen><BackBar title={t('الحجز')} onBack={back} /><Empty text={t('الحجز ده مش موجود.')} /></Screen>;
  const { b, p } = data;
  const st = BOOKING_STATUS[b.status];
  const shop = side === 'shop';

  async function act(action: string, value: number | null = null, why = '') {
    setBusy(action);
    const { error } = await supabase.rpc('booking_action', { p_booking: b.id, p_action: action, p_value: value, p_note: why });
    setBusy(null);
    if (error) return toast(/reason needed/.test(error.message) ? t('اكتب السبب.') : /price change pending/.test(error.message) ? t('العميل لسه ماردّش على السعر الجديد.') : friendlyError(error));
    setSheet(null); setVal(''); setNote(''); reload();
  }
  async function rate() {
    if (!stars) return toast(t('اختار عدد النجوم.'));
    setBusy('rate');
    const { error } = await supabase.rpc('rate_booking', { p_booking: b.id, p_rating: stars, p_review: note.trim() });
    setBusy(null);
    if (error) return toast(friendlyError(error));
    setSheet(null); setNote(''); toast(t('شكرًا على تقييمك.')); reload();
  }

  const step = STEP.indexOf(b.status);
  return (
    <Screen>
      <BackBar title={t('حجز تركيب #{0}', ar(b.num))} onBack={back} />
      <View style={{ backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.line, padding: 16, gap: 10 }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <T w="bold" size={17} style={{ flex: 1 }}>{p?.service || t('تركيب')}</T>
          <Pill label={st.label} tone={st.tone} />
        </Row>
        <Row gap={8}><Icon name="calendar-outline" size={18} color={colors.muted} /><T size={15} w="semibold">{whenLabel(b.appointment_at)}</T></Row>
        <Row gap={8}><Icon name="cash-outline" size={18} color={colors.muted} /><T size={15}>{t('السعر: {0}', priceText(b.price))}</T></Row>
        {step >= 0 ? <Steps items={[t('حجز'), t('متأكّد'), t('شغّال'), t('خلص'), t('تمّ')]} current={step} /> : null}
        {b.status === 'cancelled' ? <Muted size={13}>{b.cancelled_by === 'shop' ? t('المحل لغى الحجز') : b.cancelled_by === 'customer' ? t('العميل لغى الحجز') : t('الحجز اتلغى')}{b.cancel_note ? `: «${b.cancel_note}»` : ''}</Muted> : null}
        {b.status === 'disputed' ? <Muted size={13}>{t('المشكلة: «{0}». فريق ضغطة هيتواصل مع الطرفين.', b.dispute_note)}</Muted> : null}
      </View>

      {b.price_change != null ? (
        <View style={{ backgroundColor: colors.warnSoft, borderRadius: 16, padding: 16, gap: 10 }}>
          <T w="bold" size={15}>{t('المحل طالب يغيّر السعر لـ {0} ج.م', money(b.price_change))}</T>
          <Muted size={13.5}>{t('السبب: «{0}»', b.price_change_note)}</Muted>
          {shop ? <Muted size={13}>{t('مستنيين رد العميل.')}</Muted> : (
            <Row gap={8}>
              <Btn title={t('موافق')} loading={busy === 'accept_price'} onPress={() => act('accept_price')} style={{ flex: 1 }} />
              <Btn kind="secondary" title={t('مش موافق')} loading={busy === 'reject_price'} onPress={() => act('reject_price')} style={{ flex: 1 }} />
            </Row>
          )}
        </View>
      ) : null}

      {/* who and where */}
      {p ? (
        <View style={{ backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.line, padding: 16, gap: 10 }}>
          {shop ? (<>
            <T w="semibold" size={15}>{p.customer_name}</T>
            <Muted size={13}>{p.car}</Muted>
            <Row gap={10} style={{ alignItems: 'flex-start' }}>
              {p.photo_path ? <Photo uri={photoUrl(p.photo_path)} size={56} /> : null}
              <View style={{ flex: 1 }}><T size={14}>{p.part_desc}</T>{p.notes ? <Muted size={13}>«{p.notes}»</Muted> : null}</View>
            </Row>
            {p.customer_phone && b.status !== 'cancelled' ? <Btn kind="secondary" icon="call-outline" title={t('اتصل بالعميل')} onPress={() => Linking.openURL(`tel:${p.customer_phone}`)} /> : null}
          </>) : (<>
            <Press onPress={() => router.push(`/shop-profile/${b.shop_id}`)} role="link" label={p.shop_name}><T w="semibold" size={15} color={colors.primary}>{p.shop_name}</T></Press>
            <Muted size={13}>{p.shop_address}</Muted>
            <Row gap={8}>
              {p.shop_phone ? <Btn kind="secondary" icon="call-outline" title={t('اتصل')} onPress={() => Linking.openURL(`tel:${p.shop_phone}`)} style={{ flex: 1 }} /> : null}
              {p.shop_lat != null && p.shop_lng != null ? <Btn kind="secondary" icon="navigate-outline" title={t('الاتجاهات')} onPress={() => Linking.openURL(directionsUrl(p.shop_lat!, p.shop_lng!))} style={{ flex: 1 }} /> : null}
            </Row>
            <Muted size={12.5}>{t('القطعة: {0} · {1}', p.part_desc, p.car)}</Muted>
          </>)}
        </View>
      ) : null}

      {/* actions */}
      {shop ? (
        <View style={{ gap: 8 }}>
          {b.status === 'pending' ? <Btn title={t('أكّد المعاد')} loading={busy === 'confirm'} onPress={() => act('confirm')} /> : null}
          {b.status === 'confirmed' ? <Btn title={t('العربية وصلت · ابدأ التركيب')} loading={busy === 'start'} onPress={() => act('start')} /> : null}
          {b.status === 'in_progress' ? <Btn title={t('التركيب خلص')} loading={busy === 'finish'} disabled={b.price_change != null} onPress={() => act('finish')} /> : null}
          {['pending', 'confirmed', 'in_progress'].includes(b.status) && b.price_change == null ? <Btn kind="secondary" title={t('السعر محتاج يتغيّر')} onPress={() => setSheet('price')} /> : null}
          {['pending', 'confirmed'].includes(b.status) ? <Btn kind="link" title={t('الغي الحجز')} onPress={() => setSheet('cancel')} /> : null}
          {b.status === 'ready' ? <Muted size={13} center>{t('مستنيين العميل يأكّد إن التركيب تمام.')}</Muted> : null}
          {b.rating ? <Muted size={13} center>{t('تقييم العميل: {0} ★', ar(b.rating))}{b.review ? ` · «${b.review}»` : ''}</Muted> : null}
        </View>
      ) : (
        <View style={{ gap: 8 }}>
          {b.status === 'ready' ? <Btn title={t('التركيب تمام')} loading={busy === 'confirm_done'} onPress={() => act('confirm_done')} /> : null}
          {['in_progress', 'ready'].includes(b.status) ? <Btn kind="secondary" title={t('فيه مشكلة في التركيب')} onPress={() => setSheet('dispute')} /> : null}
          {b.status === 'done' && !b.rated_at ? <Btn title={t('قيّم المحل')} icon="star-outline" onPress={() => setSheet('rate')} /> : null}
          {b.status === 'done' && b.rating ? <Muted size={13} center>{t('قيّمت المحل {0} ★', ar(b.rating))}</Muted> : null}
          {['pending', 'confirmed'].includes(b.status) ? <Btn kind="link" title={t('الغي الحجز')} onPress={() => setSheet('cancel')} /> : null}
        </View>
      )}

      <Sheet open={sheet === 'price'} onClose={() => setSheet(null)} title={t('سعر جديد')}>
        <View style={{ gap: 12 }}>
          <Field label={t('السعر الجديد (ج.م)')} value={val} onChangeText={setVal} keyboardType="number-pad" ltr />
          <Field label={t('السبب')} value={note} onChangeText={setNote} placeholder={t('مثلاً: محتاج جلبة زيادة')} />
          <Muted size={12.5}>{t('العميل لازم يوافق على السعر الجديد قبل ما تكمّل.')}</Muted>
          <Btn title={t('ابعت للعميل')} loading={busy === 'propose_price'} onPress={() => {
            const n = parseFloat(toLatin(val)); if (isNaN(n) || n < 0) return toast(t('اكتب السعر بالجنيه.'));
            if (!note.trim()) return toast(t('اكتب السبب.'));
            act('propose_price', n, note.trim());
          }} />
        </View>
      </Sheet>
      <Sheet open={sheet === 'cancel'} onClose={() => setSheet(null)} title={t('تلغي الحجز؟')}>
        <View style={{ gap: 12 }}>
          <Field label={shop ? t('السبب (هيوصل للعميل)') : t('السبب (اختياري)')} value={note} onChangeText={setNote} />
          {!shop ? <Muted size={12.5}>{t('طلب التركيب هيرجع مفتوح وتقدر تختار محل تاني.')}</Muted> : null}
          <Btn kind="danger" title={t('الغي الحجز')} loading={busy === 'cancel'} onPress={() => act('cancel', null, note.trim())} />
        </View>
      </Sheet>
      <Sheet open={sheet === 'dispute'} onClose={() => setSheet(null)} title={t('إيه المشكلة؟')}>
        <View style={{ gap: 12 }}>
          <Field value={note} onChangeText={setNote} multiline placeholder={t('اكتب اللي حصل بالتفصيل')} />
          <Muted size={12.5}>{t('فريق ضغطة هيراجع ويتواصل معاك ومع المحل.')}</Muted>
          <Btn kind="danger" title={t('ابعت المشكلة')} loading={busy === 'dispute'} onPress={() => { if (!note.trim()) return toast(t('اكتب المشكلة.')); act('dispute', null, note.trim()); }} />
        </View>
      </Sheet>
      <Sheet open={sheet === 'rate'} onClose={() => setSheet(null)} title={t('قيّم التركيب')}>
        <View style={{ gap: 12 }}>
          <Row gap={10} style={{ justifyContent: 'center' }}>
            {[1, 2, 3, 4, 5].map((n) => (
              <Press key={n} onPress={() => setStars(n)} label={t('{0} نجوم', ar(n))}><Icon name="star" size={34} color={stars >= n ? colors.accent : colors.line} /></Press>
            ))}
          </Row>
          <Field value={note} onChangeText={setNote} multiline placeholder={t('رأيك في المحل والتركيب (اختياري)')} />
          <Btn title={t('ابعت التقييم')} loading={busy === 'rate'} onPress={rate} />
        </View>
      </Sheet>
    </Screen>
  );
}

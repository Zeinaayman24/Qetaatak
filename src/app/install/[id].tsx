import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { AppointmentPicker, whenLabel } from '@/components/Appointment';
import { ConfirmSheet } from '@/components/Confirm';
import { BackBar, Btn, Empty, Icon, Loading, Muted, Photo, Pill, Press, Row, Screen, Section, Sheet, T, toast } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { ago, ar, friendlyError } from '@/lib/data';
import { t } from '@/lib/i18n';
import { must, useLive } from '@/lib/live';
import { kmLabel, serviceName, useInstallServices, type NearShop } from '@/lib/shops';
import { photoUrl, supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';
import { IR_STATUS, quotePrice, type InstallQuote, type InstallRequest } from '@/lib/install';

/** One installation request: its offers, then pick a shop and a time. */
export default function InstallRequestScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { ready, session } = useAuth();
  const services = useInstallServices(true);
  const [pick, setPick] = useState<InstallQuote | null>(null);
  const [at, setAt] = useState('');
  const [busy, setBusy] = useState(false);
  const [askCancel, setAskCancel] = useState(false);

  const { data, loading } = useLive(async () => {
    const r = must(await supabase.from('install_requests').select('*').eq('id', id).maybeSingle()) as InstallRequest | null;
    if (!r) return null;
    const quotes = must(await supabase.from('install_quotes').select('*').eq('request_id', id).order('created_at')) as InstallQuote[];
    const shops = quotes.length ? ((await supabase.rpc('shops_near', { p_lat: null, p_lng: null })).data as NearShop[] | null) ?? [] : [];
    const booking = r.status === 'booked'
      ? ((await supabase.from('bookings').select('id, appointment_at, status').eq('request_id', id).neq('status', 'cancelled').order('created_at', { ascending: false }).limit(1)).data ?? [])[0] ?? null
      : null;
    return { r, quotes, shops: Object.fromEntries(shops.map((s) => [s.id, s])) as Record<string, NearShop>, booking };
  }, ['install_requests', 'install_quotes', 'bookings'], [id], { pollMs: 20000 });

  if (ready && !session) return <Redirect href="/login" />;
  const back = () => (router.canGoBack() ? router.back() : router.replace('/customer/requests'));
  if (loading && !data) return <Screen><Loading /></Screen>;
  if (!data) return <Screen><BackBar title={t('طلب تركيب')} onBack={back} /><Empty text={t('الطلب ده مش موجود.')} /></Screen>;
  const { r, quotes, shops, booking } = data;
  const svc = services.find((s) => s.id === r.service_id);

  async function book() {
    if (!pick || !at) return toast(t('اختار المعاد.'));
    setBusy(true);
    const { data: bid, error } = await supabase.rpc('book_install', { p_quote: pick.id, p_at: at });
    setBusy(false);
    if (error) return toast(/bad appointment/.test(error.message) ? t('اختار معاد بعد نص ساعة على الأقل.') : friendlyError(error));
    setPick(null);
    toast(t('اتحجز. المحل هيأكّد المعاد.'));
    router.replace({ pathname: '/booking/[id]', params: { id: String(bid) } });
  }
  async function cancel() {
    const { error } = await supabase.rpc('cancel_install_request', { p_request: r.id });
    setAskCancel(false);
    if (error) toast(friendlyError(error)); else toast(t('الطلب اتلغى.'));
  }

  return (
    <Screen>
      <BackBar title={t('طلب تركيب #{0}', ar(r.num))} onBack={back} />
      <View style={{ backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.line, padding: 16, gap: 8 }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <T w="bold" size={17} style={{ flex: 1 }}>{serviceName(svc) || t('تركيب')}</T>
          <Pill label={IR_STATUS[r.status].label} tone={IR_STATUS[r.status].tone} />
        </Row>
        <Row gap={12}>
          {r.photo_path ? <Photo uri={photoUrl(r.photo_path)} size={56} /> : null}
          <View style={{ flex: 1 }}>
            <T size={14.5}>{r.part_desc}</T>
            <Muted size={13}>{[r.car_make, r.car_model, r.car_year ? ar(r.car_year) : ''].filter(Boolean).join(' ')}{' · '}{ago(r.created_at)}</Muted>
          </View>
        </Row>
        {r.notes ? <Muted size={13}>«{r.notes}»</Muted> : null}
      </View>

      {booking ? (
        <Btn title={t('الحجز: {0}', whenLabel(booking.appointment_at))} icon="calendar-outline" onPress={() => router.push({ pathname: '/booking/[id]', params: { id: booking.id } })} />
      ) : null}

      {r.status === 'open' ? (
        <Section title={quotes.length ? t('العروض ({0})', ar(quotes.length)) : t('العروض')}>
          {quotes.length ? quotes.map((q) => {
            const s = shops[q.shop_id];
            return (
              <View key={q.id} style={{ backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.line, padding: 14, gap: 10 }}>
                <Row gap={12} style={{ alignItems: 'flex-start' }}>
                  <Press onPress={() => router.push(`/shop-profile/${q.shop_id}`)} role="link" label={s?.name ?? t('المحل')} style={{ flex: 1, gap: 2 }}>
                    <T w="semibold" size={15.5} numberOfLines={1}>{s?.name ?? t('محل موثّق')}</T>
                    <Muted size={12.5}>{[s?.area, s?.rating ? `★ ${ar(s.rating)}` : '', kmLabel(s?.km)].filter(Boolean).join(' · ')}</Muted>
                  </Press>
                  <T w="bold" size={17}>{quotePrice(q)}</T>
                </Row>
                <Row gap={6} style={{ flexWrap: 'wrap' }}>
                  {q.needs_inspection ? <Pill label={t('السعر النهائي بعد المعاينة')} tone="wait" /> : null}
                  {q.earliest ? <Pill label={t('أقرب معاد: {0}', q.earliest)} icon="time-outline" /> : null}
                </Row>
                {q.note ? <Muted size={13}>«{q.note}»</Muted> : null}
                <Btn title={t('احجز مع المحل ده')} onPress={() => { setPick(q); setAt(''); }} />
              </View>
            );
          }) : (
            <View style={{ alignItems: 'center', gap: 8, paddingVertical: 24 }}>
              <Icon name="hourglass-outline" size={28} color={colors.primary} />
              <Muted center>{r.target_shop ? t('بعتنا الطلب للمحل. أول ما يبعت سعره هيوصلك إشعار.') : t('بعتنا الطلب لمحلات التركيب. أول ما يوصل عرض هيوصلك إشعار.')}</Muted>
            </View>
          )}
        </Section>
      ) : null}

      {r.status === 'open' ? <Btn kind="link" title={t('الغي الطلب')} onPress={() => setAskCancel(true)} /> : null}

      <Sheet open={!!pick} onClose={() => setPick(null)} title={t('اختار المعاد')}>
        {pick ? (
          <View style={{ gap: 12 }}>
            <Muted size={13.5}>{shops[pick.shop_id]?.name ?? t('المحل')}{' · '}{quotePrice(pick)}</Muted>
            <AppointmentPicker hours={shops[pick.shop_id]?.hours} value={at} onPick={setAt} />
            <Muted size={12.5}>{t('بتدفع للمحل بعد التركيب. لو المحل محتاج يغيّر السعر بعد المعاينة، لازم توافق الأول.')}</Muted>
            <Btn title={at ? t('احجز · {0}', whenLabel(at)) : t('اختار المعاد')} disabled={!at} loading={busy} onPress={book} />
          </View>
        ) : null}
      </Sheet>
      <ConfirmSheet open={askCancel} title={t('تلغي طلب التركيب؟')} body={t('المحلات مش هتقدر تبعت عروض تانية.')} yes={t('الغي الطلب')} danger
        onYes={cancel} onClose={() => setAskCancel(false)} />
    </Screen>
  );
}

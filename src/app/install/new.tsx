import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { BackBar, Btn, Chips, ErrorText, Field, Icon, Labeled, Loading, Muted, Notice, PhotoPicker, Press, Row, Screen, T, toast } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { carLabel } from '@/lib/catalogue';
import { friendlyError, type Car } from '@/lib/data';
import { t } from '@/lib/i18n';
import { must, useLive } from '@/lib/live';
import { pickPhoto, uploadPhoto } from '@/lib/photos';
import { serviceName, useInstallServices } from '@/lib/shops';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';

/** «معايا القطعة بالفعل»: the customer has the part and wants a shop to install it. Shops that install send prices. */
export default function NewInstall() {
  const { ready, session, profile } = useAuth();
  const params = useLocalSearchParams<{ shop?: string; service?: string; desc?: string }>();
  const services = useInstallServices();
  const uid = session?.user.id;
  const [service, setService] = useState<string>(params.service ?? '');
  const [carKey, setCarKey] = useState('main');
  const [desc, setDesc] = useState(params.desc ?? '');
  const [notes, setNotes] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const { data } = useLive(async () => {
    const cars = uid ? (must(await supabase.from('cars').select('*').eq('owner_id', uid).order('created_at')) as Car[]) : [];
    const target = params.shop ? ((await supabase.rpc('shops_near', { p_shop: params.shop })).data as { name: string; installs: boolean }[] | null)?.[0] ?? null : null;
    return { cars, target };
  }, ['cars'], [uid, params.shop]);

  if (ready && !session) return <Redirect href="/login" />;
  if (!profile) return <Screen><Loading /></Screen>;
  const cars = [
    { key: 'main', make: profile.car_make ?? '', model: profile.car_model ?? '', year: profile.car_year ?? 0, vin: profile.car_vin ?? '', powertrain: profile.car_powertrain ?? '' },
    ...(data?.cars ?? []).map((c) => ({ key: c.id, make: c.make, model: c.model, year: c.year, vin: c.vin, powertrain: c.powertrain ?? '' })),
  ].filter((c) => c.make);
  const car = cars.find((c) => c.key === carKey) ?? cars[0];
  const back = () => (router.canGoBack() ? router.back() : router.replace('/customer'));

  async function send() {
    setErr(null);
    if (!service) return setErr(t('اختار نوع التركيب.'));
    if (!car) return setErr(t('ضيف عربيتك الأول.'));
    if (desc.trim().length < 2) return setErr(t('اكتب القطعة اللي معاك.'));
    setBusy(true);
    try {
      const photo_path = photo ? await uploadPhoto(photo, uid!) : null;
      const { data: row, error } = await supabase.from('install_requests').insert({
        customer_id: uid, service_id: service, car_make: car.make, car_model: car.model, car_year: car.year || null, powertrain: car.powertrain, vin: car.vin ?? '',
        part_desc: desc.trim(), notes: notes.trim(), photo_path, governorate: profile!.governorate ?? '', area: profile!.area ?? '',
        target_shop: params.shop ?? null,
      }).select('id').single();
      if (error) throw error;
      toast(params.shop ? t('الطلب اتبعت للمحل.') : t('الطلب اتبعت لمحلات التركيب القريبة.'));
      router.replace({ pathname: '/install/[id]', params: { id: row.id } });
    } catch (e) { setErr(friendlyError(e)); }
    setBusy(false);
  }

  return (
    <Screen footer={<><ErrorText text={err} /><Btn title={t('ابعت طلب التركيب')} loading={busy} onPress={send} /></>}>
      <BackBar title={t('تركيب قطعة معاك')} onBack={back} />
      {data?.target ? <Notice>{t('الطلب هيروح لـ {0} بس.', data.target.name)}</Notice>
        : <Muted size={14}>{t('معاك القطعة؟ قولنا محتاج تركّب إيه، ومحلات التركيب في محافظتك هتبعتلك أسعارها. تختار المحل والمعاد.')}</Muted>}

      {!params.shop ? (
        <Press onPress={() => router.replace({ pathname: '/customer/new', params: { install: '1' } })} role="link"
          style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 14, backgroundColor: colors.primarySoft }}>
          <Icon name="cart-outline" size={20} color={colors.primary} />
          <View style={{ flex: 1 }}>
            <T w="semibold" size={14.5}>{t('مش معاك القطعة؟')}</T>
            <Muted size={12.5}>{t('اطلب القطعة والتركيب مع بعض من نفس المحل')}</Muted>
          </View>
          <Icon name="chevron-back" size={18} color={colors.primary} />
        </Press>
      ) : null}

      <Labeled label={t('محتاج تركّب إيه؟')}>
        <Chips options={services.map((s) => ({ v: s.id, label: serviceName(s) }))} selected={[service]} onPick={setService} />
      </Labeled>

      <Labeled label={t('العربية')}>
        {cars.length ? (
          <View style={{ gap: 8 }}>
            {cars.map((c) => (
              <Press key={c.key} onPress={() => setCarKey(c.key)} selected={c.key === car?.key}
                style={{ padding: 12, borderRadius: 14, borderWidth: c.key === car?.key ? 2 : 1, borderColor: c.key === car?.key ? colors.primary : colors.line, backgroundColor: colors.surface }}>
                <T w="semibold">{carLabel(c.make, c.model, c.year)}</T>
              </Press>
            ))}
          </View>
        ) : <Btn kind="secondary" title={t('ضيف عربيتك')} onPress={() => router.push('/cars')} />}
      </Labeled>

      <Field label={t('القطعة اللي معاك')} value={desc} onChangeText={setDesc} placeholder={t('مثلاً: طقم تيل فرامل أمامي جديد')} />
      <Labeled label={t('صورة القطعة (اختياري)')}>
        <PhotoPicker uri={photo} onPick={async () => { try { const u = await pickPhoto(); if (u) setPhoto(u); } catch { toast(t('الصورة دي مش مدعومة. اختار صورة JPG أو PNG.')); } }}
          hint={t('الصورة بتساعد المحل يحدّد السعر صح.')} />
      </Labeled>
      <Field label={t('ملاحظات (اختياري)')} value={notes} onChangeText={setNotes} multiline placeholder={t('مثلاً: فيه صوت في العفشة من قدّام')} />
      <Row gap={8}><Muted size={12.5}>{t('المحافظة: {0}', profile.governorate || '—')}</Muted></Row>
    </Screen>
  );
}

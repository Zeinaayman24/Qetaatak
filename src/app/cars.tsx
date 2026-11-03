import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { CarPicker, type PickedCar } from '@/components/CarPicker';
import { MakeLogo } from '@/components/MakeLogo';
import { BackBar, Btn, ErrorText, Field, Icon, Muted, Pill, Press, Row, Screen, Sheet, T, toast } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { carLabel, usePreloadModels, makeByName, ptShort, useMakes } from '@/lib/catalogue';
import { ar, friendlyError, type Car } from '@/lib/data';
import { must, useLive } from '@/lib/live';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';
import { t } from '@/lib/i18n';

type CarRow = { key: string; make: string; model: string; year: number; vin: string; powertrain: string; main: boolean };

/** The customer's cars: the main car (kept on the profile) plus any extra cars. */
export default function Cars() {
  const { ready, session, profile, refresh: refreshProfile } = useAuth();
  const uid = session?.user.id;
  const params = useLocalSearchParams<{ make?: string }>();
  const { makes } = useMakes();
  const [picking, setPicking] = useState(false);
  const [startMake, setStartMake] = useState<string | null>(null);
  const [picked, setPicked] = useState<PickedCar | null>(null);
  const [vin, setVin] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const { data, reload } = useLive(async () => {
    if (!uid) return [] as Car[];
    return must(await supabase.from('cars').select('*').eq('owner_id', uid).order('created_at')) as Car[];
  }, ['cars'], [uid]);
  usePreloadModels([profile?.car_make, ...((data ?? []).map((c) => c.make))]);

  // arriving from a make's logo on the home screen opens the picker on that make
  useEffect(() => {
    if (params.make) { setStartMake(String(params.make)); setPicking(true); }
  }, [params.make]);

  if (ready && !session) return <Redirect href="/login" />;

  const rows: CarRow[] = [
    ...(profile?.car_make ? [{ key: 'main', make: profile.car_make, model: profile.car_model ?? '', year: profile.car_year ?? 0, vin: profile.car_vin ?? '', powertrain: profile.car_powertrain ?? '', main: true }] : []),
    ...(data ?? []).map((c) => ({ key: c.id, make: c.make, model: c.model, year: c.year, vin: c.vin, powertrain: c.powertrain ?? '', main: false })),
  ];

  async function save() {
    if (!picked || !profile) return;
    setErr(null); setBusy(true);
    const v = vin.trim().toUpperCase();
    // the first car becomes the main one; later ones are extra cars
    const { error } = profile.car_make
      ? await supabase.from('cars').insert({ make: picked.make, model: picked.model, year: picked.year, vin: v, powertrain: picked.powertrain })
      : await supabase.from('profiles').update({ car_make: picked.make, car_model: picked.model, car_year: picked.year, car_vin: v, car_powertrain: picked.powertrain }).eq('id', profile.id);
    setBusy(false);
    if (error) return setErr(friendlyError(error));
    setPicked(null); setVin(''); reload(); await refreshProfile(); toast(t('العربية اتضافت'));
  }
  async function remove(id: string) {
    const { error } = await supabase.from('cars').delete().eq('id', id);
    if (error) toast(friendlyError(error)); else reload();
  }
  /** Swap an extra car with the main one: requests start from the main car. */
  async function makeMain(r: CarRow) {
    if (!profile || r.main) return;
    setBusy(true);
    const old = { make: profile.car_make ?? '', model: profile.car_model ?? '', year: profile.car_year ?? 0, vin: profile.car_vin ?? '', powertrain: profile.car_powertrain ?? '' };
    const a = await supabase.from('profiles').update({ car_make: r.make, car_model: r.model, car_year: r.year, car_vin: r.vin, car_powertrain: r.powertrain }).eq('id', profile.id);
    const b = a.error ? a : old.make
      ? await supabase.from('cars').update(old).eq('id', r.key)
      : await supabase.from('cars').delete().eq('id', r.key);
    setBusy(false);
    if (a.error || b.error) return toast(friendlyError(a.error ?? b.error));
    reload(); await refreshProfile(); toast(t('بقت عربيتك الأساسية'));
  }

  return (
    <Screen>
      <BackBar title={t('عربياتي')} onBack={() => (router.canGoBack() ? router.back() : router.replace('/account'))} />
      <Muted size={14}>{t('الطلب بيتبعت بالعربية الأساسية. تقدر تغيّرها وانت بتعمل الطلب.')}</Muted>

      {rows.length ? (
        <View style={{ backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.line, overflow: 'hidden' }}>
          {rows.map((r, i) => (
            <View key={r.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderTopWidth: i ? 1 : 0, borderColor: '#EEF0F3' }}>
              <MakeLogo make={makeByName(makes, r.make) ?? { name_ar: r.make, name_en: r.make, logo_url: '' }} size={48} />
              <View style={{ flex: 1, gap: 2 }}>
                <T w="semibold" size={15}>{carLabel(r.make, r.model, r.year)}</T>
                <Row gap={6} style={{ flexWrap: 'wrap' }}>
                  {r.main ? <Pill label={t('الأساسية')} tone="accent" /> : null}
                  {r.powertrain ? <Pill label={ptShort(r.powertrain)} tone={r.powertrain === 'petrol' || r.powertrain === 'diesel' ? 'plain' : 'good'} /> : null}
                  <Muted size={12.5}>{r.vin ? t('شاسيه: ') + r.vin : t('من غير رقم شاسيه')}</Muted>
                </Row>
                {!r.main ? (
                  <Press onPress={() => makeMain(r)} disabled={busy} label={t('خليها الأساسية')} style={{ alignSelf: 'flex-start', paddingVertical: 4 }}>
                    <T size={13.5} w="medium" color={colors.primary}>{t('خليها الأساسية')}</T>
                  </Press>
                ) : null}
              </View>
              {r.main ? (
                <Btn kind="link" title={t('عدّل')} onPress={() => router.push('/profile')} />
              ) : (
                <Pressable onPress={() => remove(r.key)} accessibilityLabel={t('امسح العربية')} hitSlop={8} style={{ padding: 6 }}><Icon name="trash-outline" size={20} color={colors.bad} /></Pressable>
              )}
            </View>
          ))}
        </View>
      ) : null}

      <Btn kind="secondary" icon="add" title={rows.length ? t('أضف عربية تانية') : t('أضف عربيتك')} onPress={() => { setStartMake(null); setPicking(true); }} />

      <CarPicker open={picking} startMake={startMake} onClose={() => { setPicking(false); if (params.make) router.setParams({ make: undefined }); }}
        onDone={(c) => { setPicking(false); setPicked(c); if (params.make) router.setParams({ make: undefined }); }} />

      <Sheet open={!!picked} onClose={() => setPicked(null)} title={t('أضف العربية')}>
        {picked ? (
          <View style={{ gap: 14 }}>
            <Row gap={12}>
              <MakeLogo make={makeByName(makes, picked.make)} size={48} />
              <View style={{ flex: 1 }}>
                <T w="semibold" size={16}>{carLabel(picked.make, picked.model, picked.year)}</T>
                {picked.powertrain ? <Muted size={13}>{ptShort(picked.powertrain)}</Muted> : null}
              </View>
            </Row>
            <Field label={t('رقم الشاسيه VIN (اختياري)')} value={vin} onChangeText={setVin} ltr placeholder={t('17 حرف ورقم')} hint={t('مكتوب في رخصة العربية. بيخلّي المحل يجيب القطعة الصح من أول مرة.')} />
            <ErrorText text={err} />
            <Btn title={t('أضف العربية')} onPress={save} loading={busy} />
          </View>
        ) : null}
      </Sheet>
    </Screen>
  );
}

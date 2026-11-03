import { Redirect, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { BackBar, Btn, ErrorText, Field, Loading, Muted, Press, Row, Screen, Section, Select, T, toast } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { CarPicker } from '@/components/CarPicker';
import { MakeLogo } from '@/components/MakeLogo';
import { makeByName, ptShort, useMakes } from '@/lib/catalogue';
import { COUNTRIES, GOVERNORATES, ar, friendlyError, toLatin, validPhone, validPostal } from '@/lib/data';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';
import { t, dir, startAlign } from '@/lib/i18n';

/** Customer details, full address and car. Used for first setup and for editing. */
export default function ProfileScreen() {
  const { ready, session, profile, refresh } = useAuth();
  const [f, setF] = useState({
    name: '', phone: '', country: 'مصر', governorate: 'القاهرة', area: '', street: '', building: '', floor: '', apartment: '',
    landmark: '', postal: '', make: '', model: '', year: 0, vin: '', powertrain: '',
  });
  const [picking, setPicking] = useState(false);
  const { makes } = useMakes();
  const set = (k: keyof typeof f) => (v: any) => setF((x) => ({ ...x, [k]: v }));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!profile) return;
    setF((x) => ({
      ...x,
      name: profile.full_name || '', phone: profile.phone || '', country: profile.country || 'مصر',
      governorate: profile.governorate || 'القاهرة', area: profile.area || '', street: profile.street || '', building: profile.building || '',
      floor: profile.floor || '', apartment: profile.apartment || '', landmark: profile.landmark || '', postal: profile.postal_code || '',
      make: profile.car_make || '', model: profile.car_model || '', year: profile.car_year || 0, vin: profile.car_vin || '', powertrain: profile.car_powertrain || '',
    }));
  }, [profile?.id]);

  if (ready && !session) return <Redirect href="/login" />;
  if (!profile) return <Screen><Loading /></Screen>;
  const editing = profile.is_customer;
  const email = session?.user.email ?? '';

  async function save() {
    setErr(null);
    if (f.name.trim().split(/\s+/).length < 2) return setErr(t('اكتب اسمك بالكامل (الاسم الأول واسم العيلة على الأقل).'));
    if (!validPhone(toLatin(f.phone))) return setErr(t('اكتب رقم موبايل مصري صحيح من ١١ رقم يبدأ بـ ٠١.'));
    if (!f.area.trim()) return setErr(t('اكتب المنطقة أو الحي.'));
    if (!f.street.trim() || !f.building.trim()) return setErr(t('اكتب اسم الشارع ورقم العمارة.'));
    if (!validPostal(f.postal)) return setErr(t('الرقم البريدي لازم يكون ٥ أرقام.'));
    if (!f.make || !f.model.trim() || !f.year) return setErr(t('اختار عربيتك.'));
    setBusy(true);
    const { error } = await supabase.from('profiles').update({
      full_name: f.name.trim(), phone: toLatin(f.phone).replace(/\s/g, ''), email,
      country: f.country, governorate: f.governorate, area: f.area.trim(), street: f.street.trim(), building: f.building.trim(),
      floor: f.floor.trim(), apartment: f.apartment.trim(), landmark: f.landmark.trim(), postal_code: toLatin(f.postal.trim()),
      car_make: f.make, car_model: f.model.trim(), car_year: f.year, car_vin: f.vin.trim().toUpperCase(), car_powertrain: f.powertrain, is_customer: true,
    }).eq('id', profile!.id);
    setBusy(false);
    if (error) return setErr(friendlyError(error));
    await refresh();
    toast(t('اتحفظت بياناتك'));
    router.replace('/customer');
  }

  return (
    <Screen footer={<><ErrorText text={err} /><Btn title={t('حفظ')} onPress={save} loading={busy} /></>}>
      <BackBar title={editing ? t('حسابي') : t('كمّل بياناتك')} onBack={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
      <Muted size={14}>{t('بنطلب البيانات دي عشان نحافظ على أمان المنصة. عنوانك ورقمك بيظهروا بس للمحل اللي هتشتري منه.')}</Muted>

      <Section title={t('بياناتك')}>
        <View style={{ gap: 14, marginTop: 8 }}>
          <Field label={t('الاسم بالكامل')} value={f.name} onChangeText={set('name')} placeholder={t('مثلاً: أحمد محمد علي')} />
          <Field label={t('رقم الموبايل')} value={f.phone} onChangeText={set('phone')} keyboardType="phone-pad" ltr placeholder="01xxxxxxxxx" />
          <View style={{ gap: 6 }}>
            <T w="medium" size={13} color={colors.muted}>{t('الإيميل')}</T>
            <View style={{ backgroundColor: colors.card, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 13 }}>
              <T style={{ writingDirection: 'ltr', textAlign: startAlign() }} color={colors.muted}>{email}</T>
            </View>
          </View>
        </View>
      </Section>

      <Section title={t('عنوانك')}>
        <View style={{ gap: 14, marginTop: 8 }}>
          <Row style={{ alignItems: 'flex-start' }}>
            <Select label={t('الدولة')} value={f.country} options={COUNTRIES.map((c) => ({ v: c, label: c }))} onPick={set('country')} />
            <Select label={t('المحافظة')} value={f.governorate} options={GOVERNORATES.map((g) => ({ v: g, label: g }))} onPick={set('governorate')} />
          </Row>
          <Field label={t('المنطقة / الحي')} value={f.area} onChangeText={set('area')} placeholder={t('مثلاً: مدينة نصر')} />
          <Field label={t('الشارع')} value={f.street} onChangeText={set('street')} placeholder={t('مثلاً: شارع عباس العقاد')} />
          <Row style={{ alignItems: 'flex-start' }}>
            <View style={{ flex: 1 }}><Field label={t('رقم العمارة')} value={f.building} onChangeText={set('building')} placeholder={t('١٢')} /></View>
            <View style={{ flex: 1 }}><Field label={t('الدور')} value={f.floor} onChangeText={set('floor')} placeholder={t('٣')} /></View>
            <View style={{ flex: 1 }}><Field label={t('الشقة')} value={f.apartment} onChangeText={set('apartment')} placeholder={t('٨')} /></View>
          </Row>
          <Field label={t('علامة مميزة (اختياري)')} value={f.landmark} onChangeText={set('landmark')} placeholder={t('مثلاً: جنب صيدلية …')} />
          <Field label={t('الرقم البريدي (اختياري)')} value={f.postal} onChangeText={set('postal')} keyboardType="number-pad" ltr placeholder="11371" hint={t('٥ أرقام. لو مش عارفه سيبه فاضي.')} />
        </View>
      </Section>

      <Section title={t('عربيتك')}>
        <View style={{ gap: 14, marginTop: 8 }}>
          <Press onPress={() => setPicking(true)} label={t('اختار عربيتك')}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface }}>
            <MakeLogo make={makeByName(makes, f.make) ?? (f.make ? { name_ar: f.make, name_en: f.make, logo_url: '' } : null)} size={44} />
            <View style={{ flex: 1 }}>
              {f.make ? <T w="semibold" size={15}>{f.make} {f.model} {f.year ? ar(f.year) : ''}</T> : <T w="semibold" size={15} color={colors.primary}>{t('اختار عربيتك')}</T>}
              {f.powertrain ? <Muted size={13}>{ptShort(f.powertrain)}</Muted> : <Muted size={13}>{t('الماركة والموديل والسنة')}</Muted>}
            </View>
            <T size={14} w="medium" color={colors.primary}>{f.make ? t('غيّر') : t('اختار')}</T>
          </Press>
          <Field label={t('رقم الشاسيه VIN (اختياري)')} value={f.vin} onChangeText={set('vin')} ltr placeholder={t('17 حرف ورقم')} hint={t('مكتوب في رخصة العربية. بيخلّي المحل يجيب القطعة الصح.')} />
        </View>
      </Section>
      <CarPicker open={picking} onClose={() => setPicking(false)}
        onDone={(c) => { setPicking(false); setF((x) => ({ ...x, make: c.make, model: c.model, year: c.year, powertrain: c.powertrain })); }} />
    </Screen>
  );
}

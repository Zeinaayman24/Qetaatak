import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { GOVERNORATES, addressLine, toLatin, validPhone, type DeliveryAddress, type Profile, type SavedAddress } from '@/lib/data';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';
import { RadioCard } from './Payment';
import { Card, Chips, Field, Icon, Muted, Row, Select, T, Toggle } from './ui';
import { t } from '@/lib/i18n';

export type AddressChoice = { address: DeliveryAddress; savedId: string | null; save: boolean; label: string };
const FIELDS: [keyof DeliveryAddress, string][] = [
  ['area', t('المنطقة')], ['street', t('الشارع')], ['building', t('رقم العمارة')], ['floor', t('الدور')], ['apartment', t('الشقة')],
];
const LABELS = [t('البيت'), t('الشغل'), t('تاني')];
const blank = (p?: Profile | null): DeliveryAddress => ({
  governorate: p?.governorate || 'القاهرة', area: p?.area || '', street: p?.street || '', building: p?.building || '',
  floor: p?.floor || '', apartment: p?.apartment || '', landmark: p?.landmark || '', contact_phone: '',
});

/** What is missing from an address, worded for the customer (null = complete). */
export function addressProblem(c: AddressChoice | null): string | null {
  if (!c) return t('كمّل العنوان عشان المندوب يوصلك.');
  for (const [k, name] of FIELDS) if (!String(c.address[k] ?? '').trim()) return t('كمّل {0} عشان المندوب يوصلك.', name);
  if (c.address.contact_phone && !validPhone(c.address.contact_phone)) return t('رقم التواصل لازم يكون ١١ رقم ويبدأ بـ 01.');
  return null;
}

/** The delivery address on checkout (A19): saved addresses, or a new one that can be saved for next time. */
export function AddressPicker({ profile, value, onChange }: { profile: Profile; value: AddressChoice | null; onChange: (c: AddressChoice) => void }) {
  const [saved, setSaved] = useState<SavedAddress[] | null>(null);
  const [otherPhone, setOtherPhone] = useState(!!value?.address.contact_phone);

  useEffect(() => {
    supabase.from('customer_addresses').select('*').eq('owner_id', profile.id).order('used_at', { ascending: false }).then(({ data }) => {
      const list = (data ?? []) as SavedAddress[];
      setSaved(list);
      if (!value) {
        onChange(list.length
          ? { address: pick(list[0]), savedId: list[0].id, save: false, label: list[0].label }
          : { address: blank(profile), savedId: null, save: true, label: t('البيت') });
      }
    });
  }, [profile.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!saved || !value) return <Card><Muted>…</Muted></Card>;
  const set = (p: Partial<DeliveryAddress>) => onChange({ ...value, savedId: null, address: { ...value.address, ...p } });
  const isNew = value.savedId === null;

  return (
    <Card>
      <Row gap={8}><Icon name="location" size={20} color={colors.primary} /><T w="bold" size={15}>{t('التوصيل على')}</T></Row>
      {saved.map((a) => (
        <RadioCard key={a.id} title={a.label} sub={addressLine(a) + (a.landmark ? ` (${a.landmark})` : '')} on={value.savedId === a.id}
          onPress={() => { setOtherPhone(!!a.contact_phone); onChange({ address: pick(a), savedId: a.id, save: false, label: a.label }); }} />
      ))}
      {saved.length ? (
        <RadioCard title={t('عنوان جديد')} icon="add" on={isNew} onPress={() => onChange({ address: blank(profile), savedId: null, save: saved.length < 5, label: t('البيت') })} />
      ) : null}

      {isNew ? (
        <View style={{ gap: 10 }}>
          <Select label={t('المحافظة')} value={value.address.governorate} options={GOVERNORATES.map((g) => ({ v: g, label: g }))} onPick={(g) => set({ governorate: g })} />
          <Field label={t('المنطقة')} value={value.address.area} onChangeText={(v) => set({ area: v })} />
          <Field label={t('الشارع')} value={value.address.street} onChangeText={(v) => set({ street: v })} />
          <Row gap={8}>
            <View style={{ flex: 1 }}><Field label={t('رقم العمارة')} value={value.address.building} onChangeText={(v) => set({ building: v })} /></View>
            <View style={{ flex: 1 }}><Field label={t('الدور')} value={value.address.floor} onChangeText={(v) => set({ floor: v })} /></View>
            <View style={{ flex: 1 }}><Field label={t('الشقة')} value={value.address.apartment} onChangeText={(v) => set({ apartment: v })} /></View>
          </Row>
          <Field label={t('علامة مميزة (اختياري)')} value={value.address.landmark} onChangeText={(v) => set({ landmark: v })} />
          {saved.length < 5 ? (
            <>
              <Row gap={10} style={{ justifyContent: 'space-between' }}>
                <T size={14} style={{ flex: 1 }}>{t('احفظ العنوان ده للمرة الجاية')}</T>
                <Toggle value={value.save} onValueChange={(v) => onChange({ ...value, save: v })} onColor={colors.primary} offColor="#C3CCD8" accessibilityLabel={t('احفظ العنوان ده للمرة الجاية')} />
              </Row>
              {value.save ? (
                <View style={{ gap: 6 }}>
                  <Muted size={13}>{t('سمّي العنوان:')}</Muted>
                  <Chips options={LABELS.map((l) => ({ v: l, label: l }))} selected={[value.label]} onPick={(l) => onChange({ ...value, label: l })} />
                </View>
              ) : null}
            </>
          ) : null}
        </View>
      ) : null}

      <View style={{ height: 1, backgroundColor: colors.line }} />
      <T w="semibold" size={14}>{t('رقم التواصل مع المندوب')}</T>
      <RadioCard title={t('هنستخدم رقمك {0}', profile.phone || '').trim()} on={!otherPhone} onPress={() => { setOtherPhone(false); onChange({ ...value, address: { ...value.address, contact_phone: '' } }); }} />
      <RadioCard title={t('رقم تاني')} on={otherPhone} onPress={() => setOtherPhone(true)} />
      {otherPhone ? (
        <Field value={value.address.contact_phone} onChangeText={(v) => onChange({ ...value, address: { ...value.address, contact_phone: toLatin(v).replace(/\D/g, '').slice(0, 11) } })}
          keyboardType="phone-pad" ltr placeholder="01xxxxxxxxx" />
      ) : null}
      <Row gap={6}><Icon name="lock-closed" size={13} color={colors.muted} /><Muted size={12.5}>{t('عنوانك بيظهر للمحل بس بعد تأكيد الأوردر.')}</Muted></Row>
    </Card>
  );
}

const pick = (a: SavedAddress): DeliveryAddress => ({
  governorate: a.governorate, area: a.area, street: a.street, building: a.building, floor: a.floor, apartment: a.apartment, landmark: a.landmark, contact_phone: a.contact_phone,
});

/** After the order is placed: remember a new address (if asked) or mark the saved one as last used. */
export async function rememberAddress(c: AddressChoice, ownerId: string) {
  if (c.savedId) { await supabase.from('customer_addresses').update({ used_at: new Date().toISOString() }).eq('id', c.savedId); return; }
  if (!c.save) return;
  await supabase.from('customer_addresses').insert({ owner_id: ownerId, label: c.label, ...c.address });
}

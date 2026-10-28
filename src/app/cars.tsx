import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { BackBar, Btn, Card, ErrorText, Field, Icon, Muted, Row, Screen, Section, Select, T, toast } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { MAKES, YEARS, ar, friendlyError, type Car } from '@/lib/data';
import { must, useLive } from '@/lib/live';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';

/** The customer's cars: the main car from their profile plus any extra cars. */
export default function Cars() {
  const { ready, session, profile } = useAuth();
  const uid = session?.user.id;
  const [adding, setAdding] = useState(false);
  const [make, setMake] = useState(MAKES[0]);
  const [model, setModel] = useState('');
  const [year, setYear] = useState(2015);
  const [vin, setVin] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const { data, reload } = useLive(async () => {
    if (!uid) return [] as Car[];
    return must(await supabase.from('cars').select('*').eq('owner_id', uid).order('created_at')) as Car[];
  }, ['cars'], [uid]);

  if (ready && !session) return <Redirect href="/login" />;

  async function add() {
    setErr(null);
    if (!model.trim()) return setErr('اكتب موديل العربية.');
    setBusy(true);
    const { error } = await supabase.from('cars').insert({ make, model: model.trim(), year, vin: vin.trim().toUpperCase() });
    setBusy(false);
    if (error) return setErr(friendlyError(error));
    setAdding(false); setModel(''); setVin(''); reload(); toast('العربية اتضافت');
  }
  async function remove(id: string) {
    const { error } = await supabase.from('cars').delete().eq('id', id);
    if (error) toast(friendlyError(error)); else reload();
  }

  const carCard = (title: string, sub: string, action: React.ReactNode, main?: boolean) => (
    <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.ground, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="car-sport" size={22} />
      </View>
      <View style={{ flex: 1 }}>
        <Row gap={6}><T w="semibold">{title}</T>{main ? <T size={11} w="semibold" color={colors.muted}>· الأساسية</T> : null}</Row>
        <Muted size={12.5}>{sub}</Muted>
      </View>
      {action}
    </Card>
  );

  return (
    <Screen footer={adding ? <><ErrorText text={err} /><Btn title="أضف العربية" onPress={add} loading={busy} /></> : undefined}>
      <BackBar title="عربياتي" onBack={() => (router.canGoBack() ? router.back() : router.replace('/account'))} />
      <Muted size={14}>اختار العربية وانت بتعمل الطلب. رقم الشاسيه (VIN) بيخلّي المحل يجيب القطعة الصح من أول مرة.</Muted>
      {profile ? carCard(`${profile.car_make} ${profile.car_model} ${ar(profile.car_year ?? '')}`, profile.car_vin ? 'شاسيه: ' + profile.car_vin : 'من غير رقم شاسيه',
        <Btn kind="link" title="تعديل" onPress={() => router.push('/profile')} />, true) : null}
      {(data ?? []).map((c) => (
        <View key={c.id}>
          {carCard(`${c.make} ${c.model} ${ar(c.year)}`, c.vin ? 'شاسيه: ' + c.vin : 'من غير رقم شاسيه',
            <Pressable onPress={() => remove(c.id)} accessibilityLabel="امسح العربية" hitSlop={8}><Icon name="trash-outline" size={20} color={colors.bad} /></Pressable>)}
        </View>
      ))}
      {adding ? (
        <Section title="عربية جديدة">
          <View style={{ gap: 14, marginTop: 8 }}>
            <Row style={{ alignItems: 'flex-start' }}>
              <Select label="الماركة" value={make} options={MAKES.map((m) => ({ v: m, label: m }))} onPick={setMake} />
              <Select label="سنة الصنع" value={year} options={YEARS.map((y) => ({ v: y, label: ar(y) }))} onPick={setYear} />
            </Row>
            <Field label="الموديل" value={model} onChangeText={setModel} placeholder="مثلاً: سيراتو" />
            <Field label="رقم الشاسيه VIN (اختياري)" value={vin} onChangeText={setVin} ltr placeholder="17 حرف ورقم" hint="مكتوب في رخصة العربية." />
          </View>
        </Section>
      ) : (
        <Btn kind="secondary" title="+ أضف عربية تانية" onPress={() => setAdding(true)} />
      )}
    </Screen>
  );
}

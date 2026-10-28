import { Redirect, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { AppHeader } from '@/components/AppHeader';
import { BackBar, Btn, ErrorText, Field, Loading, Row, Screen, Select, T, toast } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { AREAS, MAKES, YEARS, ar, friendlyError, validPhone } from '@/lib/data';
import { supabase } from '@/lib/supabase';

/** Customer details and car. Used for first setup and for editing. */
export default function ProfileScreen() {
  const { ready, session, profile, refresh } = useAuth();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [area, setArea] = useState(AREAS[0]);
  const [make, setMake] = useState(MAKES[0]);
  const [model, setModel] = useState('');
  const [year, setYear] = useState(2015);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!profile) return;
    setName(profile.full_name || ''); setPhone(profile.phone || '');
    if (profile.area) setArea(profile.area);
    if (profile.car_make) setMake(profile.car_make);
    if (profile.car_model) setModel(profile.car_model);
    if (profile.car_year) setYear(profile.car_year);
  }, [profile?.id]);

  if (ready && !session) return <Redirect href="/login" />;
  if (!profile) return <Screen header={<AppHeader />}><Loading /></Screen>;
  const editing = profile.is_customer;

  async function save() {
    setErr(null);
    if (!name.trim()) return setErr('اكتب اسمك.');
    if (!validPhone(phone)) return setErr('اكتب رقم موبايل مصري صحيح من ١١ رقم يبدأ بـ ٠١.');
    if (!model.trim()) return setErr('اكتب موديل العربية.');
    setBusy(true);
    const { error } = await supabase.from('profiles').update({
      full_name: name.trim(), phone: phone.replace(/\s/g, ''), area, car_make: make, car_model: model.trim(), car_year: year, is_customer: true,
    }).eq('id', profile!.id);
    setBusy(false);
    if (error) return setErr(friendlyError(error));
    await refresh();
    toast('اتحفظت بياناتك');
    router.replace('/customer');
  }

  return (
    <Screen header={<AppHeader />} footer={<Btn title="حفظ" onPress={save} loading={busy} />}>
      <BackBar title={editing ? 'بياناتك وعربيتك' : 'بياناتك وبيانات عربيتك'} onBack={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
      <Field label="اسمك" value={name} onChangeText={setName} placeholder="مثلاً: أحمد" />
      <Field label="رقم موبايلك" value={phone} onChangeText={setPhone} keyboardType="phone-pad" ltr placeholder="01xxxxxxxxx" hint="الرقم بيظهر للمحل بس بعد ما تختار عرضه." />
      <Select label="منطقتك" value={area} options={AREAS.map((a) => ({ v: a, label: a }))} onPick={setArea} />
      <T w="bold" size={17} style={{ marginTop: 4 }}>عربيتك</T>
      <Row style={{ alignItems: 'flex-start' }}>
        <Select label="الماركة" value={make} options={MAKES.map((m) => ({ v: m, label: m }))} onPick={setMake} />
        <Select label="سنة الصنع" value={year} options={YEARS.map((y) => ({ v: y, label: ar(y) }))} onPick={setYear} />
      </Row>
      <Field label="الموديل" value={model} onChangeText={setModel} placeholder="مثلاً: فيرنا، سنترا، لانسر" />
      <ErrorText text={err} />
    </Screen>
  );
}

import { Redirect } from 'expo-router';
import { useState } from 'react';
import { Platform, View } from 'react-native';
import { AppHeader } from '@/components/AppHeader';
import { Btn, ErrorText, Field, Muted, Notice, Screen, Seg, Steps, T, Title } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { friendlyError } from '@/lib/data';
import { supabase } from '@/lib/supabase';

export default function Login() {
  const { session } = useAuth();
  const [mode, setMode] = useState<'signin' | 'signup'>('signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  if (session) return <Redirect href="/" />;

  async function submit() {
    setErr(null);
    const e = email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(e)) return setErr('اكتب إيميل صحيح.');
    if (password.length < 6) return setErr('كلمة السر لازم تكون ٦ حروف أو أكتر.');
    setBusy(true);
    try {
      if (mode === 'signup') {
        const emailRedirectTo = Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.origin + '/Qetaatak/' : undefined;
        const { data, error } = await supabase.auth.signUp({ email: e, password, options: { emailRedirectTo } });
        if (error) throw error;
        if (!data.session) setSent(true);
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: e, password });
        if (error) throw error;
      }
    } catch (x) { setErr(friendlyError(x)); }
    finally { setBusy(false); }
  }

  return (
    <Screen header={<AppHeader />} footer={<Btn title={mode === 'signup' ? 'إنشاء حساب' : 'دخول'} onPress={submit} loading={busy} />}>
      <Title sub="ابعت صورة القطعة، وخلال ساعة يوصلك أسعار من محلات وتشاليح موثوقة.">قطع غيار عربيتك{'\n'}بأحسن سعر</Title>
      {sent ? (
        <Notice>
          <T w="semibold">بعتنالك إيميل تأكيد على {email.trim()}</T>
          <T size={13}>افتح الرسالة واضغط على اللينك، وبعدها ارجع هنا وسجّل دخول.</T>
        </Notice>
      ) : null}
      <Seg options={[{ v: 'signup', label: 'حساب جديد' }, { v: 'signin', label: 'عندي حساب' }]} value={mode} onPick={(v) => { setMode(v); setErr(null); }} />
      <Field label="الإيميل" value={email} onChangeText={setEmail} keyboardType="email-address" ltr placeholder="name@example.com" />
      <Field label="كلمة السر" value={password} onChangeText={setPassword} secure ltr placeholder="٦ حروف أو أكتر" />
      <ErrorText text={err} />
      <View style={{ gap: 14, marginTop: 8 }}>
        <Muted size={13}>إزاي بيشتغل</Muted>
        <Steps items={['ابعت اسم القطعة وصورتها.', 'المحلات بتبعتلك أسعارها وصور القطعة والضمان.', 'اختار الأنسب واستلم توصيل أو من المحل.']} />
      </View>
    </Screen>
  );
}

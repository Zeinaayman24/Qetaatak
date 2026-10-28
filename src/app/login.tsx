import { Redirect } from 'expo-router';
import { useState } from 'react';
import { Platform, View } from 'react-native';
import { AppHeader } from '@/components/AppHeader';
import { Btn, Card, ErrorText, Field, Muted, Notice, Screen, Seg, Steps, T } from '@/components/ui';
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
    <Screen header={<AppHeader />}>
      <View style={{ gap: 4 }}>
        <T w="bold" size={22}>أهلاً بيك في قطعتك</T>
        <Muted size={14}>ابعت صورة القطعة، وخلال ساعة يوصلك أسعار من محلات وتشاليح موثوقة.</Muted>
      </View>
      {sent ? (
        <Notice>
          <T w="semibold">بعتنالك إيميل تأكيد على {email.trim()}</T>
          <T size={13}>افتح الرسالة واضغط على اللينك، وبعدها ارجع هنا وسجّل دخول.</T>
        </Notice>
      ) : null}
      <Card>
        <Seg options={[{ v: 'signup', label: 'حساب جديد' }, { v: 'signin', label: 'تسجيل دخول' }]} value={mode} onPick={(v) => { setMode(v); setErr(null); }} />
        <Field label="الإيميل" value={email} onChangeText={setEmail} keyboardType="email-address" ltr placeholder="name@example.com" />
        <Field label="كلمة السر" value={password} onChangeText={setPassword} secure ltr placeholder="٦ حروف أو أكتر" />
        <ErrorText text={err} />
        <Btn title={mode === 'signup' ? 'إنشاء حساب' : 'دخول'} onPress={submit} loading={busy} />
      </Card>
      <Card>
        <T w="bold">إزاي بيشتغل</T>
        <Steps items={['صاحب العربية بيبعت اسم القطعة وصورتها.', 'المحلات بتبعت أسعارها وصور القطعة والضمان.', 'العميل بيختار الأنسب ويستلم توصيل أو من المحل.']} />
      </Card>
    </Screen>
  );
}

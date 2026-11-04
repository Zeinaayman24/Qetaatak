import { LegalLinks } from '@/components/LegalLinks';
import { Redirect } from 'expo-router';
import { useState } from 'react';
import { Platform, View } from 'react-native';
import { Logo } from '@/components/AppHeader';
import { Btn, ErrorText, Field, Icon, Muted, Notice, Row, Screen, Seg, T } from '@/components/ui';
import { colors, lift } from '@/lib/theme';
import { useAuth } from '@/lib/auth';
import { friendlyError } from '@/lib/data';
import { supabase } from '@/lib/supabase';
import { t } from '@/lib/i18n';

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
    if (!/^\S+@\S+\.\S+$/.test(e)) return setErr(t('اكتب إيميل صحيح.'));
    if (password.length < 6) return setErr(t('كلمة السر لازم تكون ٦ حروف أو أكتر.'));
    setBusy(true);
    try {
      if (mode === 'signup') {
        const emailRedirectTo = Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.origin + '/daghta/' : undefined;
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

  const hero = (
    <View style={{ backgroundColor: colors.ink, borderBottomLeftRadius: 28, borderBottomRightRadius: 28, paddingBottom: 72, overflow: 'hidden' }}>
      <View style={{ position: 'absolute', width: 260, height: 260, borderRadius: 130, backgroundColor: colors.accent, opacity: 0.18, top: -80, left: -70 }} />
      <View style={{ width: '100%', maxWidth: 560, alignSelf: 'center', paddingHorizontal: 22, paddingTop: 22, gap: 22 }}>
        <Logo size={30} on="dark" />
        <View style={{ gap: 10 }}>
          <T w="bold" size={32} color="#fff" style={{ lineHeight: 44, letterSpacing: -0.5 }}>{t('صوّر القطعة.')}{'\n'}{t('المحلات تتسابق على سعرك.')}</T>
          <T size={15} color="rgba(255,255,255,.7)">{t('أسعار من محلات موثوقة خلال ساعة، والقطعة لازم تكون زي الوصف، وتوصيل لحد البيت.')}</T>
        </View>
        <Row gap={8} style={{ flexWrap: 'wrap' }}>
          {[['flash', t('عروض في أقل من ساعة')], ['shield-checkmark', t('القطعة زي الوصف أو ترجع')], ['bicycle', t('توصيل')]].map(([i, t]) => (
            <Row key={t} gap={6} style={{ backgroundColor: 'rgba(255,255,255,.08)', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 }}>
              <Icon name={i} size={14} color={colors.accent} /><T size={12.5} color="#fff">{t}</T>
            </Row>
          ))}
        </Row>
      </View>
    </View>
  );

  return (
    <Screen top={hero} footer={<Btn kind="accent" title={mode === 'signup' ? t('إنشاء حساب') : t('دخول')} onPress={submit} loading={busy} />}>
      <View style={[{ marginTop: -52, backgroundColor: colors.surface, borderRadius: 18, padding: 18, gap: 16 }, lift]}>
        {sent ? (
          <Notice icon="mail">
            <T w="semibold">{t('بعتنالك إيميل تأكيد على')}{' '}{email.trim()}</T>
            <T size={13}>{t('افتح الرسالة واضغط على اللينك، وبعدها ارجع هنا وسجّل دخول.')}</T>
          </Notice>
        ) : null}
        <Seg options={[{ v: 'signup', label: t('حساب جديد') }, { v: 'signin', label: t('عندي حساب') }]} value={mode} onPick={(v) => { setMode(v); setErr(null); }} />
        <Field icon="mail-outline" label={t('الإيميل')} value={email} onChangeText={setEmail} keyboardType="email-address" ltr placeholder="name@example.com" />
        <Field icon="lock-closed-outline" label={t('كلمة السر')} value={password} onChangeText={setPassword} secure ltr placeholder={t('٦ حروف أو أكتر')} />
        <ErrorText text={err} />
      </View>
      <LegalLinks lead={t('بتسجيلك بتوافق على')} />
    </Screen>
  );
}

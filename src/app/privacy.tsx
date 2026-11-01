import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { Switch, View } from 'react-native';
import { BackBar, Btn, Card, Muted, Row, Screen, T, toast } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { friendlyError } from '@/lib/data';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';

/** A29 privacy page (Product Register change 1.19). */
export default function Privacy() {
  const { ready, session, profile, refresh } = useAuth();
  const [busy, setBusy] = useState(false);
  const [asked, setAsked] = useState(false);
  if (ready && !session) return <Redirect href="/login" />;
  const on = !!profile?.marketing_consent;

  async function toggle(v: boolean) {
    setBusy(true);
    const { error } = await supabase.rpc('set_marketing_consent', { p_on: v });
    setBusy(false);
    if (error) return toast(friendlyError(error));
    await refresh();
  }
  async function copy() {
    setBusy(true);
    const { error } = await supabase.rpc('request_data_copy');
    setBusy(false);
    if (error && !/already/.test(error.message)) return toast(friendlyError(error));
    setAsked(true); toast('وصلنا طلبك.');
  }

  return (
    <Screen>
      <BackBar title="الخصوصية" onBack={() => (router.canGoBack() ? router.back() : router.replace('/account'))} />
      <Card>
        <Row gap={12} style={{ alignItems: 'center' }}>
          <View style={{ flex: 1, gap: 2 }}>
            <T w="semibold" size={15}>ابعتولي عروض وخصومات من ضغطة</T>
            <Muted size={12.5}>تقدر تقفلها في أي وقت.</Muted>
          </View>
          <Switch value={on} onValueChange={toggle} disabled={busy} trackColor={{ true: colors.primary, false: colors.line }} accessibilityLabel="ابعتولي عروض وخصومات من ضغطة" />
        </Row>
      </Card>
      <Card>
        <T w="semibold" size={15}>مين بيشوف بياناتك</T>
        <Muted size={13.5}>رقمك وعنوانك بيظهروا بس للمحل اللي بتشتري منه، بعد تأكيد الأوردر. المحلات التانية بتشوف القطعة والعربية ومنطقتك بس.</Muted>
        <Muted size={13.5}>محادثاتك مع المساعد بيعالجها ذكاء اصطناعي وبنحتفظ بيها عشان الدعم.</Muted>
        <Btn kind="link" title="سياسة الخصوصية" onPress={() => router.push('/legal/privacy')} />
      </Card>
      <Card>
        <T w="semibold" size={15}>اطلب نسخة من بياناتك</T>
        <Muted size={13.5}>هنبعتلك ملف ببياناتك خلال ٣٠ يوم.</Muted>
        <Btn kind="secondary" title={asked ? 'وصلنا طلبك' : 'اطلب نسخة من بياناتك'} disabled={asked} loading={busy} onPress={copy} />
      </Card>
      <Btn kind="link" title="امسح حسابي" onPress={() => router.push('/delete-account')} style={{ alignSelf: 'center' }} />
    </Screen>
  );
}

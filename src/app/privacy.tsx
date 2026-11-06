import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { BackBar, Btn, Card, Muted, Row, Screen, T, toast, Toggle } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { friendlyError } from '@/lib/data';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';
import { t } from '@/lib/i18n';

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
    setAsked(true); toast(t('وصلنا طلبك.'));
  }

  return (
    <Screen>
      <BackBar title={t('الخصوصية والشروط')} onBack={() => (router.canGoBack() ? router.back() : router.replace('/account'))} />
      <Card>
        <Row gap={12} style={{ alignItems: 'center' }}>
          <View style={{ flex: 1, gap: 2 }}>
            <T w="semibold" size={15}>{t('ابعتولي عروض وخصومات من ضغطة')}</T>
            <Muted size={12.5}>{t('تقدر تقفلها في أي وقت.')}</Muted>
          </View>
          <Toggle value={on} onValueChange={toggle} disabled={busy} onColor={colors.primary} offColor="#C3CCD8" accessibilityLabel={t('ابعتولي عروض وخصومات من ضغطة')} />
        </Row>
      </Card>
      <Card>
        <T w="semibold" size={15}>{t('مين بيشوف بياناتك')}</T>
        <Muted size={13.5}>{t('رقمك وعنوانك بيظهروا بس للمحل اللي بتشتري منه، بعد تأكيد الأوردر. المحلات التانية بتشوف القطعة والعربية ومنطقتك بس.')}</Muted>
        <Muted size={13.5}>{t('محادثاتك مع المساعد بيعالجها ذكاء اصطناعي وبنحتفظ بيها عشان الدعم.')}</Muted>
      </Card>
      <Card>
        <T w="semibold" size={15}>{t('الشروط والسياسات')}</T>
        <Btn kind="link" title={t('الشروط والأحكام')} onPress={() => router.push('/legal/terms')} style={{ alignSelf: 'flex-start' }} />
        <Btn kind="link" title={t('سياسة الخصوصية')} onPress={() => router.push('/legal/privacy')} style={{ alignSelf: 'flex-start' }} />
        <Btn kind="link" title={t('سياسة الإلغاء')} onPress={() => router.push('/legal/cancellation')} style={{ alignSelf: 'flex-start' }} />
      </Card>
      <Card>
        <T w="semibold" size={15}>{t('اطلب نسخة من بياناتك')}</T>
        <Muted size={13.5}>{t('هنبعتلك ملف ببياناتك خلال ٣٠ يوم.')}</Muted>
        <Btn kind="secondary" title={asked ? t('وصلنا طلبك') : t('اطلب نسخة من بياناتك')} disabled={asked} loading={busy} onPress={copy} />
      </Card>
      <Btn kind="link" title={t('امسح حسابي')} onPress={() => router.push('/delete-account')} style={{ alignSelf: 'center' }} />
    </Screen>
  );
}

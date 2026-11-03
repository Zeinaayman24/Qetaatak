import { Redirect, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { BackBar, Btn, Card, Chips, Muted, Notice, Row, Screen, T, toast } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { friendlyError } from '@/lib/data';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';
import { t } from '@/lib/i18n';

const REASONS = [t('مبقتش محتاج التطبيق'), t('مالقيتش القطع'), t('مشكلة في الخصوصية'), t('سبب تاني')];

/** A30 delete account (Product Register change 1.19). Store requirement. */
export default function DeleteAccount() {
  const { ready, session, signOut } = useAuth();
  const [blockers, setBlockers] = useState<{ open_orders: number; is_shop: boolean } | null>(null);
  const [reason, setReason] = useState<string[]>([]);
  const [sure, setSure] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!session) return;
    supabase.rpc('account_deletion_blockers').then(({ data }) => setBlockers(data as { open_orders: number; is_shop: boolean }));
  }, [session]);

  if (done) return (
    <Screen>
      <View style={{ paddingTop: 60, gap: 14, alignItems: 'center' }}>
        <T w="bold" size={20} center>{t('حسابك اتمسح.')}</T>
        <Muted center>{t('شكراً إنك جرّبت ضغطة.')}</Muted>
        <Btn title={t('تمام')} onPress={() => router.replace('/login')} style={{ minWidth: 160 }} />
      </View>
    </Screen>
  );
  if (ready && !session) return <Redirect href="/login" />;

  async function del() {
    setBusy(true);
    const { error } = await supabase.rpc('delete_my_account', { p_reason: reason[0] ?? '' });
    if (error) {
      setBusy(false);
      if (/open orders/.test(error.message)) return toast(t('عندك أوردرات لسه ماخلصتش أو فلوس هترجعلك. كمّلها الأول عشان نقدر نمسح الحساب.'));
      return toast(friendlyError(error));
    }
    await signOut().catch(() => {});
    setDone(true);
  }

  const blocked = !!blockers && (blockers.open_orders > 0 || blockers.is_shop);
  return (
    <Screen>
      <BackBar title={t('مسح الحساب')} onBack={() => (router.canGoBack() ? router.back() : router.replace('/account'))} />
      <Card>
        <T w="semibold" size={15}>{t('لما تمسح حسابك:')}</T>
        {[t('اسمك ورقمك وعناوينك وعربياتك ورسايلك هتتمسح خلال ٣٠ يوم.'), t('هنحتفظ بس بسجل الأوردرات من غير بياناتك الشخصية، زي ما القانون بيطلب.'), t('مش هتقدر ترجّع الحساب.')].map((x) => (
          <Row key={x} gap={8} style={{ alignItems: 'flex-start' }}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.bad, marginTop: 9 }} />
            <Muted size={13.5} style={{ flex: 1 }}>{x}</Muted>
          </Row>
        ))}
      </Card>
      {blockers?.is_shop ? <Notice>{t('حساب المحل بيتقفل من «حسابك ← قفل حساب المحل» بعد ما تكمّل الأوردرات وتسدّد العمولة. كلّمنا من «الدعم» لو محتاج مساعدة.')}</Notice>
        : blockers && blockers.open_orders > 0 ? <Notice>{t('عندك أوردرات لسه ماخلصتش أو فلوس هترجعلك. كمّلها الأول عشان نقدر نمسح الحساب.')}</Notice> : null}
      {!blocked ? (
        <>
          <View style={{ gap: 8 }}>
            <T w="semibold" size={14.5}>{t('ليه ماشي؟ (اختياري)')}</T>
            <Chips options={REASONS.map((r) => ({ v: r, label: r }))} selected={reason} onPick={(v) => setReason(reason[0] === v ? [] : [v])} />
          </View>
          {sure ? (
            <Card>
              <T w="semibold" size={15}>{t('متأكد؟ مش هتقدر ترجّع الحساب.')}</T>
              <Btn kind="danger" title={t('امسح حسابي نهائياً')} loading={busy} onPress={del} />
              <Btn kind="link" title={t('لأ، رجوع')} onPress={() => setSure(false)} />
            </Card>
          ) : <Btn kind="danger" title={t('امسح حسابي')} onPress={() => setSure(true)} />}
        </>
      ) : null}
    </Screen>
  );
}

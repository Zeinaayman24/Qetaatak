import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { GuaranteeSheet } from '@/components/Confirm';
import { BackBar, Btn, Card, Empty, Icon, Muted, Pill, Press, Row, Screen, Section, T } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { REPORT_CATEGORIES, TICKET_STATUS, ago, type Report } from '@/lib/data';
import { must, useLive } from '@/lib/live';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';
import { t } from '@/lib/i18n';

type Topic = { title: string; open: () => void };

/** «الدعم» (Product Register A26; shop topics B20): help topics, then your cases and their status. */
export default function Support() {
  const { ready, session, profile } = useAuth();
  const [guarantee, setGuarantee] = useState(false);
  const uid = session?.user.id;
  const { data } = useLive(async () => {
    if (!uid) return [] as Report[];
    return must(await supabase.from('reports').select('*').eq('reporter_id', uid).order('updated_at', { ascending: false })) as Report[];
  }, ['reports', 'ticket_messages'], [uid]);

  if (ready && !session) return <Redirect href="/login" />;
  const go = (path: string) => () => router.push(path as never);
  // each topic opens the page that already explains it
  const topics: Topic[] = profile?.is_shop ? [
    { title: t('إزاي أبعت عرض كويس'), open: go('/legal/merchant') },
    { title: t('التحويلات والاسترجاع'), open: go('/legal/cancellation') },
    { title: t('العمولة والسداد'), open: go('/shop/balance') },
    { title: t('التقييم والأداء'), open: go('/shop/performance') },
    { title: t('فريق المحل'), open: go('/legal/merchant') },
    { title: t('اتفاقية التاجر'), open: go('/legal/merchant') },
  ] : [
    { title: t('إزاي ضغطة بتشتغل؟'), open: go('/legal/terms') },
    { title: t('الدفع والتحويل'), open: go('/legal/cancellation') },
    { title: t('ضمان ضغطة والفحص عند الاستلام'), open: () => setGuarantee(true) },
    { title: t('الإلغاء ورجوع الفلوس'), open: go('/legal/cancellation') },
    { title: t('ضمان المحل'), open: go('/legal/cancellation') },
    { title: t('حسابي وبياناتي'), open: go('/privacy') },
  ];

  return (
    <Screen footer={<Btn title={t('عندي مشكلة جديدة')} onPress={() => router.push({ pathname: '/assistant', params: { mode: 'complaint' } })} />}>
      <BackBar title={t('الدعم')} onBack={() => (router.canGoBack() ? router.back() : router.replace('/account'))} />
      <Muted size={14}>{t('لو عندك سؤال شوف المواضيع دي. ولو عندك مشكلة، فريقنا بيرد عادةً خلال ١٥ دقيقة من ١٠ص لـ١٠م.')}</Muted>
      <View style={{ backgroundColor: colors.surface, borderRadius: 18, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 14 }}>
        {topics.map((t, i) => (
          <Press key={t.title} onPress={t.open} label={t.title}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 14, borderTopWidth: i ? 1 : 0, borderColor: colors.line }}>
            <T size={14.5} w="medium" style={{ flex: 1 }}>{t.title}</T>
            <Icon name="chevron-back" size={16} color={colors.faint} />
          </Press>
        ))}
      </View>
      {data?.length ? (
        <Section title={t('شكاويّ')}>
          <View style={{ gap: 10, marginTop: 8 }}>
            {data.map((r) => (
              <Card key={r.id} onPress={() => router.push({ pathname: '/assistant', params: { ticket: r.id } })}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <T w="semibold" size={14}>T-{r.ticket_no} · {REPORT_CATEGORIES[r.category]}</T>
                  <Pill label={TICKET_STATUS[r.status]} tone={r.status === 'resolved' ? 'good' : r.status === 'in_progress' ? 'new' : 'wait'} />
                </Row>
                <T size={14} numberOfLines={2}>{r.body}</T>
                <Muted size={11.5}>{t('آخر تحديث')}{' '}{ago(r.updated_at)}</Muted>
              </Card>
            ))}
          </View>
        </Section>
      ) : <Empty text={t('مفيش شكاوى قبل كده.')} />}
      <GuaranteeSheet open={guarantee} onClose={() => setGuarantee(false)} />
    </Screen>
  );
}

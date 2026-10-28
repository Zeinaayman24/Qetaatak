import { Redirect, router } from 'expo-router';
import { View } from 'react-native';
import { BackBar, Btn, Card, Empty, Muted, Pill, Row, Screen, Section, T } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { REPORT_CATEGORIES, TICKET_STATUS, ago, type Report } from '@/lib/data';
import { must, useLive } from '@/lib/live';
import { supabase } from '@/lib/supabase';

/** Your complaints and their status. New complaints are made by chatting with the assistant. */
export default function Support() {
  const { ready, session } = useAuth();
  const uid = session?.user.id;
  const { data } = useLive(async () => {
    if (!uid) return [] as Report[];
    return must(await supabase.from('reports').select('*').eq('reporter_id', uid).order('updated_at', { ascending: false })) as Report[];
  }, ['reports', 'ticket_messages'], [uid]);

  if (ready && !session) return <Redirect href="/login" />;

  return (
    <Screen footer={<Btn title="عندي مشكلة جديدة" onPress={() => router.push({ pathname: '/assistant', params: { mode: 'complaint' } })} />}>
      <BackBar title="شكاويّا" onBack={() => (router.canGoBack() ? router.back() : router.replace('/account'))} />
      <Muted size={14}>كلّم المساعد وهو يسجّل شكوتك ويوصّلها لخدمة العملاء. بنرد خلال ٤٨ ساعة، وكل شكوى ليها محادثة تتابع فيها.</Muted>
      {data?.length ? (
        <Section title="شكاويك">
          <View style={{ gap: 10, marginTop: 8 }}>
            {data.map((r) => (
              <Card key={r.id} onPress={() => router.push({ pathname: "/assistant", params: { ticket: r.id } })}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <T w="semibold" size={14}>T-{r.ticket_no} · {REPORT_CATEGORIES[r.category]}</T>
                  <Pill label={TICKET_STATUS[r.status]} tone={r.status === 'resolved' ? 'good' : r.status === 'in_progress' ? 'new' : 'wait'} />
                </Row>
                <T size={14} numberOfLines={2}>{r.body}</T>
                <Muted size={11.5}>آخر تحديث {ago(r.updated_at)} · اضغط وكمّل المحادثة</Muted>
              </Card>
            ))}
          </View>
        </Section>
      ) : <Empty text="مفيش شكاوى قبل كده." />}
    </Screen>
  );
}

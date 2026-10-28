import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { BackBar, Btn, Card, Chips, Empty, ErrorText, Field, Labeled, Muted, Pill, Row, Screen, Section, T, toast } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { REPORT_CATEGORIES, ago, friendlyError, type Report } from '@/lib/data';
import { must, useLive } from '@/lib/live';
import { supabase } from '@/lib/supabase';

/** Report a problem and see replies from support. */
export default function Support() {
  const { ready, session, profile } = useAuth();
  const params = useLocalSearchParams<{ request?: string }>();
  const requestId = typeof params.request === 'string' ? params.request : null;
  const uid = session?.user.id;
  const [category, setCategory] = useState(requestId ? 'order' : 'app');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const { data, reload } = useLive(async () => {
    if (!uid) return [] as Report[];
    return must(await supabase.from('reports').select('*').eq('reporter_id', uid).order('created_at', { ascending: false })) as Report[];
  }, ['reports'], [uid]);

  if (ready && !session) return <Redirect href="/login" />;
  const cats = Object.entries(REPORT_CATEGORIES).filter(([k]) => (profile?.is_shop ? k !== 'shop' : k !== 'customer'));

  async function send() {
    setErr(null);
    if (body.trim().length < 5) return setErr('اكتب المشكلة بتفاصيل أكتر.');
    setBusy(true);
    const { error } = await supabase.from('reports').insert({ category, body: body.trim(), request_id: requestId });
    setBusy(false);
    if (error) return setErr(friendlyError(error));
    setBody(''); toast('اتبعتت. هنرد عليك في أقرب وقت.'); reload();
  }

  return (
    <Screen footer={<><ErrorText text={err} /><Btn title="ابعت" onPress={send} loading={busy} /></>}>
      <BackBar title="المساعدة والشكاوى" onBack={() => (router.canGoBack() ? router.back() : router.replace('/account'))} />
      <Muted size={14}>بلّغنا عن أي مشكلة: قطعة مش مظبوطة، محل مش ملتزم، أو حاجة في التطبيق. بنرد خلال ٤٨ ساعة.</Muted>
      {requestId ? <Pill label="عن طلب محدد" tone="wait" /> : null}
      <Labeled label="نوع المشكلة">
        <Chips options={cats.map(([v, label]) => ({ v, label }))} selected={[category]} onPick={setCategory} />
      </Labeled>
      <Field label="اكتب التفاصيل" value={body} onChangeText={setBody} multiline placeholder="إيه اللي حصل؟" />

      {data?.length ? (
        <Section title="شكاويك">
          <View style={{ gap: 10, marginTop: 8 }}>
            {data.map((r) => (
              <Card key={r.id}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <T w="semibold" size={14}>{REPORT_CATEGORIES[r.category]}</T>
                  <Pill label={r.status === 'resolved' ? 'اتحلّت' : 'بنراجعها'} tone={r.status === 'resolved' ? 'good' : 'wait'} />
                </Row>
                <T size={14}>{r.body}</T>
                {r.admin_reply ? <View style={{ backgroundColor: '#fff', borderRadius: 12, padding: 10 }}><Muted size={12}>ردّ الدعم</Muted><T size={14}>{r.admin_reply}</T></View> : null}
                <Muted size={11.5}>{ago(r.created_at)}</Muted>
              </Card>
            ))}
          </View>
        </Section>
      ) : <Empty text="مفيش شكاوى قبل كده." />}
    </Screen>
  );
}

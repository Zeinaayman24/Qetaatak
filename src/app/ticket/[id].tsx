import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, TextInput, View } from 'react-native';
import { BackBar, Empty, Icon, Loading, Muted, Pill, Row, Screen, T, toast } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { REPORT_CATEGORIES, TICKET_STATUS, ago, friendlyError, type Report, type TicketMessage } from '@/lib/data';
import { must, useLive } from '@/lib/live';
import { supabase } from '@/lib/supabase';
import { colors, fonts } from '@/lib/theme';

/** One support ticket: the complaint and the conversation with customer service. */
export default function Ticket() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { ready, session } = useAuth();
  const uid = session?.user.id;
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const { data, loading } = useLive(async () => {
    const t = must(await supabase.from('reports').select('*').eq('id', id).maybeSingle()) as Report | null;
    const msgs = must(await supabase.from('ticket_messages').select('*').eq('report_id', id).order('created_at')) as TicketMessage[];
    return { t, msgs };
  }, ['ticket_messages', 'reports'], [id]);

  if (ready && !session) return <Redirect href="/login" />;
  if (loading && !data) return <Screen><Loading /></Screen>;
  const t = data?.t;
  const back = () => (router.canGoBack() ? router.back() : router.replace('/support'));
  if (!t) return <Screen><BackBar title="الشكوى" onBack={back} /><Empty text="الشكوى دي مش موجودة." /></Screen>;

  async function send() {
    const body = text.trim();
    if (!body) return;
    setSending(true);
    const { error } = await supabase.from('ticket_messages').insert({ report_id: id, body });
    setSending(false);
    if (error) toast(friendlyError(error)); else setText('');
  }

  const bubble = (mine: boolean, who: string, body: string, at: string, key: string) => (
    <View key={key} style={{ alignSelf: mine ? 'flex-start' : 'flex-end', maxWidth: '85%', gap: 2 }}>
      <View style={{ backgroundColor: mine ? colors.ink : colors.card, borderRadius: 18, padding: 12 }}>
        <T size={11.5} color={mine ? 'rgba(255,255,255,.7)' : colors.muted}>{who}</T>
        <T color={mine ? '#fff' : colors.ink} size={15}>{body}</T>
      </View>
      <Muted size={10.5} style={{ color: colors.faint }}>{ago(at)}</Muted>
    </View>
  );

  return (
    <Screen footer={
      <Row gap={8}>
        <TextInput value={text} onChangeText={setText} placeholder="اكتب ردّك لخدمة العملاء…" placeholderTextColor={colors.faint} multiline
          style={[{ flex: 1, minHeight: 44, maxHeight: 120, backgroundColor: colors.card, borderRadius: 22, paddingHorizontal: 16, paddingVertical: 11, fontFamily: fonts.medium, fontSize: 15, color: colors.ink, textAlign: 'right' }, { outlineStyle: 'none' } as any]} />
        <Pressable onPress={send} disabled={sending || !text.trim()} accessibilityLabel="ابعت"
          style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: text.trim() ? colors.ink : colors.line, alignItems: 'center', justifyContent: 'center' }}>
          {sending ? <ActivityIndicator color="#fff" /> : <Icon name="send" size={18} color="#fff" />}
        </Pressable>
      </Row>
    }>
      <BackBar title={'شكوى T-' + t.ticket_no} onBack={back} />
      <Row gap={8}><Pill label={REPORT_CATEGORIES[t.category]} /><Pill label={TICKET_STATUS[t.status]} tone={t.status === 'resolved' ? 'good' : 'wait'} /></Row>
      <View style={{ gap: 10 }}>
        {bubble(true, 'انت', t.body, t.created_at, 'first')}
        {t.admin_reply ? bubble(false, 'خدمة العملاء', t.admin_reply, t.updated_at, 'old') : null}
        {data!.msgs.map((m) => bubble(m.sender_id === uid, m.sender_id === uid ? 'انت' : 'خدمة العملاء', m.body, m.created_at, m.id))}
      </View>
      {!data!.msgs.length && !t.admin_reply ? <Muted center>فريق خدمة العملاء هيرد عليك هنا، وهيوصلك إشعار.</Muted> : null}
      {t.status === 'resolved' ? <Muted center size={12}>الشكوى اتقفلت. لو المشكلة لسه موجودة اكتب رد وهتتفتح تاني.</Muted> : null}
    </Screen>
  );
}

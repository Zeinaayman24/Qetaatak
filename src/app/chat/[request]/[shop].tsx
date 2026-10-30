import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, ScrollView, TextInput, View } from 'react-native';
import { BackBar, Empty, Icon, Loading, Muted, Photo, Pill, Press, Row, Screen, T, toast } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { ago, ar, friendlyError, money, type Message, type Request, type Shop } from '@/lib/data';
import { must, useLive } from '@/lib/live';
import { pickPhoto, uploadPhoto } from '@/lib/photos';
import { photoUrl, supabase } from '@/lib/supabase';
import { colors, fonts, lift } from '@/lib/theme';

/** One conversation between a request's customer and one shop. */
export default function Chat() {
  const { request, shop } = useLocalSearchParams<{ request: string; shop: string }>();
  const { ready, session, profile } = useAuth();
  const uid = session?.user.id;
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);

  const { data, loading } = useLive(async () => {
    const req = must(await supabase.from('requests').select('*').eq('id', request).maybeSingle()) as Request | null;
    const sh = must(await supabase.from('shops').select('*').eq('id', shop).maybeSingle()) as Shop | null;
    const name = ((await supabase.rpc('shop_cards', { p_shops: [shop] })).data as { name: string }[] | null)?.[0]?.name ?? null;
    const msgs = must(await supabase.from('messages').select('*').eq('request_id', request).eq('shop_id', shop).order('created_at')) as Message[];
    const offers = ((await supabase.from('quotes').select('id, price').eq('request_id', request).eq('shop_id', shop).order('price')).data ?? []) as { id: string; price: number }[];
    const chosen = offers.find((q) => req && q.id === req.chosen_quote_id);
    return { req, sh, name, msgs, quote: chosen ?? offers[0] ?? null, offers: offers.length, deal: !!chosen };
  }, ['messages'], [request, shop]);

  // opening the chat (and every new message while it is open) marks it as read for the messages tab
  const count = data?.msgs.length ?? 0;
  useEffect(() => { if (uid && request && shop) supabase.rpc('mark_chat_read', { p_request: request, p_shop: shop }).then(() => {}); }, [uid, request, shop, count]);

  if (ready && !session) return <Redirect href="/login" />;
  if (loading && !data) return <Screen><Loading /></Screen>;
  const r = data?.req;
  const iAmShop = uid === shop;
  const title = iAmShop ? 'عميل في ' + (data?.req?.area ?? '') : data?.name ?? 'محل في ' + (data?.sh?.area ?? '');
  const back = () => (router.canGoBack() ? router.back() : router.replace('/messages'));

  async function send(photo?: string, preset?: string) {
    const body = (preset ?? text).trim();
    if (!body && !photo) return;
    setSending(true);
    try {
      const photo_path = photo ? await uploadPhoto(photo, uid!) : null;
      const { error } = await supabase.from('messages').insert({ request_id: request, shop_id: shop, body: photo ? '' : body, photo_path });
      if (error) throw error;
      if (!photo && !preset) setText('');
    } catch (x) { toast(friendlyError(x)); }
    finally { setSending(false); }
  }
  async function sendPhoto() {
    try { const uri = await pickPhoto(); if (uri) await send(uri); } catch { toast('الصورة دي مش مدعومة.'); }
  }

  const quick = iAmShop
    ? ['القطعة متوفرة أصلي', 'ابعتلي صورة القطعة القديمة', 'محتاج رقم الشاسيه', 'السعر نهائي']
    : ['لسه متوفرة؟', 'ابعتلي صورة للقطعة', 'أصلي ولا تجاري؟', 'ممكن توصيل النهارده؟'];
  const deal = !!data?.deal;

  const input = (
    <View style={{ gap: 10 }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {quick.map((q) => (
          <Press key={q} onPress={() => send(undefined, q)} style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1.5, borderColor: colors.line }}>
            <T size={12.5} w="medium">{q}</T>
          </Press>
        ))}
      </ScrollView>
      <Row gap={8}>
        <Press onPress={sendPhoto} label="ابعت صورة" style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: colors.soft, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="camera" size={21} />
        </Press>
        <TextInput value={text} onChangeText={setText} placeholder="اكتب رسالة…" placeholderTextColor={colors.faint}
          onSubmitEditing={() => send()} submitBehavior="submit" returnKeyType="send"
          style={[{ flex: 1, minHeight: 46, maxHeight: 120, backgroundColor: colors.soft, borderRadius: 18, paddingHorizontal: 16, paddingVertical: 11, fontFamily: fonts.medium, fontSize: 15, color: colors.ink, textAlign: 'right' }, { outlineStyle: 'none' } as any]} />
        <Press onPress={() => send()} disabled={sending || !text.trim()} label="ابعت"
          style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: text.trim() ? colors.accent : colors.soft, alignItems: 'center', justifyContent: 'center' }}>
          {sending ? <ActivityIndicator color={colors.ink} /> : <Icon name="arrow-up" size={20} color={text.trim() ? colors.ink : colors.faint} />}
        </Press>
      </Row>
    </View>
  );

  return (
    <Screen footer={input}>
      <BackBar title={title} onBack={back} right={deal ? <Pill label="أوردر مؤكد" tone="good" icon="checkmark" /> : undefined} />
      {r ? (
        <Press onPress={back} style={[{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface, borderRadius: 18, padding: 10 }, lift]}>
          <Photo uri={photoUrl(r.photo_path)} size={44} />
          <View style={{ flex: 1 }}>
            <T w="semibold" size={14}>{r.part}</T>
            <Muted size={12}>{r.car_make} {r.car_model} {ar(r.car_year)}{data?.quote ? (data.offers > 1 && !data.deal ? `، ${ar(data.offers)} عروض من ${money(data.quote.price)} ج.م` : `، عرض المحل ${money(data.quote.price)} ج.م`) : ''}</Muted>
          </View>
          <Icon name="chevron-back" size={16} color={colors.faint} />
        </Press>
      ) : null}
      {!deal ? (
        <Row gap={10} style={{ alignItems: 'flex-start', backgroundColor: colors.accentSoft, borderRadius: 16, padding: 12 }}>
          <Icon name="lock-closed" size={18} color={colors.accentDeep} />
          <T size={12.5} style={{ flex: 1 }}>قبل تأكيد الأوردر، الأرقام والإيميلات واللينكات وحسابات السوشيال بتتشال من الرسائل تلقائياً. اتعاملوا من خلال ضغطة عشان الضمان يكون محفوظ.</T>
        </Row>
      ) : null}
      {data?.msgs.length ? (
        <View style={{ gap: 8 }}>
          {data.msgs.map((m) => {
            const mine = m.sender_id === uid;
            return (
              <View key={m.id} style={{ alignSelf: mine ? 'flex-start' : 'flex-end', maxWidth: '82%', gap: 3 }}>
                <View style={[{ backgroundColor: mine ? colors.ink : colors.surface, borderRadius: 20, borderBottomRightRadius: mine ? 6 : 20, borderBottomLeftRadius: mine ? 20 : 6, padding: m.photo_path ? 4 : 12 }, !mine && lift]}>
                  {m.photo_path ? <Image source={{ uri: photoUrl(m.photo_path)! }} style={{ width: 200, height: 200, borderRadius: 16 }} /> : null}
                  {m.body ? <T color={mine ? '#fff' : colors.ink} size={15}>{m.body}</T> : null}
                </View>
                {m.flagged ? (
                  <Row gap={4} style={{ alignSelf: mine ? 'flex-start' : 'flex-end' }}><Icon name="eye-off" size={12} color={colors.bad} /><T size={11} color={colors.bad}>اتشال رقم أو لينك من الرسالة</T></Row>
                ) : null}
                <Muted size={10.5} style={{ textAlign: mine ? 'right' : 'left', color: colors.faint }}>{ago(m.created_at)}</Muted>
              </View>
            );
          })}
        </View>
      ) : <Empty icon="chatbubbles-outline" text={iAmShop ? 'اسأل العميل عن أي تفاصيل محتاجها.' : 'اسأل المحل عن حالة القطعة أو اطلب صور أكتر.'} />}
      {profile?.is_shop && !iAmShop ? <Muted center>المحادثة دي مش بتاعتك.</Muted> : null}
    </Screen>
  );
}

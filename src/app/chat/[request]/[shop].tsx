import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Image, Pressable, TextInput, View } from 'react-native';
import { BackBar, Empty, Icon, Loading, Muted, Photo, Row, Screen, T, toast } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { ago, ar, friendlyError, type Message, type Request, type Shop } from '@/lib/data';
import { must, useLive } from '@/lib/live';
import { pickPhoto, uploadPhoto } from '@/lib/photos';
import { photoUrl, supabase } from '@/lib/supabase';
import { colors, fonts } from '@/lib/theme';

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
    const msgs = must(await supabase.from('messages').select('*').eq('request_id', request).eq('shop_id', shop).order('created_at')) as Message[];
    return { req, sh, msgs };
  }, ['messages'], [request, shop]);

  if (ready && !session) return <Redirect href="/login" />;
  if (loading && !data) return <Screen><Loading /></Screen>;
  const r = data?.req;
  const iAmShop = uid === shop;
  const title = iAmShop ? 'العميل' : 'محل في ' + (data?.sh?.area ?? '');
  const back = () => (router.canGoBack() ? router.back() : router.replace(iAmShop ? `/shop/${request}` : `/customer/${request}`));

  async function send(photo?: string) {
    const body = text.trim();
    if (!body && !photo) return;
    setSending(true);
    try {
      const photo_path = photo ? await uploadPhoto(photo, uid!) : null;
      const { error } = await supabase.from('messages').insert({ request_id: request, shop_id: shop, body: photo ? '' : body, photo_path });
      if (error) throw error;
      if (!photo) setText('');
    } catch (x) { toast(friendlyError(x)); }
    finally { setSending(false); }
  }
  async function sendPhoto() {
    try { const uri = await pickPhoto(); if (uri) await send(uri); } catch { toast('الصورة دي مش مدعومة.'); }
  }

  const input = (
    <Row gap={8}>
      <Pressable onPress={sendPhoto} accessibilityLabel="ابعت صورة" hitSlop={6}
        style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="camera-outline" size={21} />
      </Pressable>
      <TextInput value={text} onChangeText={setText} placeholder="اكتب رسالة…" placeholderTextColor={colors.faint} multiline
        onSubmitEditing={() => send()} blurOnSubmit={false}
        style={[{ flex: 1, minHeight: 44, maxHeight: 120, backgroundColor: colors.card, borderRadius: 22, paddingHorizontal: 16, paddingVertical: 11, fontFamily: fonts.medium, fontSize: 15, color: colors.ink, textAlign: 'right' }, { outlineStyle: 'none' } as any]} />
      <Pressable onPress={() => send()} disabled={sending || !text.trim()} accessibilityLabel="ابعت"
        style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: text.trim() ? colors.ink : colors.line, alignItems: 'center', justifyContent: 'center' }}>
        {sending ? <ActivityIndicator color="#fff" /> : <Icon name="send" size={18} color="#fff" />}
      </Pressable>
    </Row>
  );

  return (
    <Screen footer={input}>
      <BackBar title={title} onBack={back} />
      {r ? (
        <Pressable onPress={back} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.card, borderRadius: 16, padding: 10 }}>
          <Photo uri={photoUrl(r.photo_path)} size={44} />
          <View style={{ flex: 1 }}>
            <T w="semibold" size={14}>{r.part}</T>
            <Muted size={12}>{r.car_make} {r.car_model} {ar(r.car_year)}</Muted>
          </View>
        </Pressable>
      ) : null}
      <Muted center size={12}>متبعتش أرقام تليفون أو تحويلات قبل ما العميل يختار العرض. كل حاجة مسجلة عشان أمانك.</Muted>
      {data?.msgs.length ? (
        <View style={{ gap: 8 }}>
          {data.msgs.map((m) => {
            const mine = m.sender_id === uid;
            return (
              <View key={m.id} style={{ alignSelf: mine ? 'flex-start' : 'flex-end', maxWidth: '82%', gap: 2 }}>
                <View style={{ backgroundColor: mine ? colors.ink : colors.card, borderRadius: 18, borderTopRightRadius: mine ? 4 : 18, borderTopLeftRadius: mine ? 18 : 4, padding: m.photo_path ? 4 : 12 }}>
                  {m.photo_path ? <Image source={{ uri: photoUrl(m.photo_path)! }} style={{ width: 200, height: 200, borderRadius: 14 }} /> : null}
                  {m.body ? <T color={mine ? '#fff' : colors.ink} size={15}>{m.body}</T> : null}
                </View>
                <Muted size={10.5} style={{ textAlign: mine ? 'right' : 'left', color: colors.faint }}>{ago(m.created_at)}</Muted>
              </View>
            );
          })}
        </View>
      ) : <Empty icon="💬" text={iAmShop ? 'اسأل العميل عن أي تفاصيل محتاجها.' : 'اسأل المحل عن حالة القطعة أو اطلب صور أكتر.'} />}
      {profile?.is_shop && !iAmShop ? <Muted center>المحادثة دي مش بتاعتك.</Muted> : null}
    </Screen>
  );
}

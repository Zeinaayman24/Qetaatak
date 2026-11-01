import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, Linking, Platform, View } from 'react-native';
import { ConfirmSheet } from '@/components/Confirm';
import { PaymentPanel } from '@/components/Payment';
import { ReceiptButton } from '@/components/ReceiptButton';
import { BackBar, Btn, Card, Chips, Empty, Field, Icon, Lines, Loading, Muted, Photo, Press, Row, Screen, Sheet, T, toast } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import {
  CONDITIONS, ORDER_LABEL, ORDER_STEP_NAME, warrantyLabel, orderStep, orderTitle, addressLine, ago, ar, friendlyError, money, orderNo, orderSteps,
  type Order, type Quote, type Request, type Shop, type ShopPrivate,
} from '@/lib/data';
import { must, useLive } from '@/lib/live';
import { needsPayment } from '@/lib/payments';
import { pickPhoto, uploadPhoto } from '@/lib/photos';
import { photoUrl, supabase } from '@/lib/supabase';
import { colors, lift } from '@/lib/theme';

type Data = { order: Order | null; parts: Request[]; quotes: Quote[]; shop: Shop | null; priv: ShopPrivate | null; code: string | null };

/** One order with one shop: live status, the shop, the parts, the receipt and the warranty. */
export default function OrderPage() {
  const { id, done } = useLocalSearchParams<{ id: string; done?: string }>();
  const { ready, session } = useAuth();
  const [busy, setBusy] = useState(false);
  const [stars, setStars] = useState(0);
  const [review, setReview] = useState('');
  const [ask, setAsk] = useState<'received' | 'cancel' | 'refuse' | null>(null);
  const [reason, setReason] = useState('');
  const [other, setOther] = useState('');
  const [refPhoto, setRefPhoto] = useState<string | null>(null);
  const { data, loading } = useLive<Data>(async () => {
    const order = must(await supabase.from('orders').select('*').eq('id', id).maybeSingle()) as Order | null;
    if (!order) return { order: null, parts: [], quotes: [], shop: null, priv: null, code: null };
    const parts = must(await supabase.from('requests').select('*').eq('order_id', id).order('num')) as Request[];
    const qids = parts.map((p) => p.chosen_quote_id).filter(Boolean) as string[];
    const [quotes, shop, priv, code] = await Promise.all([
      qids.length ? supabase.from('quotes').select('*').in('id', qids) : Promise.resolve({ data: [], error: null }),
      supabase.from('shops').select('*').eq('id', order.shop_id).maybeSingle(),
      supabase.from('shop_private').select('*').eq('id', order.shop_id).maybeSingle(),
      supabase.from('order_codes').select('code').eq('order_id', order.id).maybeSingle(),
    ]);
    return { order, parts, quotes: must(quotes as any) as Quote[], shop: shop.data as Shop | null, priv: priv.data as ShopPrivate | null, code: (code.data as { code: string } | null)?.code ?? null };
  }, ['orders', 'requests'], [id]);

  if (ready && !session) return <Redirect href="/login" />;
  const back = () => (router.canGoBack() ? router.back() : router.replace('/customer/requests'));
  if (loading && !data) return <Screen><Loading /></Screen>;
  const o = data?.order;
  if (!o) return <Screen><BackBar title="الأوردر" onBack={back} /><Empty text="الأوردر ده مش موجود." /></Screen>;
  const { parts, quotes, shop, priv } = data!;
  const steps = orderSteps(o.delivery_mode);
  const at = orderStep(o);
  const lbl = ORDER_LABEL[o.status];
  const quoteOf = (p: Request) => quotes.find((q) => q.id === p.chosen_quote_id);
  const warrantyDays = Math.max(0, ...quotes.map((q) => q.warranty_days));
  const warrantyEnd = o.received_at && warrantyDays > 0 ? new Date(new Date(o.received_at).getTime() + warrantyDays * 86400000) : null;
  const firstPart = parts[0];
  const unpaid = needsPayment(o);

  async function rpc(fn: string, args: Record<string, unknown>, ok: string) {
    setBusy(true);
    const { error } = await supabase.rpc(fn, args);
    setBusy(false);
    if (error) { toast(friendlyError(error)); return false; }
    setAsk(null); toast(ok); return true;
  }
  const isReady = ['ready', 'out_for_delivery', 'delivered'].includes(o.status);
  const total = Number(o.items_total) + Number(o.delivery_fee);
  async function refuse() {
    const why = reason === 'سبب تاني' ? other.trim() : reason;
    if (!why) return toast('اختار سبب الرفض.');
    setBusy(true);
    try {
      const path = refPhoto && session ? await uploadPhoto(refPhoto, session.user.id) : null;
      const { error } = await supabase.rpc('refuse_order', { p_order: o!.id, p_reason: why, p_photo: path });
      if (error) throw error;
      setAsk(null);
      toast(o!.payment_status === 'paid' ? `اتسجّل إنك رفضت القطعة. المحل لازم يرجّعلك ${money(total)} ج.م، وهنتابع معاه.` : 'اتسجّل إنك رفضت القطعة، ومش هتدفع حاجة. تقدر تختار عرض تاني.');
    } catch (e) { toast(friendlyError(e)); }
    setBusy(false);
  }

  const footer = o.status === 'cancelled' || unpaid ? undefined
    : isReady
      ? (
        <Row gap={10}>
          <Btn icon="checkmark-done" title="استلمت الأوردر" onPress={() => setAsk('received')} style={{ flex: 1 }} />
          <Btn kind="secondary" title="رفضت القطعة" onPress={() => setAsk('refuse')} style={{ minWidth: 120 }} />
        </Row>
      )
      : o.status === 'preparing' ? undefined
      : !o.rating
        ? <Btn title="ابعت التقييم" icon="star" disabled={!stars} loading={busy} onPress={() => rpc('rate_order', { p_order: o.id, p_rating: stars, p_review: review.trim() }, 'شكراً على تقييمك.')} />
        : undefined;

  return (
    <Screen footer={footer}>
      <BackBar title={'أوردر ' + orderNo(o.order_no)} onBack={back} />

      {/* live status */}
      <View style={{ backgroundColor: o.status === 'cancelled' ? colors.soft : o.status === 'received' ? colors.goodSoft : colors.ink, borderRadius: 20, padding: 18, gap: 18 }}>
        <Row gap={14}>
          <StatusIcon name={unpaid ? 'card' : lbl.icon} live={o.status !== 'received' && o.status !== 'cancelled'} tone={o.status === 'received' ? 'good' : o.status === 'cancelled' ? 'plain' : 'live'} />
          <View style={{ flex: 1 }}>
            <T w="bold" size={20} color={o.status === 'received' || o.status === 'cancelled' ? colors.ink : '#fff'}>{unpaid ? 'فاضل خطوة الدفع' : orderTitle(o)}</T>
            <T size={13} color={o.status === 'received' || o.status === 'cancelled' ? colors.muted : 'rgba(255,255,255,.7)'}>
              {o.delivery_mode === 'delivery' ? 'توصيل لعنوانك' : 'استلام من المحل'} · آخر تحديث {ago(o.updated_at)}
            </T>
          </View>
        </Row>
        {o.status !== 'cancelled' ? (
          <Row gap={6}>
            {steps.map((s, i) => {
              const done = i <= at;
              const dark = o.status !== 'received';
              return (
                <View key={s} style={{ flex: 1, gap: 6 }}>
                  <View style={{ height: 6, borderRadius: 3, backgroundColor: done ? colors.accent : dark ? 'rgba(255,255,255,.15)' : colors.line }} />
                  <T size={11.5} w={i === at ? 'bold' : 'regular'} color={dark ? (done ? '#fff' : 'rgba(255,255,255,.5)') : colors.ink}>{ORDER_STEP_NAME[s]}</T>
                </View>
              );
            })}
          </Row>
        ) : null}
      </View>

      {done && o.status !== 'cancelled' ? (
        <Row gap={10} style={{ backgroundColor: colors.goodSoft, borderRadius: 16, padding: 14 }}>
          <Icon name="checkmark-circle" size={24} color={colors.good} />
          <View style={{ flex: 1 }}><T w="bold" size={15}>الأوردر اتأكد.</T><Muted size={12.5}>إيصالك جاهز، حمّله من تحت.</Muted></View>
        </Row>
      ) : null}
      {o.status !== 'cancelled' ? <ReceiptButton orderId={o.id} /> : null}

      {data!.code && o.status !== 'received' && o.status !== 'cancelled' ? (
        <View style={{ backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1.5, borderColor: colors.primary, padding: 16, gap: 8, alignItems: 'center' }}>
          <Row gap={6}><Icon name="lock-closed" size={16} color={colors.primary} /><T w="semibold" size={13.5} color={colors.primary}>كود الاستلام</T></Row>
          <T w="bold" size={40} style={{ letterSpacing: 10, lineHeight: 52, writingDirection: 'ltr' }} selectable>{ar(data!.code)}</T>
          <Muted size={12.5} center>افحص القطعة كويس الأول. لو زي العرض، ادّي الكود للمحل أو المندوب. بعد الكود، الاسترجاع بيكون مع المحل حسب القانون.</Muted>
          <Muted size={12} center>اتأكد من: الموديل · الجهة · الحالة · زي صورة العرض</Muted>
        </View>
      ) : null}

      {o.refused_at ? (
        <Row gap={10} style={{ backgroundColor: colors.soft, borderRadius: 16, padding: 14, alignItems: 'flex-start' }}>
          <Icon name="hand-left" size={20} color={colors.muted} />
          <View style={{ flex: 1 }}>
            <T w="semibold" size={14}>رفضت القطعة: {o.refusal_reason}</T>
            {o.payment_status === 'unpaid' ? <Muted size={12.5}>اتسجّل إنك رفضت القطعة، ومش هتدفع حاجة. تقدر تختار عرض تاني.</Muted> : null}
          </View>
        </Row>
      ) : null}
      <PaymentPanel order={o} shop={priv} />

      {/* the shop */}
      {o.status !== 'cancelled' ? (
        <Card>
          <Row gap={12}>
            <View style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}><Icon name="storefront" size={24} color={colors.primary} /></View>
            <View style={{ flex: 1 }}>
              <T w="bold" size={16}>{priv?.name ?? 'المحل'}</T>
              <Muted size={12.5}>{shop?.area}، {shop?.governorate}</Muted>
            </View>
            <Press onPress={() => router.push(`/shop-profile/${o.shop_id}`)} label="صفحة المحل" hitSlop={6}><Icon name="information-circle-outline" size={24} color={colors.muted} /></Press>
          </Row>
          <Row gap={10}>
            {priv?.phone ? <Btn kind="dark" icon="call" title="اتصل" onPress={() => Linking.openURL('tel:' + priv.phone)} style={{ flex: 1 }} /> : null}
            {firstPart ? <Btn kind="secondary" icon="chatbubble-ellipses" title="رسالة" onPress={() => router.push(`/chat/${firstPart.id}/${o.shop_id}`)} style={{ flex: 1, minHeight: 46 }} /> : null}
          </Row>
          {o.delivery_mode === 'pickup' && priv ? (
            <Row gap={8} style={{ alignItems: 'flex-start' }}><Icon name="location" size={16} color={colors.muted} />
              <Muted size={13} style={{ flex: 1 }}>{addressLine({ street: priv.street, building: priv.building, area: shop?.area, governorate: shop?.governorate })}{priv.landmark ? ` (${priv.landmark})` : ''} · قول للمحل رقم الأوردر {orderNo(o.order_no)}</Muted></Row>
          ) : null}
          {o.delivery_mode === 'delivery' && o.delivery_address ? (
            <Row gap={8} style={{ alignItems: 'flex-start' }}><Icon name="location" size={16} color={colors.muted} />
              <Muted size={13} style={{ flex: 1 }}>التوصيل على: {addressLine(o.delivery_address)}{o.delivery_address.landmark ? ` (${o.delivery_address.landmark})` : ''}</Muted></Row>
          ) : null}
        </Card>
      ) : null}

      {/* parts + receipt */}
      <Card>
        <T w="bold" size={16}>القطع ({ar(parts.length)})</T>
        {parts.map((p) => {
          const q = quoteOf(p);
          return (
            <Row key={p.id} gap={12}>
              <Photo uri={photoUrl(q?.photo_path ?? p.photo_path)} size={48} />
              <View style={{ flex: 1 }}>
                <T w="semibold" size={14.5}>{p.part}{q?.brand ? ` (${q.brand})` : ''}{p.qty > 1 ? ` × ${ar(p.qty)}` : ''}</T>
                <Muted size={12}>{q ? `${CONDITIONS[q.condition]} · ${warrantyLabel(q.warranty_days)}` : ''}</Muted>
              </View>
              {q ? <T w="semibold" size={14}>{money(q.price * (p.qty || 1))} ج.م</T> : null}
            </Row>
          );
        })}
        <View style={{ height: 1, backgroundColor: colors.line }} />
        <Lines rows={[['القطع', money(o.items_total) + ' ج.م'], ['التوصيل', o.delivery_fee ? money(o.delivery_fee) + ' ج.م' : 'مجاناً']]} total={['الإجمالي', money(Number(o.items_total) + Number(o.delivery_fee)) + ' ج.م']} />
      </Card>

      {!warrantyEnd && o.status !== 'cancelled' ? (
        <Row gap={12} style={{ backgroundColor: colors.primarySoft, borderRadius: 16, padding: 16, alignItems: 'flex-start' }}>
          <Icon name="shield-checkmark" size={24} color={colors.primary} />
          <View style={{ flex: 1 }}>
            <T w="bold" size={14.5}>افحص قبل ما تستلم</T>
            <Muted size={12.5}>افحصها كويس قبل ما تدّي الكود: الموديل، الجهة، الحالة، وإنها زي صورة العرض. لو مش زي العرض ارفضها. بعد الاستلام، الاسترجاع بيكون مع المحل حسب القانون.</Muted>
          </View>
        </Row>
      ) : null}
      {warrantyEnd ? (
        <Row gap={12} style={{ backgroundColor: colors.goodSoft, borderRadius: 16, padding: 16 }}>
          <Icon name="shield-checkmark" size={26} color={colors.good} />
          <View style={{ flex: 1 }}>
            <T w="bold" size={14.5}>ضمان المحل لحد {warrantyEnd.toLocaleDateString('ar-EG', { day: 'numeric', month: 'long' })}</T>
            <Muted size={12.5}>لو ظهر عيب في القطعة خلال المدة دي، كلّم المحل. ولو مردّش، بلّغنا وهنوصّل شكوتك للمحل.</Muted>
          </View>
        </Row>
      ) : null}

      {o.status === 'received' ? (
        o.rating ? (
          <Card>
            <Row gap={4}>{[1, 2, 3, 4, 5].map((n) => <Icon key={n} name="star" size={22} color={o.rating! >= n ? colors.accent : colors.line} />)}</Row>
            {o.review ? <T size={14}>«{o.review}»</T> : <Muted>شكراً على تقييمك.</Muted>}
          </Card>
        ) : (
          <Card>
            <T w="bold" size={17}>إيه رأيك في المحل؟</T>
            <Row gap={8} style={{ justifyContent: 'center' }}>
              {[1, 2, 3, 4, 5].map((n) => (
                <Press key={n} onPress={() => setStars(n)} label={ar(n) + ' نجوم'} hitSlop={4}>
                  <Icon name={stars >= n ? 'star' : 'star-outline'} size={40} color={stars >= n ? colors.accent : colors.faint} />
                </Press>
              ))}
            </Row>
            <Field value={review} onChangeText={setReview} multiline placeholder="اكتب رأيك في المحل والقطع (اختياري)" />
          </Card>
        )
      ) : null}

      <View style={{ gap: 4, alignItems: 'center' }}>
        {firstPart ? <Btn kind="link" title="عندك مشكلة في الأوردر؟" onPress={() => router.push({ pathname: '/assistant', params: { mode: 'complaint', request: firstPart.id } })} /> : null}
        {o.status === 'preparing' ? <Btn kind="link" title="إلغاء الأوردر" onPress={() => setAsk('cancel')} /> : null}
      </View>

      <ConfirmSheet open={ask === 'received'} title="اتأكدت إن القطعة زي العرض؟" body="بعد التأكيد، الاسترجاع بيكون مع المحل حسب القانون." yes="أيوه، استلمت" busy={busy}
        onYes={() => rpc('receive_order', { p_order: o.id }, 'تمام. إيه رأيك في المحل؟')} onClose={() => setAsk(null)} />
      <ConfirmSheet open={ask === 'cancel'} title="تلغي الأوردر؟" body="القطع هترجع للطلب وتقدر تختار عرض تاني." yes="أيوه، الغي" danger busy={busy}
        onYes={() => rpc('cancel_order', { p_order: o.id }, 'الأوردر اتلغى. تقدر تختار عرض تاني.')} onClose={() => setAsk(null)} />
      <Sheet open={ask === 'refuse'} onClose={() => setAsk(null)} title="ليه رفضتها؟">
        <View style={{ gap: 14 }}>
          <Chips options={['موديل غلط', 'جهة غلط', 'حالتها مش زي العرض', 'مش زي الصورة', 'سبب تاني'].map((v) => ({ v, label: v }))} selected={[reason]} onPick={setReason} />
          {reason === 'سبب تاني' ? <Field value={other} onChangeText={setOther} placeholder="اكتب السبب" /> : null}
          <Press onPress={async () => { try { const u = await pickPhoto(); if (u) setRefPhoto(u); } catch { toast('الصورة دي مش مدعومة. اختار صورة JPG أو PNG.'); } }}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: 16, borderWidth: 1.5, borderStyle: 'dashed', borderColor: refPhoto ? colors.good : colors.line }}>
            {refPhoto ? <Image source={{ uri: refPhoto }} style={{ width: 44, height: 44, borderRadius: 10 }} /> : (
              <View style={{ width: 44, height: 44, borderRadius: 10, backgroundColor: colors.soft, alignItems: 'center', justifyContent: 'center' }}><Icon name="camera" size={20} /></View>
            )}
            <T size={13.5} w="medium" style={{ flex: 1 }}>{refPhoto ? 'الصورة اتضافت · تغيير' : 'أضف صورة (اختياري)'}</T>
          </Press>
          <Btn kind="danger" title="تأكيد الرفض" loading={busy} disabled={!reason} onPress={refuse} />
        </View>
      </Sheet>
    </Screen>
  );
}

function StatusIcon({ name, live, tone }: { name: string; live: boolean; tone: 'live' | 'good' | 'plain' }) {
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!live) return;
    const loop = Animated.loop(Animated.timing(a, { toValue: 1, duration: 1600, easing: Easing.out(Easing.quad), useNativeDriver: Platform.OS !== 'web' }));
    loop.start(); return () => loop.stop();
  }, [a, live]);
  const bg = tone === 'live' ? colors.accent : tone === 'good' ? colors.good : colors.faint;
  return (
    <View style={{ width: 60, height: 60, alignItems: 'center', justifyContent: 'center' }}>
      {live ? <Animated.View style={{ position: 'absolute', width: 60, height: 60, borderRadius: 30, backgroundColor: bg, opacity: a.interpolate({ inputRange: [0, 1], outputRange: [0.4, 0] }), transform: [{ scale: a.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1.4] }) }] }} /> : null}
      <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={name} size={26} color={tone === 'live' ? colors.ink : '#fff'} />
      </View>
    </View>
  );
}

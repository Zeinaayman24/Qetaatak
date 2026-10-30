import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Linking, Platform, View } from 'react-native';
import { PaymentPanel } from '@/components/Payment';
import { BackBar, Btn, Card, Empty, Field, Icon, Lines, Loading, Muted, Photo, Pill, Plate, Press, Row, Screen, T, toast } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import {
  CONDITIONS, ORDER_LABEL, ORDER_STEP_NAME, orderStep, orderTitle, addressLine, ago, ar, friendlyError, money, orderNo, orderSteps,
  type Order, type Quote, type Request, type Shop, type ShopPrivate,
} from '@/lib/data';
import { must, useLive } from '@/lib/live';
import { needsPayment } from '@/lib/payments';
import { photoUrl, supabase } from '@/lib/supabase';
import { colors, lift } from '@/lib/theme';

type Data = { order: Order | null; parts: Request[]; quotes: Quote[]; shop: Shop | null; priv: ShopPrivate | null };

/** One order with one shop: live status, the shop, the parts, the receipt and the warranty. */
export default function OrderPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { ready, session } = useAuth();
  const [busy, setBusy] = useState(false);
  const [stars, setStars] = useState(0);
  const [review, setReview] = useState('');
  const { data, loading } = useLive<Data>(async () => {
    const order = must(await supabase.from('orders').select('*').eq('id', id).maybeSingle()) as Order | null;
    if (!order) return { order: null, parts: [], quotes: [], shop: null, priv: null };
    const parts = must(await supabase.from('requests').select('*').eq('order_id', id).order('num')) as Request[];
    const qids = parts.map((p) => p.chosen_quote_id).filter(Boolean) as string[];
    const [quotes, shop, priv] = await Promise.all([
      qids.length ? supabase.from('quotes').select('*').in('id', qids) : Promise.resolve({ data: [], error: null }),
      supabase.from('shops').select('*').eq('id', order.shop_id).maybeSingle(),
      supabase.from('shop_private').select('*').eq('id', order.shop_id).maybeSingle(),
    ]);
    return { order, parts, quotes: must(quotes as any) as Quote[], shop: shop.data as Shop | null, priv: priv.data as ShopPrivate | null };
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
  const warrantyEnd = o.received_at ? new Date(new Date(o.received_at).getTime() + warrantyDays * 86400000) : null;
  const firstPart = parts[0];
  const unpaid = needsPayment(o);

  async function rpc(fn: string, args: Record<string, unknown>, ok: string) {
    setBusy(true);
    const { error } = await supabase.rpc(fn, args);
    setBusy(false);
    if (error) { toast(friendlyError(error)); return false; }
    toast(ok); return true;
  }

  const footer = o.status === 'cancelled' || unpaid ? undefined
    : o.status !== 'received'
      ? <Btn kind={o.status === 'preparing' ? 'secondary' : 'primary'} icon="checkmark-done" loading={busy}
          title="استلمت الأوردر" onPress={() => rpc('receive_order', { p_order: o.id }, 'تمام! قيّم المحل لو سمحت')} />
      : !o.rating
        ? <Btn title="ابعت التقييم" icon="star" disabled={!stars} loading={busy} onPress={() => rpc('rate_order', { p_order: o.id, p_rating: stars, p_review: review.trim() }, 'شكراً على تقييمك')} />
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
              {o.delivery_mode === 'delivery' ? 'توصيل للبيت' : 'استلام من المحل'}، آخر تحديث {ago(o.updated_at)}
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
              <Muted size={13} style={{ flex: 1 }}>{addressLine({ street: priv.street, building: priv.building, area: shop?.area, governorate: shop?.governorate })}{priv.landmark ? ` (${priv.landmark})` : ''}، قول للمحل رقم الأوردر {orderNo(o.order_no)}</Muted></Row>
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
                <T w="semibold" size={14.5}>{p.part}{p.qty > 1 ? ` × ${ar(p.qty)}` : ''}</T>
                <Muted size={12}>{q ? `${CONDITIONS[q.condition]}، ضمان ${ar(q.warranty_days)} يوم` : ''}</Muted>
              </View>
              {q ? <T w="semibold" size={14}>{money(q.price * (p.qty || 1))} ج.م</T> : null}
            </Row>
          );
        })}
        <View style={{ height: 1, backgroundColor: colors.line }} />
        <Lines rows={[['القطع', money(o.items_total) + ' ج.م'], ['التوصيل', o.delivery_fee ? money(o.delivery_fee) + ' ج.م' : 'مجاناً']]} total={['الإجمالي', money(Number(o.items_total) + Number(o.delivery_fee)) + ' ج.م']} />
      </Card>

      {warrantyEnd ? (
        <Row gap={12} style={{ backgroundColor: colors.goodSoft, borderRadius: 16, padding: 16 }}>
          <Icon name="shield-checkmark" size={26} color={colors.good} />
          <View style={{ flex: 1 }}>
            <T w="bold" size={14.5}>الضمان شغال لحد {warrantyEnd.toLocaleDateString('ar-EG', { day: 'numeric', month: 'long' })}</T>
            <Muted size={12.5}>لو قطعة مركبتش أو فيها عيب، المحل يبدّلها أو يرجّع فلوسها.</Muted>
          </View>
        </Row>
      ) : null}

      {o.status === 'received' ? (
        o.rating ? (
          <Card>
            <Row gap={4}>{[1, 2, 3, 4, 5].map((n) => <Icon key={n} name="star" size={22} color={o.rating! >= n ? colors.accent : colors.line} />)}</Row>
            {o.review ? <T size={14}>«{o.review}»</T> : <Muted>قيّمت المحل. شكراً!</Muted>}
          </Card>
        ) : (
          <Card>
            <T w="bold" size={17}>القطع ركبت تمام؟ قيّم المحل</T>
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
        {o.status === 'preparing' ? <Btn kind="link" title="إلغاء الأوردر (والرجوع للعروض)" loading={busy} onPress={() => rpc('cancel_order', { p_order: o.id }, 'الأوردر اتلغى؛ تقدر تختار عرض تاني')} /> : null}
      </View>
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

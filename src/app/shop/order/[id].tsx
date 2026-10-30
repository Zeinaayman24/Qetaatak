import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Linking, View } from 'react-native';
import { ReceiptButton } from '@/components/ReceiptButton';
import { BackBar, Btn, Card, Empty, Field, Icon, Lines, Loading, Muted, Photo, Pill, Row, Screen, T, toast } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import {
  CONDITIONS, ORDER_LABEL, warrantyLabel, ORDER_STEP_NAME, orderStep, addressLine, ago, ar, friendlyError, money, orderNo, orderSteps,
  type Order, type Profile, type Quote, type Request,
} from '@/lib/data';
import { must, useLive } from '@/lib/live';
import { PAY_NAME, PAY_STATUS } from '@/lib/payments';
import { ShopPaymentReview } from '@/components/Payment';
import { photoUrl, supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';

/** The shop's side of an order: one big button that moves it to the next step. */
export default function ShopOrder() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { ready, session } = useAuth();
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState('');
  const { data, loading } = useLive(async () => {
    const order = must(await supabase.from('orders').select('*').eq('id', id).maybeSingle()) as Order | null;
    if (!order) return { order: null, parts: [] as Request[], quotes: [] as Quote[], customer: null as Profile | null };
    const parts = must(await supabase.from('requests').select('*').eq('order_id', id).order('num')) as Request[];
    const qids = parts.map((p) => p.chosen_quote_id).filter(Boolean) as string[];
    const quotes = qids.length ? (must(await supabase.from('quotes').select('*').in('id', qids)) as Quote[]) : [];
    const customer = must(await supabase.from('profiles').select('*').eq('id', order.customer_id).maybeSingle()) as Profile | null;
    return { order, parts, quotes, customer };
  }, ['orders', 'requests'], [id]);

  if (ready && !session) return <Redirect href="/login" />;
  const back = () => (router.canGoBack() ? router.back() : router.replace('/shop'));
  if (loading && !data) return <Screen><Loading /></Screen>;
  const o = data?.order;
  if (!o) return <Screen><BackBar title="الأوردر" onBack={back} /><Empty text="الأوردر ده مش موجود." /></Screen>;
  const { parts, quotes, customer: c } = data!;
  const steps = orderSteps(o.delivery_mode);
  const at = orderStep(o);
  const next = o.status === 'preparing' ? 'ready' : null;
  const nextLabel = o.delivery_mode === 'delivery' ? 'الأوردر جاهز، خارج للعميل' : 'الأوردر جاهز، العميل ييجي يستلم';
  const total = Number(o.items_total);
  const waitPay = (o.payment_method === 'instapay' || o.payment_method === 'card') && o.payment_status !== 'paid' && o.status !== 'cancelled';

  async function closeWithCode() {
    if (!code.trim()) return toast('اكتب الكود اللي العميل ادهولك');
    setBusy(true);
    const { data: res, error } = await supabase.rpc('confirm_receipt', { p_order: o!.id, p_code: code });
    setBusy(false);
    if (error) return toast(friendlyError(error));
    if (res === 'ok') { setCode(''); toast('تمام! الأوردر اتقفل إنه اتسلّم'); }
    else if (res === 'locked') toast('محاولات غلط كتير. استنى ربع ساعة وجرّب تاني.');
    else toast('الكود غلط. اتأكد من العميل وجرّب تاني.');
  }

  async function move() {
    if (!next) return;
    setBusy(true);
    const { error } = await supabase.rpc('set_order_status', { p_order: o!.id, p_status: next });
    setBusy(false);
    if (error) toast(friendlyError(error)); else toast('بلّغنا العميل إن الأوردر جاهز');
  }

  const footer = waitPay && o.payment_method === 'card'
    ? <Row gap={10} style={{ backgroundColor: colors.warnSoft, borderRadius: 14, padding: 14 }}><Icon name="hourglass" size={20} color={colors.warn} /><T size={14} w="semibold" color={colors.warn} style={{ flex: 1 }}>مستنيين العميل يدفع أونلاين. هنبلّغك أول ما الدفع يتأكد.</T></Row>
    : waitPay ? undefined
    : next && o.status !== 'cancelled' ? <Btn icon="arrow-back-circle" title={nextLabel} loading={busy} onPress={move} /> : undefined;

  return (
    <Screen footer={footer}>
      <BackBar title={'أوردر ' + orderNo(o.order_no)} onBack={back} right={<Pill label={ORDER_LABEL[o.status].short} tone={o.status === 'received' ? 'good' : o.status === 'cancelled' ? 'plain' : 'new'} />} />

      <View style={{ backgroundColor: colors.ink, borderRadius: 20, padding: 18, gap: 16 }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <View>
            <T size={12.5} color="rgba(255,255,255,.65)">قيمة الأوردر ليك</T>
            <T w="bold" size={30} color="#fff">{money(total + Number(o.delivery_fee))} <T size={14} color="rgba(255,255,255,.6)">ج.م</T></T>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <T size={12.5} color="rgba(255,255,255,.65)">{o.delivery_mode === 'delivery' ? 'توصيل للعميل' : 'العميل جاي يستلم'}</T>
            <T size={12.5} color="rgba(255,255,255,.65)">{ago(o.created_at)}</T>
          </View>
        </Row>
        {o.status !== 'cancelled' ? (
          <Row gap={6}>
            {steps.map((s, i) => (
              <View key={s} style={{ flex: 1, gap: 6 }}>
                <View style={{ height: 6, borderRadius: 3, backgroundColor: i <= at ? colors.accent : 'rgba(255,255,255,.15)' }} />
                <T size={11.5} w={i === at ? 'bold' : 'regular'} color={i <= at ? '#fff' : 'rgba(255,255,255,.5)'}>{ORDER_STEP_NAME[s]}</T>
              </View>
            ))}
          </Row>
        ) : <T color="#fff">العميل لغى الأوردر ده.</T>}
      </View>

      <ShopPaymentReview order={o} />

      {!waitPay && o.status !== 'received' && o.status !== 'cancelled' ? (
        <Card>
          <Row gap={8}><Icon name="lock-closed" size={18} color={colors.primary} /><T w="bold" size={15}>سلّمت الأوردر؟ اكتب كود الاستلام</T></Row>
          <Muted size={12.5}>العميل معاه كود من ٤ أرقام في صفحة الأوردر. خده منه بعد ما يستلم القطع ويتأكد منها، واكتبه هنا عشان الأوردر يتقفل.</Muted>
          <Row gap={10} style={{ alignItems: 'flex-end' }}>
            <View style={{ flex: 1 }}><Field value={code} onChangeText={setCode} keyboardType="number-pad" ltr big placeholder="٠٠٠٠" /></View>
            <Btn icon="checkmark-done" title="اتسلّم" loading={busy} onPress={closeWithCode} style={{ minWidth: 110 }} />
          </Row>
        </Card>
      ) : null}

      <Card>
        <T w="bold" size={16}>جهّز القطع دي ({ar(parts.length)})</T>
        {parts.map((p) => {
          const q = quotes.find((x) => x.id === p.chosen_quote_id);
          return (
            <Row key={p.id} gap={12}>
              <Photo uri={photoUrl(q?.photo_path ?? p.photo_path)} size={48} />
              <View style={{ flex: 1 }}>
                <T w="semibold" size={14.5}>{p.part}{q?.brand ? ` (${q.brand})` : ''}{p.qty > 1 ? ` × ${ar(p.qty)}` : ''}</T>
                <Muted size={12}>{p.car_make} {p.car_model} {ar(p.car_year)}{q ? `، ${CONDITIONS[q.condition]}، ${warrantyLabel(q.warranty_days)}` : ''}</Muted>
              </View>
              {q ? <T w="semibold" size={14}>{money(q.price * (p.qty || 1))}</T> : null}
            </Row>
          );
        })}
        <View style={{ height: 1, backgroundColor: colors.line }} />
        <Lines rows={[['القطع', money(total) + ' ج.م'], ['التوصيل', Number(o.delivery_fee) ? money(Number(o.delivery_fee)) + ' ج.م' : 'استلام من المحل']]} total={['الإجمالي من العميل', money(total + Number(o.delivery_fee)) + ' ج.م']} />
        <Row style={{ justifyContent: 'space-between' }}>
          <Muted size={13}>الدفع: {PAY_NAME[o.payment_method]}</Muted>
          <Pill label={o.payment_method === 'cash' && o.payment_status === 'unpaid' ? 'اتحصّل كاش عند التسليم' : o.payment_method === 'shop' && o.payment_status === 'unpaid' ? 'هيدفع في المحل' : o.payment_status === 'review' ? 'محتاج تأكيدك' : PAY_STATUS[o.payment_status].label} tone={PAY_STATUS[o.payment_status].tone} />
        </Row>
        <Muted size={12}>اكتب رقم الأوردر {orderNo(o.order_no)} على الكيس.</Muted>
      </Card>

      {o.status !== 'cancelled' ? <ReceiptButton orderId={o.id} /> : null}

      {c && o.status !== 'cancelled' ? (
        <Card>
          <Row gap={12}>
            <View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: colors.soft, alignItems: 'center', justifyContent: 'center' }}><Icon name="person" size={22} /></View>
            <View style={{ flex: 1 }}><T w="bold" size={15}>{c.full_name}</T><Muted size={12.5}>العميل</Muted></View>
          </Row>
          <Row gap={10}>
            <Btn kind="dark" icon="call" title="اتصل" onPress={() => Linking.openURL('tel:' + c.phone)} style={{ flex: 1 }} />
            {parts[0] ? <Btn kind="secondary" icon="chatbubble-ellipses" title="رسالة" onPress={() => router.push(`/chat/${parts[0].id}/${o.shop_id}`)} style={{ flex: 1, minHeight: 46 }} /> : null}
          </Row>
          {o.delivery_mode === 'delivery' ? (
            <Row gap={8} style={{ alignItems: 'flex-start' }}><Icon name="location" size={16} color={colors.muted} />
              <Muted size={13} style={{ flex: 1 }}>{addressLine(c)}{c.landmark ? ` (${c.landmark})` : ''}</Muted></Row>
          ) : null}
        </Card>
      ) : null}

      {o.status === 'received' ? (
        <Card style={{ backgroundColor: colors.goodSoft }}>
          <T w="bold" size={15}>العميل استلم الأوردر{o.rating ? ` وقيّمك ${ar(o.rating)} من ٥` : ''}</T>
          {o.rating ? <Row gap={3}>{[1, 2, 3, 4, 5].map((n) => <Icon key={n} name="star" size={18} color={o.rating! >= n ? colors.accent : colors.line} />)}</Row> : null}
          {o.review ? <T size={14}>«{o.review}»</T> : null}
        </Card>
      ) : o.status !== 'preparing' && o.status !== 'cancelled' ? <Muted center>بعد ما تسلّم، اكتب كود الاستلام اللي مع العميل عشان الأوردر يتقفل.</Muted> : null}
    </Screen>
  );
}

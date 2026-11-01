import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Linking, View } from 'react-native';
import { ReceiptButton } from '@/components/ReceiptButton';
import { BackBar, Btn, Card, Chips, Empty, Field, Icon, Lines, Loading, Muted, Photo, Pill, Row, Screen, Sheet, T, toast } from '@/components/ui';
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
  const { ready, session, shop } = useAuth();
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState('');
  const [other, setOther] = useState('');
  const [disputing, setDisputing] = useState(false);
  const [disputeText, setDisputeText] = useState('');
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
    if (!code.trim()) return toast('اكتب الكود اللي العميل ادّاهولك.');
    setBusy(true);
    const { data: res, error } = await supabase.rpc('confirm_receipt', { p_order: o!.id, p_code: code });
    setBusy(false);
    if (error) return toast(friendlyError(error));
    if (res === 'ok') { setCode(''); toast('تمام! الأوردر اتقفل إنه اتسلّم.'); }
    else if (res === 'locked') toast('محاولات غلط كتير. استنى ربع ساعة وجرّب تاني.');
    else toast('الكود غلط. اتأكد من العميل وجرّب تاني.');
  }

  async function move() {
    if (!next) return;
    setBusy(true);
    const { error } = await supabase.rpc('set_order_status', { p_order: o!.id, p_status: next });
    setBusy(false);
    if (error) toast(friendlyError(error)); else toast('بلّغنا العميل إن الأوردر جاهز.');
  }
  async function shopCancel() {
    const why = reason === 'سبب تاني' ? other.trim() : reason;
    if (!why) return toast('اختار السبب.');
    setBusy(true);
    const { error } = await supabase.rpc('shop_cancel_order', { p_order: o!.id, p_reason: why });
    setBusy(false);
    if (error) return toast(friendlyError(error));
    setCancelling(false); toast('الأوردر اتلغى.');
  }
  // free for shops for 6 months from approval (B16; final length still to be decided)
  const freeUntil = new Date(shop?.approved_at ?? shop?.created_at ?? Date.now());
  freeUntil.setMonth(freeUntil.getMonth() + 6);
  const free = new Date(o.created_at) < freeUntil;
  const addr = o.delivery_address;
  const refundLeft = (() => {
    const ms = Math.max(0, new Date(o.refund_due_at ?? o.updated_at).getTime() + 48 * 3600000 - Date.now());
    return ms >= 3600000 ? `${ar(Math.floor(ms / 3600000))} ساعة` : `${ar(Math.max(1, Math.ceil(ms / 60000)))} دقيقة`;
  })();
  const byShop = (o.cancel_reason ?? '').startsWith('shop: ');

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
            <T size={12.5} color="rgba(255,255,255,.65)">قيمة الأوردر</T>
            <T w="bold" size={30} color="#fff">{money(total + Number(o.delivery_fee))} <T size={14} color="rgba(255,255,255,.6)">ج.م</T></T>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <T size={12.5} color="rgba(255,255,255,.65)">{o.delivery_mode === 'delivery' ? 'توصيل للعميل' : 'العميل جاي يستلم'}</T>
            <T size={12.5} color="rgba(255,255,255,.65)">{ago(o.created_at)}</T>
          </View>
        </Row>
        {free ? <T size={12.5} color="rgba(255,255,255,.75)">عمولة ضغطة: مجاناً في الفترة دي</T> : null}
        {o.status !== 'cancelled' ? (
          <Row gap={6}>
            {steps.map((s, i) => (
              <View key={s} style={{ flex: 1, gap: 6 }}>
                <View style={{ height: 6, borderRadius: 3, backgroundColor: i <= at ? colors.accent : 'rgba(255,255,255,.15)' }} />
                <T size={11.5} w={i === at ? 'bold' : 'regular'} color={i <= at ? '#fff' : 'rgba(255,255,255,.5)'}>{ORDER_STEP_NAME[s]}</T>
              </View>
            ))}
          </Row>
        ) : <T color="#fff">{byShop ? `لغيت الأوردر ده: ${o.cancel_reason!.slice(6)}` : o.refused_at ? 'العميل رفض القطعة' : 'العميل لغى الأوردر ده.'}</T>}
      </View>

      {o.refused_at ? (
        <Card style={{ backgroundColor: colors.badSoft }}>
          <T w="bold" size={15} color={colors.bad}>العميل رفض القطعة</T>
          <T size={14}>السبب: {o.refusal_reason}</T>
          {(o as Order & { refusal_photo?: string | null }).refusal_photo ? <Photo uri={photoUrl((o as Order & { refusal_photo?: string | null }).refusal_photo!)} size={96} /> : null}
          {o.payment_status === 'refund_due' ? <Muted size={13}>لو العميل كان حوّل، رجّع {money(total + Number(o.delivery_fee))} ج.م خلال {refundLeft}.</Muted> : null}
          {(o as Order & { dispute_note?: string }).dispute_note ? <Muted size={13}>اعتراضك: {(o as Order & { dispute_note?: string }).dispute_note}</Muted>
            : <Row gap={6}><Muted size={13}>لو شايف الرفض مش في محله</Muted><Btn kind="link" title="اعترض" onPress={() => setDisputing(true)} /></Row>}
        </Card>
      ) : null}

      <ShopPaymentReview order={o} />

      {!waitPay && o.status !== 'received' && o.status !== 'cancelled' ? (
        <Card>
          <Row gap={8}><Icon name="lock-closed" size={18} color={colors.primary} /><T w="bold" size={15}>سلّمت الأوردر؟ اكتب كود الاستلام</T></Row>
          <Muted size={12.5}>العميل معاه كود من ٤ أرقام في صفحة الأوردر. بيديهولك بعد ما يفحص القطع.</Muted>
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
                <Muted size={12}>{p.car_make} {p.car_model} {ar(p.car_year)}{q ? ` · ${CONDITIONS[q.condition]} · ${warrantyLabel(q.warranty_days)}` : ''}</Muted>
              </View>
              {q ? <T w="semibold" size={14}>{money(q.price * (p.qty || 1))}</T> : null}
            </Row>
          );
        })}
        <View style={{ height: 1, backgroundColor: colors.line }} />
        <Lines rows={[['القطع', money(total) + ' ج.م'], ['التوصيل', Number(o.delivery_fee) ? money(Number(o.delivery_fee)) + ' ج.م' : 'استلام من المحل']]} total={['الإجمالي من العميل', money(total + Number(o.delivery_fee)) + ' ج.م']} />
        <Row style={{ justifyContent: 'space-between' }}>
          <Muted size={13}>الدفع: {PAY_NAME[o.payment_method]}</Muted>
          <Pill label={o.payment_method === 'cash' && o.payment_status === 'unpaid' ? 'حصّل كاش عند التسليم' : o.payment_method === 'shop' && o.payment_status === 'unpaid' ? 'هيدفع في المحل' : o.payment_status === 'review' ? 'محتاج تأكيدك' : PAY_STATUS[o.payment_status].label} tone={PAY_STATUS[o.payment_status].tone} />
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
              <Muted size={13} style={{ flex: 1 }}>{addr ? addressLine(addr) : addressLine(c)}{(addr?.landmark ?? c.landmark) ? ` (${addr?.landmark ?? c.landmark})` : ''}</Muted></Row>
          ) : null}
          {addr?.contact_phone ? <Muted size={13}>رقم المندوب: {addr.contact_phone}</Muted> : null}
        </Card>
      ) : null}

      {o.status === 'received' ? (
        <Card style={{ backgroundColor: colors.goodSoft }}>
          <T w="bold" size={15}>العميل استلم الأوردر{o.rating ? ` وقيّمك ${ar(o.rating)} من ٥` : ''}</T>
          {o.rating ? <Row gap={3}>{[1, 2, 3, 4, 5].map((n) => <Icon key={n} name="star" size={18} color={o.rating! >= n ? colors.accent : colors.line} />)}</Row> : null}
          {o.review ? <T size={14}>«{o.review}»</T> : null}
        </Card>
      ) : null}
      {o.status === 'preparing' ? <Btn kind="link" title="مش هقدر أسلّم الأوردر" onPress={() => setCancelling(true)} style={{ alignSelf: 'center' }} /> : null}
      <Sheet open={disputing} onClose={() => setDisputing(false)} title="اعترض">
        <View style={{ gap: 12 }}>
          <Field value={disputeText} onChangeText={setDisputeText} multiline placeholder="ليه شايف الرفض مش في محله؟" />
          <Btn title="ابعت" loading={busy} disabled={!disputeText.trim()} onPress={async () => {
            setBusy(true);
            const { error } = await supabase.rpc('shop_dispute', { p_order: o.id, p_note: disputeText.trim() });
            setBusy(false);
            if (error) return toast(friendlyError(error));
            setDisputing(false); toast('اعتراضك وصل لفريق ضغطة.');
          }} />
        </View>
      </Sheet>
      <Sheet open={cancelling} onClose={() => setCancelling(false)} title="مش هقدر أسلّم الأوردر">
        <View style={{ gap: 14 }}>
          <Chips options={['القطعة اتباعت', 'لقيت فيها عيب', 'سبب تاني'].map((v) => ({ v, label: v }))} selected={[reason]} onPick={setReason} />
          {reason === 'سبب تاني' ? <Field value={other} onChangeText={setOther} placeholder="سبب تاني" /> : null}
          <Muted size={13}>الإلغاء بيأثر على تقييم محلك، ولو العميل حوّل لازم ترجّع المبلغ.</Muted>
          <Row gap={10}>
            <Btn kind="danger" title="ألغي الأوردر" loading={busy} disabled={!reason} onPress={shopCancel} style={{ flex: 1 }} />
            <Btn kind="secondary" title="لأ" onPress={() => setCancelling(false)} style={{ flex: 1 }} />
          </Row>
        </View>
      </Sheet>
    </Screen>
  );
}

import { InstallBox } from '@/components/InstallBox';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Image, Linking, View } from 'react-native';
import { ConfirmSheet } from '@/components/Confirm';
import { DepositPanel } from '@/components/Deposit';
import { PaymentPanel } from '@/components/Payment';
import { ReceiptButton } from '@/components/ReceiptButton';
import { BackBar, Btn, Card, Chips, Empty, Field, Icon, IconButton, Lines, Loading, Muted, Photo, Press, Row, Screen, Sheet, T, toast } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import {
  CONDITIONS, ORDER_LABEL, ORDER_STEP_NAME, warrantyLabel, orderStep, orderTitle, addressLine, ago, ar, friendlyError, money, orderNo, orderSteps,
  type Order, type Quote, type Request, type Shop, type ShopPrivate, SHOP_COLS,
} from '@/lib/data';
import { must, useLive } from '@/lib/live';
import { depositOpen, needsPayment } from '@/lib/payments';
import { pickPhoto, uploadPhoto } from '@/lib/photos';
import { photoUrl, supabase } from '@/lib/supabase';
import { colors, lift } from '@/lib/theme';
import { t } from '@/lib/i18n';

type Data = { order: Order | null; parts: Request[]; quotes: Quote[]; shop: Shop | null; priv: ShopPrivate | null; code: string | null; shopName: string | null };

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
    if (!order) return { order: null, parts: [], quotes: [], shop: null, priv: null, code: null, shopName: null };
    const parts = must(await supabase.from('requests').select('*').eq('order_id', id).order('num')) as Request[];
    const qids = parts.map((p) => p.chosen_quote_id).filter(Boolean) as string[];
    const [quotes, shop, priv, code, card] = await Promise.all([
      qids.length ? supabase.from('quotes').select('*').in('id', qids) : Promise.resolve({ data: [], error: null }),
      supabase.from('shops').select(SHOP_COLS).eq('id', order.shop_id).maybeSingle(),
      // the shop's phone and address: hidden until the pickup deposit is paid (the server decides)
      supabase.from('shop_private').select('*').eq('id', order.shop_id).maybeSingle(),
      supabase.from('order_codes').select('code').eq('order_id', order.id).maybeSingle(),
      supabase.rpc('shop_cards', { p_shops: [order.shop_id] }),
    ]);
    return { order, parts, quotes: must(quotes as any) as Quote[], shop: shop.data as Shop | null, priv: priv.data as ShopPrivate | null,
      code: (code.data as { code: string } | null)?.code ?? null, shopName: ((card.data ?? []) as { name: string }[])[0]?.name ?? null };
  }, ['orders', 'requests'], [id]);

  if (ready && !session) return <Redirect href="/login" />;
  const back = () => (router.canGoBack() ? router.back() : router.replace('/customer/requests'));
  if (loading && !data) return <Screen><Loading /></Screen>;
  const o = data?.order;
  if (!o) return <Screen><BackBar title={t('الأوردر')} onBack={back} /><Empty text={t('الأوردر ده مش موجود.')} /></Screen>;
  const { parts, quotes, shop, priv } = data!;
  const steps = orderSteps(o.delivery_mode);
  const at = orderStep(o);
  const lbl = ORDER_LABEL[o.status];
  const quoteOf = (p: Request) => quotes.find((q) => q.id === p.chosen_quote_id);
  const warrantyDays = Math.max(0, ...quotes.map((q) => q.warranty_days));
  const warrantyEnd = o.received_at && warrantyDays > 0 ? new Date(new Date(o.received_at).getTime() + warrantyDays * 86400000) : null;
  const firstPart = parts[0];
  const unpaid = needsPayment(o);
  const hasDeposit = (o.deposit_status ?? 'none') !== 'none';
  const dep = Number(o.deposit ?? 0);
  const depositPaid = ['paid', 'used'].includes(o.deposit_status ?? '');

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
    const why = reason === t('سبب تاني') ? other.trim() : reason;
    if (!why) return toast(t('اختار سبب الرفض.'));
    setBusy(true);
    try {
      const path = refPhoto && session ? await uploadPhoto(refPhoto, session.user.id) : null;
      const { error } = await supabase.rpc('refuse_order', { p_order: o!.id, p_reason: why, p_photo: path });
      if (error) throw error;
      setAsk(null);
      toast(hasDeposit ? t('اتسجّل إنك رفضت القطعة. هنأكد مع المحل ونرجّعلك العربون.')
        : o!.payment_status === 'paid' ? t('اتسجّل إنك رفضت القطعة. المحل لازم يرجّعلك {0} ج.م، وهنتابع معاه.', money(total)) : t('اتسجّل إنك رفضت القطعة، ومش هتدفع حاجة. تقدر تختار عرض تاني.'));
    } catch (e) { toast(friendlyError(e)); }
    setBusy(false);
  }

  const footer = o.status === 'cancelled' || unpaid ? undefined
    : isReady
      ? (
        <>
          <Btn title={t('استلمت الأوردر')} onPress={() => setAsk('received')} />
          <Btn kind="danger" title={t('القطعة مش زي العرض؟ ارفضها')} onPress={() => setAsk('refuse')} style={{ minHeight: 40 }} />
        </>
      )
      : o.status === 'preparing' ? undefined
      : !o.rating
        ? <Btn title={t('ابعت التقييم')} icon="star" disabled={!stars} loading={busy} onPress={() => rpc('rate_order', { p_order: o.id, p_rating: stars, p_review: review.trim() }, t('شكراً على تقييمك.'))} />
        : undefined;

  return (
    <Screen footer={footer}>
      <BackBar title={t('أوردر ') + orderNo(o.order_no)} onBack={back} />

      {/* live status: light, one line of what is happening, a simple progress bar */}
      <View style={{ backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.line, padding: 18, gap: 16 }}>
        <View style={{ gap: 2 }}>
          <T w="bold" size={22} style={{ lineHeight: 32 }} color={o.status === 'cancelled' ? colors.bad : colors.ink}>{unpaid ? (depositOpen(o) ? t('ادفع العربون عشان تحجز القطعة') : t('فاضل خطوة الدفع')) : orderTitle(o)}</T>
          <Muted size={14}>{o.delivery_mode === 'delivery' ? t('توصيل لعنوانك') : t('استلام من المحل')} {t('· آخر تحديث')}{' '}{ago(o.updated_at)}</Muted>
        </View>
        {o.status !== 'cancelled' ? (
          <Row gap={6}>
            {steps.map((st, i) => {
              const done = i <= at;
              return (
                <View key={st} style={{ flex: 1, gap: 8 }}>
                  <View style={{ height: 5, borderRadius: 3, backgroundColor: done ? (o.status === 'received' ? colors.good : colors.primary) : '#E3E7EC' }} />
                  <T size={13} w={i === at ? 'semibold' : 'regular'} color={done ? colors.ink : colors.faint}>{ORDER_STEP_NAME[st]}</T>
                </View>
              );
            })}
          </Row>
        ) : null}
      </View>

      {done && o.status !== 'cancelled' ? (
        <Row gap={10} style={{ backgroundColor: colors.goodSoft, borderRadius: 16, padding: 14 }}>
          <Icon name="checkmark-circle" size={24} color={colors.good} />
          <View style={{ flex: 1 }}><T w="bold" size={15}>{t('الأوردر اتأكد.')}</T><Muted size={12.5}>{t('إيصالك جاهز، حمّله من تحت.')}</Muted></View>
        </Row>
      ) : null}

      {data!.code && !unpaid && o.status !== 'received' && o.status !== 'cancelled' ? (
        <View style={{ backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.line, padding: 20, gap: 8, alignItems: 'center' }}>
          <Muted size={14}>{t('كود الاستلام')}</Muted>
          <T w="bold" size={44} style={{ letterSpacing: 10, lineHeight: 56, writingDirection: 'ltr' }} selectable>{ar(data!.code)}</T>
          <Muted size={13.5} center>{t('افحص القطعة الأول: الموديل، الجهة، الحالة، وإنها زي صورة العرض. لو زي العرض، ادّي الكود للمحل أو المندوب. بعد الكود، الاسترجاع بيكون مع المحل حسب القانون.')}</Muted>
        </View>
      ) : null}

      {o.refused_at ? (
        <Row gap={10} style={{ backgroundColor: colors.soft, borderRadius: 16, padding: 14, alignItems: 'flex-start' }}>
          <Icon name="hand-left" size={20} color={colors.muted} />
          <View style={{ flex: 1 }}>
            <T w="semibold" size={14}>{t('رفضت القطعة:')}{' '}{o.refusal_reason}</T>
            {o.payment_status === 'unpaid' && !hasDeposit ? <Muted size={12.5}>{t('اتسجّل إنك رفضت القطعة، ومش هتدفع حاجة. تقدر تختار عرض تاني.')}</Muted> : null}
          </View>
        </Row>
      ) : null}
      {hasDeposit ? <DepositPanel order={o} /> : <PaymentPanel order={o} shop={priv} />}

      {/* the shop */}
      {o.status !== 'cancelled' ? (
        <Card>
          <Row gap={10}>
            <Press onPress={() => router.push(`/shop-profile/${o.shop_id}`)} label={t('صفحة المحل')} role="link" style={{ flex: 1 }}>
              <T w="semibold" size={16}>{priv?.name ?? data!.shopName ?? t('المحل')}</T>
              <Muted size={13}>{shop?.area}{t('،')}{' '}{shop?.governorate}</Muted>
            </Press>
            {firstPart ? <IconButton name="chatbubble-ellipses" label={t('رسالة للمحل')} size={44} onPress={() => router.push(`/chat/${firstPart.id}/${o.shop_id}`)} /> : null}
            {priv?.phone ? <IconButton name="call" label={t('اتصل بالمحل')} size={44} onPress={() => Linking.openURL('tel:' + priv.phone)} /> : null}
          </Row>
          {o.delivery_mode === 'pickup' && !priv && hasDeposit ? (
            <Row gap={8} style={{ alignItems: 'flex-start' }}><Icon name="lock-closed" size={16} color={colors.muted} />
              <Muted size={13} style={{ flex: 1 }}>{t('اسم المحل ورقمه وعنوانه هيظهروا بعد دفع العربون.')}</Muted></Row>
          ) : null}
          {o.delivery_mode === 'pickup' && priv ? (
            <Row gap={8} style={{ alignItems: 'flex-start' }}><Icon name="location" size={16} color={colors.muted} />
              <Muted size={13} style={{ flex: 1 }}>{addressLine({ street: priv.street, building: priv.building, area: shop?.area, governorate: shop?.governorate })}{priv.landmark ? ` (${priv.landmark})` : ''} {t('· قول للمحل رقم الأوردر')}{' '}{orderNo(o.order_no)}</Muted></Row>
          ) : null}
          {o.delivery_mode === 'delivery' && o.delivery_address ? (
            <Row gap={8} style={{ alignItems: 'flex-start' }}><Icon name="location" size={16} color={colors.muted} />
              <Muted size={13} style={{ flex: 1 }}>{t('التوصيل على:')}{' '}{addressLine(o.delivery_address)}{o.delivery_address.landmark ? ` (${o.delivery_address.landmark})` : ''}</Muted></Row>
          ) : null}
        </Card>
      ) : null}

      {/* parts + receipt */}
      <Card>
        <T w="bold" size={16}>{t('القطع (')}{ar(parts.length)})</T>
        {parts.map((p) => {
          const q = quoteOf(p);
          return (
            <Row key={p.id} gap={12}>
              <Photo uri={photoUrl(q?.photo_path ?? p.photo_path)} size={48} />
              <View style={{ flex: 1 }}>
                <T w="semibold" size={14.5}>{t(p.part)}{q?.brand ? ` (${q.brand})` : ''}{p.qty > 1 ? ` × ${ar(p.qty)}` : ''}</T>
                <Muted size={12}>{q ? `${CONDITIONS[q.condition]} · ${warrantyLabel(q.warranty_days)}` : ''}</Muted>
              </View>
              {q ? <T w="semibold" size={14}>{money(q.price * (p.qty || 1))} {t('ج.م')}</T> : null}
            </Row>
          );
        })}
        <View style={{ height: 1, backgroundColor: colors.line }} />
        {hasDeposit ? (
          <Lines rows={[[t('القطع'), money(o.items_total) + t(' ج.م')], [depositPaid ? t('العربون (اتدفع لضغطة)') : t('العربون (لضغطة)'), '− ' + money(dep) + t(' ج.م')]]}
            total={[t('تدفعه في المحل'), money(Number(o.items_total) - dep) + t(' ج.م')]} />
        ) : (
          <Lines rows={[[t('القطع'), money(o.items_total) + t(' ج.م')], [t('التوصيل'), o.delivery_fee ? money(o.delivery_fee) + t(' ج.م') : t('مجاناً')]]} total={[t('الإجمالي'), money(Number(o.items_total) + Number(o.delivery_fee)) + t(' ج.م')]} />
        )}
      </Card>

      <InstallBox o={o} />
      {!o.install_status && o.status !== 'cancelled' && parts.length ? (
        <View style={{ backgroundColor: parts.some((p) => p.wants_install) ? colors.primarySoft : colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.line, padding: 14, gap: 8 }}>
          <T w="semibold" size={15}>{t('محتاج حد يركّب القطعة؟')}</T>
          <Muted size={13}>{t('اطلب تركيب من محلات قريبة، وابعتلهم إن القطعة معاك.')}</Muted>
          <Btn kind="secondary" icon="construct-outline" title={t('اطلب تركيب')}
            onPress={() => router.push({ pathname: '/install/new', params: { desc: parts.map((p) => p.part).join(t('، ')).slice(0, 300) } })} />
        </View>
      ) : null}
      {o.status !== 'cancelled' ? <ReceiptButton orderId={o.id} /> : null}

      {warrantyEnd ? (
        <Row gap={12} style={{ backgroundColor: colors.goodSoft, borderRadius: 16, padding: 16 }}>
          <Icon name="shield-checkmark" size={26} color={colors.good} />
          <View style={{ flex: 1 }}>
            <T w="bold" size={14.5}>{t('ضمان المحل لحد')}{' '}{warrantyEnd.toLocaleDateString('ar-EG', { day: 'numeric', month: 'long' })}</T>
            <Muted size={12.5}>{t('لو ظهر عيب في القطعة خلال المدة دي، كلّم المحل. ولو مردّش، بلّغنا وهنوصّل شكوتك للمحل.')}</Muted>
          </View>
        </Row>
      ) : null}

      {o.status === 'received' ? (
        o.rating ? (
          <Card>
            <Row gap={4}>{[1, 2, 3, 4, 5].map((n) => <Icon key={n} name="star" size={22} color={o.rating! >= n ? '#E8A317' : colors.line} />)}</Row>
            {o.review ? <T size={14}>«{o.review}»</T> : <Muted>{t('شكراً على تقييمك.')}</Muted>}
          </Card>
        ) : (
          <Card>
            <T w="bold" size={17}>{t('إيه رأيك في المحل؟')}</T>
            <Row gap={8} style={{ justifyContent: 'center' }}>
              {[1, 2, 3, 4, 5].map((n) => (
                <Press key={n} onPress={() => setStars(n)} label={ar(n) + t(' نجوم')} hitSlop={4}>
                  <Icon name={stars >= n ? 'star' : 'star-outline'} size={40} color={stars >= n ? '#E8A317' : colors.faint} />
                </Press>
              ))}
            </Row>
            <Field value={review} onChangeText={setReview} multiline placeholder={t('اكتب رأيك في المحل والقطع (اختياري)')} />
          </Card>
        )
      ) : null}

      <View style={{ gap: 4, alignItems: 'center' }}>
        {firstPart ? <Btn kind="link" title={t('عندك مشكلة في الأوردر؟')} onPress={() => router.push({ pathname: '/assistant', params: { mode: 'complaint', request: firstPart.id } })} /> : null}
        {o.status === 'preparing' ? <Btn kind="link" title={t('إلغاء الأوردر')} onPress={() => setAsk('cancel')} /> : null}
      </View>

      <ConfirmSheet open={ask === 'received'} title={t('اتأكدت إن القطعة زي العرض؟')} body={t('بعد التأكيد، الاسترجاع بيكون مع المحل حسب القانون.')} yes={t('أيوه، استلمت')} busy={busy}
        onYes={() => rpc('receive_order', { p_order: o.id }, t('تمام. إيه رأيك في المحل؟'))} onClose={() => setAsk(null)} />
      <ConfirmSheet open={ask === 'cancel'} title={t('تلغي الأوردر؟')}
        body={o.deposit_status === 'paid' ? t('العربون ({0} ج.م) مش هيرجع لو لغيت دلوقتي، لأن المحل حجز القطعة ليك.', money(dep))
          : o.deposit_status === 'review' ? t('لو كنت حوّلت العربون، هنراجعه ونرجّعهولك. القطع هترجع للطلب.')
          : t('القطع هترجع للطلب وتقدر تختار عرض تاني.')} yes={t('أيوه، الغي')} danger busy={busy}
        onYes={() => rpc('cancel_order', { p_order: o.id }, t('الأوردر اتلغى. تقدر تختار عرض تاني.'))} onClose={() => setAsk(null)} />
      <Sheet open={ask === 'refuse'} onClose={() => setAsk(null)} title={t('ليه رفضتها؟')}>
        <View style={{ gap: 14 }}>
          <Chips options={[t('موديل غلط'), t('جهة غلط'), t('حالتها مش زي العرض'), t('مش زي الصورة'), t('سبب تاني')].map((v) => ({ v, label: v }))} selected={[reason]} onPick={setReason} />
          {reason === t('سبب تاني') ? <Field value={other} onChangeText={setOther} placeholder={t('اكتب السبب')} /> : null}
          <Press onPress={async () => { try { const u = await pickPhoto(); if (u) setRefPhoto(u); } catch { toast(t('الصورة دي مش مدعومة. اختار صورة JPG أو PNG.')); } }}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: 16, borderWidth: 1.5, borderStyle: 'dashed', borderColor: refPhoto ? colors.good : colors.line }}>
            {refPhoto ? <Image source={{ uri: refPhoto }} style={{ width: 44, height: 44, borderRadius: 10 }} /> : (
              <View style={{ width: 44, height: 44, borderRadius: 10, backgroundColor: colors.soft, alignItems: 'center', justifyContent: 'center' }}><Icon name="camera" size={20} /></View>
            )}
            <T size={13.5} w="medium" style={{ flex: 1 }}>{refPhoto ? t('الصورة اتضافت · تغيير') : t('أضف صورة (اختياري)')}</T>
          </Press>
          <Btn kind="danger" title={t('تأكيد الرفض')} loading={busy} disabled={!reason} onPress={refuse} />
        </View>
      </Sheet>
    </Screen>
  );
}

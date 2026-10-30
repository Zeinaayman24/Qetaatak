import { useEffect, useState } from 'react';
import { Image, View } from 'react-native';
import { useAuth } from '@/lib/auth';
import { ar, friendlyError, money, type Order, type PayMethod } from '@/lib/data';
import { PAY_METHODS, PAY_NAME, PAY_STATUS, payByCard } from '@/lib/payments';
import { pickPhoto, uploadPhoto } from '@/lib/photos';
import { supabase } from '@/lib/supabase';
import { colors, radius } from '@/lib/theme';
import { Btn, CopyBox, Field, Icon, Muted, Pill, Press, Row, T, toast } from './ui';

/** A selectable card with a radio mark: delivery options, payment methods. */
export function RadioCard({ title, sub, icon, on, onPress, disabled, badge, right }: {
  title: string; sub?: string; icon?: string; on: boolean; onPress: () => void; disabled?: boolean; badge?: string; right?: string;
}) {
  return (
    <Press onPress={onPress} disabled={disabled} selected={on} label={title}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: radius.lg, borderWidth: on ? 1.5 : 1,
        borderColor: on ? colors.primary : colors.line, backgroundColor: on ? colors.primarySoft : colors.surface }}>
      {icon ? (
        <View style={{ width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? colors.surface : colors.soft }}>
          <Icon name={icon} size={21} color={on ? colors.primary : colors.ink} />
        </View>
      ) : null}
      <View style={{ flex: 1, gap: 1 }}>
        <Row gap={6}>
          <T w="semibold" size={14.5}>{title}</T>
          {badge ? <View style={{ backgroundColor: colors.soft, borderRadius: 6, paddingHorizontal: 6 }}><T size={11} w="semibold" color={colors.muted} style={{ lineHeight: 17 }}>{badge}</T></View> : null}
        </Row>
        {sub ? <Muted size={12.5}>{sub}</Muted> : null}
      </View>
      {right ? <T w="semibold" size={13.5} color={on ? colors.primary : colors.ink}>{right}</T> : null}
      <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: on ? colors.primary : colors.line, alignItems: 'center', justifyContent: 'center' }}>
        {on ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary }} /> : null}
      </View>
    </Press>
  );
}

/** Which payment methods fit how the parts arrive: delivery, pickup, or a mix of both. */
export type Handover = 'delivery' | 'pickup' | 'mixed';
export function payOptions(handover: Handover): PayMethod[] {
  return handover === 'pickup' ? ['shop', 'instapay', 'card'] : ['cash', 'instapay', 'card'];
}

/** The payment choice in the checkout: only the methods that fit the delivery choice are shown. */
export function PaymentPicker({ value, onPick, card, instapay, handover }: {
  value: PayMethod; onPick: (v: PayMethod) => void; card: boolean; instapay: boolean; handover: Handover;
}) {
  return (
    <View style={{ gap: 10 }}>
      {payOptions(handover).map((v) => {
        const m = PAY_METHODS.find((x) => x.v === v)!;
        const off = (v === 'card' && !card) || (v === 'instapay' && !instapay);
        const title = v === 'cash' && handover === 'mixed' ? 'كاش عند الاستلام' : v === 'shop' ? 'كاش في المحل' : m.title;
        const sub = v === 'cash' ? (handover === 'mixed' ? 'للمندوب أو في المحل وانت بتستلم' : 'ادفع للمندوب لما الأوردر يوصلك')
          : v === 'shop' ? 'ادفع وانت بتستلم القطع من المحل'
          : v === 'instapay' && !instapay ? 'المحل ده لسه مش مفعّل الدفع بالتحويل' : m.sub;
        return (
          <RadioCard key={v} title={title} icon={m.icon} on={value === v} disabled={off} onPress={() => onPick(v)}
            sub={sub} badge={v === 'card' && !card ? 'قريباً' : undefined} />
        );
      })}
    </View>
  );
}

/** The payment block on an order page: what was chosen, its state, and the next step (pay by card, upload a transfer receipt). */
export function PaymentPanel({ order: o, shop }: { order: Order; shop?: { name?: string; instapay_address?: string; wallet_number?: string } | null }) {
  const { session } = useAuth();
  const [photo, setPhoto] = useState<string | null>(null);
  const [ref, setRef] = useState('');
  const [busy, setBusy] = useState(false);
  const total = Number(o.items_total) + Number(o.delivery_fee);
  const st = PAY_STATUS[o.payment_status];
  const transferOpen = o.payment_method === 'instapay' && ['awaiting', 'failed'].includes(o.payment_status) && o.status !== 'cancelled';
  const cardOpen = o.payment_method === 'card' && ['awaiting', 'failed'].includes(o.payment_status) && o.status !== 'cancelled';

  async function sendReceipt() {
    if (!photo || !session) return;
    setBusy(true);
    try {
      const path = await uploadPhoto(photo, session.user.id, 'receipts');
      const { error } = await supabase.rpc('submit_payment_proof', { p_order: o.id, p_path: path, p_ref: ref.trim() });
      if (error) throw error;
      setPhoto(null); toast('الإيصال وصل، هنأكد الدفع في أسرع وقت');
    } catch (e) { toast(friendlyError(e)); }
    setBusy(false);
  }
  async function card() {
    setBusy(true);
    const err = await payByCard(o.id);
    setBusy(false);
    if (err) toast(err);
  }

  return (
    <View style={{ backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: 16, gap: 14 }}>
      <Row gap={12}>
        <View style={{ width: 42, height: 42, borderRadius: 12, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={PAY_METHODS.find((m) => m.v === o.payment_method)?.icon ?? 'cash'} size={21} color={colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Muted size={12}>طريقة الدفع</Muted>
          <T w="bold" size={15}>{PAY_NAME[o.payment_method]}</T>
        </View>
        <Pill label={st.label} tone={st.tone} />
      </Row>

      {o.payment_status === 'failed' && o.payment_note ? (
        <Row gap={8} style={{ backgroundColor: colors.badSoft, borderRadius: radius.md, padding: 12, alignItems: 'flex-start' }}>
          <Icon name="alert-circle" size={18} color={colors.bad} />
          <T size={13.5} color={colors.bad} style={{ flex: 1 }}>{o.payment_note}</T>
        </Row>
      ) : null}

      {cardOpen ? (
        <>
          <Muted size={13}>المحل هيبدأ يجهّز القطع أول ما الدفع يتأكد.</Muted>
          <Btn icon="card" title={`ادفع ${money(total)} ج.م بالبطاقة`} loading={busy} onPress={card} />
          <Row gap={6} style={{ justifyContent: 'center' }}><Icon name="lock-closed" size={13} color={colors.muted} /><Muted size={12}>دفع آمن عن طريق Paymob، بيانات بطاقتك مش بتعدّي علينا</Muted></Row>
        </>
      ) : null}

      {transferOpen ? (
        <>
          <T size={13.5}>حوّل <T w="bold" size={13.5}>{money(total)} ج.م</T> للمحل مباشرة، وبعدين ارفع صورة الإيصال والمحل يأكّد:</T>
          {shop && (shop.instapay_address || shop.wallet_number) ? (
            <View style={{ gap: 8 }}>
              {shop.instapay_address ? <View style={{ gap: 4 }}><Muted size={12}>عنوان InstaPay</Muted><CopyBox text={shop.instapay_address} /></View> : null}
              {shop.wallet_number ? <View style={{ gap: 4 }}><Muted size={12}>رقم المحفظة (فودافون كاش وغيرها)</Muted><CopyBox text={shop.wallet_number} /></View> : null}
              {shop.name ? <Muted size={12.5}>باسم المحل: {shop.name}، اكتب رقم الأوردر في ملاحظة التحويل</Muted> : null}
            </View>
          ) : <Muted size={13}>بنحمّل بيانات تحويل المحل…</Muted>}
          <Press onPress={async () => { try { const u = await pickPhoto(); if (u) setPhoto(u); } catch { toast('الصورة دي مش مدعومة.'); } }}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: radius.md, borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#C9DDF2', backgroundColor: colors.surface }}>
            {photo ? <Image source={{ uri: photo }} style={{ width: 52, height: 52, borderRadius: 10 }} /> : (
              <View style={{ width: 52, height: 52, borderRadius: 10, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}><Icon name="image-up" size={24} color={colors.primary} /></View>
            )}
            <View style={{ flex: 1 }}>
              <T w="semibold" size={14}>{photo ? 'صورة الإيصال جاهزة' : 'ارفع صورة الإيصال'}</T>
              <Muted size={12}>{photo ? 'اضغط لو عايز تغيّرها' : 'سكرين شوت من InstaPay أو المحفظة'}</Muted>
            </View>
          </Press>
          <Field value={ref} onChangeText={setRef} placeholder="رقم العملية (اختياري)" ltr icon="receipt" />
          <Btn icon="upload" title="ابعت الإيصال" disabled={!photo} loading={busy} onPress={sendReceipt} />
        </>
      ) : null}

      {o.payment_method === 'instapay' && o.payment_status === 'review' ? (
        <Row gap={8} style={{ backgroundColor: colors.primarySoft, borderRadius: radius.md, padding: 12 }}>
          <Icon name="hourglass" size={18} color={colors.primary} />
          <T size={13.5} style={{ flex: 1 }}>الإيصال وصل للمحل{o.payment_ref ? ` (عملية ${o.payment_ref})` : ''}. أول ما يأكد إن الفلوس وصلته هيوصلك إشعار ويبدأ يجهّز.</T>
        </Row>
      ) : null}

      {(o.payment_method === 'cash' || o.payment_method === 'shop') && o.payment_status === 'unpaid' && o.status !== 'cancelled' ? (
        <Muted size={13}>{o.payment_method === 'shop' ? 'هتدفع' : 'هتدفع للمندوب'} {money(total)} ج.م {o.payment_method === 'shop' ? 'في المحل وانت بتستلم.' : 'لما الأوردر يوصلك. اتأكد من القطع الأول.'}</Muted>
      ) : null}
      {o.payment_status === 'paid' && o.paid_at ? (
        <Row gap={8}><Icon name="verified" size={18} color={colors.good} /><Muted size={13}>اتدفع {money(total)} ج.م يوم {new Date(o.paid_at).toLocaleDateString('ar-EG', { day: 'numeric', month: 'long' })}</Muted></Row>
      ) : null}
      {o.payment_status === 'refund_due' ? <Muted size={13}>الأوردر اتلغى بعد الدفع. فريقنا هيرجّعلك {money(total)} ج.م خلال {ar(3)} أيام عمل.</Muted> : null}
      {o.payment_status === 'refunded' ? <Muted size={13}>رجّعنالك {money(total)} ج.م.{o.payment_note ? ` ${o.payment_note}` : ''}</Muted> : null}
    </View>
  );
}

/**
 * The shop's side of a transfer: InstaPay / wallet money goes straight to the shop,
 * so the shop opens the customer's receipt and confirms the money arrived (or rejects it with a reason).
 */
export function ShopPaymentReview({ order: o }: { order: Order }) {
  const [url, setUrl] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const total = Number(o.items_total) + Number(o.delivery_fee);
  useEffect(() => {
    if (!o.payment_proof) return;
    supabase.storage.from('receipts').createSignedUrl(o.payment_proof, 600).then(({ data }) => setUrl(data?.signedUrl ?? null));
  }, [o.payment_proof]);

  async function decide(ok: boolean) {
    if (!ok && !note.trim()) return toast('اكتب للعميل سبب الرفض');
    setBusy(true);
    const { error } = await supabase.rpc('review_payment', { p_order: o.id, p_ok: ok, p_note: note.trim() });
    setBusy(false);
    if (error) toast(friendlyError(error)); else toast(ok ? 'تمام، ابدأ جهّز الأوردر' : 'بلّغنا العميل');
  }
  async function refunded() {
    setBusy(true);
    const { error } = await supabase.rpc('mark_refunded', { p_order: o.id, p_note: note.trim() });
    setBusy(false);
    if (error) toast(friendlyError(error)); else toast('اتسجّل إنك رجّعت الفلوس');
  }

  if (o.payment_method !== 'instapay') return null;
  if (o.payment_status === 'refund_due') {
    return (
      <View style={{ backgroundColor: colors.warnSoft, borderRadius: radius.lg, padding: 16, gap: 10 }}>
        <T w="bold" size={15} color={colors.warn}>العميل لغى بعد ما حوّل، رجّعله {money(total)} ج.م</T>
        <Field value={note} onChangeText={setNote} placeholder="رقم عملية الاسترجاع (اختياري)" ltr />
        <Btn kind="dark" icon="checkmark-done" title="رجّعت المبلغ للعميل" loading={busy} onPress={refunded} />
      </View>
    );
  }
  if (o.payment_status === 'awaiting' || o.payment_status === 'failed') {
    return (
      <Row gap={10} style={{ backgroundColor: colors.warnSoft, borderRadius: radius.lg, padding: 14 }}>
        <Icon name="hourglass" size={20} color={colors.warn} />
        <T size={13.5} color={colors.warn} style={{ flex: 1 }}>العميل هيحوّل {money(total)} ج.م على InstaPay / محفظتك ويرفع الإيصال هنا.{o.payment_status === 'failed' ? ' رفضت الإيصال اللي فات، مستنيين واحد جديد.' : ''}</T>
      </Row>
    );
  }
  if (o.payment_status !== 'review') return null;
  return (
    <View style={{ backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1.5, borderColor: colors.primary, padding: 16, gap: 12 }}>
      <Row gap={8}><Icon name="receipt" size={20} color={colors.primary} /><T w="bold" size={16}>العميل حوّل، راجع الإيصال</T></Row>
      <Row gap={12} style={{ alignItems: 'flex-start' }}>
        {url ? <Image source={{ uri: url }} style={{ width: 110, height: 150, borderRadius: 10, backgroundColor: colors.soft }} resizeMode="cover" accessibilityLabel="صورة إيصال التحويل" />
          : <View style={{ width: 110, height: 150, borderRadius: 10, backgroundColor: colors.soft }} />}
        <View style={{ flex: 1, gap: 4 }}>
          <Muted size={12}>المبلغ المطلوب</Muted>
          <T w="bold" size={20}>{money(total)} ج.م</T>
          <Muted size={12}>رقم العملية</Muted>
          <T w="semibold" size={14} style={{ writingDirection: 'ltr', textAlign: 'right' }}>{o.payment_ref || 'مش مكتوب'}</T>
        </View>
      </Row>
      <Muted size={12.5}>افتح InstaPay أو المحفظة واتأكد إن المبلغ وصلك فعلاً قبل ما تأكّد.</Muted>
      <Field value={note} onChangeText={setNote} placeholder="سبب الرفض (لو هترفض)" />
      <Row gap={10}>
        <Btn icon="checkmark-circle" title="الفلوس وصلت" loading={busy} onPress={() => decide(true)} style={{ flex: 1 }} />
        <Btn kind="danger" title="ارفض" loading={busy} onPress={() => decide(false)} style={{ minWidth: 96 }} />
      </Row>
    </View>
  );
}

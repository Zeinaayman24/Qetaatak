import { useEffect, useState } from 'react';
import { Image, View } from 'react-native';
import { useAuth } from '@/lib/auth';
import { ar, friendlyError, money, type Order, type PayMethod } from '@/lib/data';
import { PAY_METHODS, PAY_NAME, PAY_STATUS, payByCard, paySettings, type PaySettings } from '@/lib/payments';
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

/** The payment choice in the checkout. Card shows "soon" until Paymob is switched on; pay-at-shop needs pickup. */
export function PaymentPicker({ value, onPick, card, allPickup }: { value: PayMethod; onPick: (v: PayMethod) => void; card: boolean; allPickup: boolean }) {
  return (
    <View style={{ gap: 10 }}>
      {PAY_METHODS.map((m) => {
        const off = (m.v === 'card' && !card) || (m.v === 'shop' && !allPickup);
        return (
          <RadioCard key={m.v} title={m.title} icon={m.icon} on={value === m.v} disabled={off} onPress={() => onPick(m.v)}
            sub={m.v === 'shop' && !allPickup ? 'متاح لما تختار الاستلام من المحل' : m.sub} badge={m.v === 'card' && !card ? 'قريباً' : undefined} />
        );
      })}
    </View>
  );
}

/** The payment block on an order page: what was chosen, its state, and the next step (pay by card, upload a transfer receipt). */
export function PaymentPanel({ order: o }: { order: Order }) {
  const { session } = useAuth();
  const [s, setS] = useState<PaySettings | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [ref, setRef] = useState('');
  const [busy, setBusy] = useState(false);
  const total = Number(o.items_total) + Number(o.delivery_fee);
  const st = PAY_STATUS[o.payment_status];
  const transferOpen = o.payment_method === 'instapay' && ['awaiting', 'failed'].includes(o.payment_status) && o.status !== 'cancelled';
  const cardOpen = o.payment_method === 'card' && ['awaiting', 'failed'].includes(o.payment_status) && o.status !== 'cancelled';
  useEffect(() => { if (transferOpen) paySettings().then(setS); }, [transferOpen]);

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
          <Row gap={6} style={{ justifyContent: 'center' }}><Icon name="lock-closed" size={13} color={colors.muted} /><Muted size={12}>دفع آمن عن طريق Paymob · بيانات بطاقتك مش بتعدّي علينا</Muted></Row>
        </>
      ) : null}

      {transferOpen ? (
        <>
          <T size={13.5}>حوّل <T w="bold" size={13.5}>{money(total)} ج.م</T> على الحساب ده، وبعدين ارفع صورة الإيصال:</T>
          {s && (s.instapay_address || s.wallet_number) ? (
            <View style={{ gap: 8 }}>
              {s.instapay_address ? <View style={{ gap: 4 }}><Muted size={12}>عنوان InstaPay</Muted><CopyBox text={s.instapay_address} /></View> : null}
              {s.wallet_number ? <View style={{ gap: 4 }}><Muted size={12}>رقم المحفظة (فودافون كاش وغيرها)</Muted><CopyBox text={s.wallet_number} /></View> : null}
              {s.account_name ? <Muted size={12.5}>باسم: {s.account_name}</Muted> : null}
              {s.payment_note ? <Muted size={12.5}>{s.payment_note}</Muted> : null}
            </View>
          ) : <Muted size={13}>{s ? 'بيانات التحويل هتظهر هنا قريب. لو مستعجل كلّم خدمة العملاء.' : 'بنحمّل بيانات التحويل…'}</Muted>}
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
          <T size={13.5} style={{ flex: 1 }}>وصلنا الإيصال{o.payment_ref ? ` (عملية ${o.payment_ref})` : ''}. بنأكد التحويل وهيوصلك إشعار، والمحل بيبدأ بعدها.</T>
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

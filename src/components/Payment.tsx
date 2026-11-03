import { useEffect, useState } from 'react';
import { Image, View } from 'react-native';
import { useAuth } from '@/lib/auth';
import { useNow } from '@/lib/live';
import { ar, friendlyError, money, orderNo, type Order, type PayMethod } from '@/lib/data';
import { PAY_METHODS, PAY_NAME, PAY_STATUS, payByCard } from '@/lib/payments';
import { pickPhoto, uploadPhoto } from '@/lib/photos';
import { supabase } from '@/lib/supabase';
import { colors, radius } from '@/lib/theme';
import { Btn, CopyBox, Field, Icon, Muted, Pill, Press, Row, T, toast } from './ui';
import { t, dir, startAlign } from '@/lib/i18n';

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
      {payOptions(handover).filter((v) => v !== 'card' || card).map((v) => { // card stays hidden until switched on
        const m = PAY_METHODS.find((x) => x.v === v)!;
        const off = (v === 'card' && !card) || (v === 'instapay' && !instapay);
        const title = v === 'cash' && handover === 'mixed' ? t('كاش عند الاستلام') : v === 'shop' ? t('كاش في المحل') : m.title;
        const sub = v === 'cash' ? (handover === 'mixed' ? t('للمندوب أو في المحل وانت بتستلم') : t('ادفع للمندوب لما الأوردر يوصلك'))
          : v === 'shop' ? t('ادفع وانت بتستلم القطع من المحل')
          : v === 'instapay' && !instapay ? t('المحل ده لسه مش مفعّل الدفع بالتحويل') : m.sub;
        return (
          <RadioCard key={v} title={title} icon={m.icon} on={value === v} disabled={off} onPress={() => onPick(v)}
            sub={sub} badge={v === 'card' && !card ? t('قريباً') : undefined} />
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
  const now = useNow(transferOpen ? 30000 : 0);
  const left = Math.max(0, new Date(o.created_at).getTime() + 2 * 3600000 - now);
  const leftText = left >= 3600000 ? t('ساعة و{0} دقيقة', ar(Math.floor((left - 3600000) / 60000))) : t('{0} دقيقة', ar(Math.ceil(left / 60000)));
  const fmtDay = (iso: string) => new Date(iso).toLocaleDateString('ar-EG', { day: 'numeric', month: 'long' });

  async function sendReceipt() {
    if (!photo || !session) return;
    setBusy(true);
    try {
      const path = await uploadPhoto(photo, session.user.id, 'receipts');
      const { error } = await supabase.rpc('submit_payment_proof', { p_order: o.id, p_path: path, p_ref: ref.trim() });
      if (error) throw error;
      setPhoto(null); toast(t('الإيصال وصل للمحل. أول ما يأكّد هيوصلك إشعار.'));
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
          <Muted size={12}>{t('طريقة الدفع')}</Muted>
          <T w="bold" size={15}>{PAY_NAME[o.payment_method]}</T>
        </View>
        <Pill label={st.label} tone={st.tone} />
      </Row>

      {o.payment_status === 'failed' && o.payment_note && o.status !== 'cancelled' ? (
        <Row gap={8} style={{ backgroundColor: colors.badSoft, borderRadius: radius.md, padding: 12, alignItems: 'flex-start' }}>
          <Icon name="alert-circle" size={18} color={colors.bad} />
          <T size={13.5} color={colors.bad} style={{ flex: 1 }}>{t('المحل قال إن الفلوس ماوصلتش: «')}{o.payment_note}{t('». ارفع إيصال تاني أو كلّمنا من «عندك مشكلة في الأوردر؟».')}</T>
        </Row>
      ) : null}
      {o.status === 'cancelled' && o.cancel_reason === 'unpaid' ? <Muted size={13}>{t('ماحوّلتش خلال ساعتين، فالأوردر اتلغى والقطع رجعت للطلب.')}</Muted> : null}

      {cardOpen ? (
        <>
          <Muted size={13}>{t('المحل هيبدأ يجهّز القطع أول ما الدفع يتأكد.')}</Muted>
          <Btn icon="card" title={t('ادفع {0} ج.م بالبطاقة', money(total))} loading={busy} onPress={card} />
          <Row gap={6} style={{ justifyContent: 'center' }}><Icon name="lock-closed" size={13} color={colors.muted} /><Muted size={12}>{t('دفع آمن عن طريق Paymob، بيانات بطاقتك مش بتعدّي علينا')}</Muted></Row>
        </>
      ) : null}

      {transferOpen ? (
        <>
          <T size={13.5}>{t('حوّل')}{' '}<T w="bold" size={13.5}>{money(total)} {t('ج.م')}</T> {t('للمحل مباشرة خلال ساعتين، وبعدين ارفع صورة الإيصال.')}</T>
          <Row gap={6} style={{ backgroundColor: colors.warnSoft, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 8, alignSelf: 'flex-start' }}>
            <Icon name="time" size={15} color={colors.warn} /><T w="semibold" size={13} color={colors.warn}>{t('فاضل')}{' '}{leftText} {t('على الدفع')}</T>
          </Row>
          {shop && (shop.instapay_address || shop.wallet_number) ? (
            <View style={{ gap: 8 }}>
              {shop.instapay_address ? <View style={{ gap: 4 }}><Muted size={12}>{t('عنوان InstaPay')}</Muted><CopyBox text={shop.instapay_address} /></View> : null}
              {shop.wallet_number ? <View style={{ gap: 4 }}><Muted size={12}>{t('رقم المحفظة (فودافون كاش وغيرها)')}</Muted><CopyBox text={shop.wallet_number} /></View> : null}
              {shop.name ? <Muted size={12.5}>{t('اتأكد إن الاسم اللي بيظهرلك هو')}{' '}{shop.name}{t('، واكتب رقم الأوردر')}{' '}{orderNo(o.order_no)} {t('في ملاحظة التحويل.')}</Muted> : null}
            </View>
          ) : <Muted size={13}>{t('بنحمّل بيانات تحويل المحل…')}</Muted>}
          <Press onPress={async () => { try { const u = await pickPhoto(); if (u) setPhoto(u); } catch { toast(t('الصورة دي مش مدعومة. اختار صورة JPG أو PNG.')); } }}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: radius.md, borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#C9DDF2', backgroundColor: colors.surface }}>
            {photo ? <Image source={{ uri: photo }} style={{ width: 52, height: 52, borderRadius: 10 }} /> : (
              <View style={{ width: 52, height: 52, borderRadius: 10, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}><Icon name="image-up" size={24} color={colors.primary} /></View>
            )}
            <View style={{ flex: 1 }}>
              <T w="semibold" size={14}>{photo ? t('صورة الإيصال جاهزة') : t('ارفع صورة الإيصال')}</T>
              <Muted size={12}>{photo ? t('اضغط للتغيير') : t('صورة الشاشة من InstaPay أو المحفظة')}</Muted>
            </View>
          </Press>
          <Field value={ref} onChangeText={setRef} placeholder={t('رقم العملية (اختياري)')} ltr icon="receipt" />
          <Btn icon="upload" title={t('ابعت الإيصال')} disabled={!photo} loading={busy} onPress={sendReceipt} />
        </>
      ) : null}

      {o.payment_method === 'instapay' && o.payment_status === 'review' ? (
        <Row gap={8} style={{ backgroundColor: colors.primarySoft, borderRadius: radius.md, padding: 12 }}>
          <Icon name="hourglass" size={18} color={colors.primary} />
          <T size={13.5} style={{ flex: 1 }}>{t('الإيصال عند المحل')}{o.payment_ref ? t(' (عملية {0})', o.payment_ref) : ''}{t('. أول ما يأكّد إن الفلوس وصلته هيبدأ يجهّز. لو اتأخر أكتر من ساعتين هنتابع معاه.')}</T>
        </Row>
      ) : null}

      {(o.payment_method === 'cash' || o.payment_method === 'shop') && o.payment_status === 'unpaid' && o.status !== 'cancelled' ? (
        <Muted size={13}>{t('هتدفع')}{' '}{money(total)} {t('ج.م')}{' '}{o.payment_method === 'shop' ? t('في المحل وانت بتستلم') : t('للمندوب لما الأوردر يوصلك')}{t('، بعد ما تفحص القطع.')}</Muted>
      ) : null}
      {o.payment_status === 'paid' && o.paid_at ? (
        <Row gap={8}><Icon name="verified" size={18} color={colors.good} /><Muted size={13}>{t('اتدفع')}{' '}{money(total)} {t('ج.م يوم')}{' '}{fmtDay(o.paid_at)}.</Muted></Row>
      ) : null}
      {o.payment_status === 'refund_due' ? <Muted size={13}>{o.payment_method === 'instapay'
        ? (o.refused_at ? t('اتسجّل إنك رفضت القطعة. المحل لازم يرجّعلك {0} ج.م، وهنتابع معاه.', money(total))
          : t('الأوردر اتلغى بعد التحويل. المحل لازم يرجّعلك {0} ج.م على نفس الحساب خلال {1} ساعة، وهنتابع معاه.', money(total), ar(48)))
        : t('الأوردر اتلغى بعد الدفع. هنرجّعلك {0} ج.م على البطاقة خلال {1} أيام عمل.', money(total), ar(3))}</Muted> : null}
      {o.payment_status === 'refunded' ? <Muted size={13}>{o.payment_method === 'instapay' ? t('المحل رجّعلك') : t('رجّعنالك')} {money(total)} {t('ج.م.')}{o.payment_note ? ` ${o.payment_note}` : ''}</Muted> : null}
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
  const now = useNow(60000);
  const leftFrom = (iso: string | null | undefined, hours: number) => {
    const ms = Math.max(0, new Date(iso ?? 0).getTime() + hours * 3600000 - now);
    return ms >= 3600000 ? t('{0} ساعة{1}', ar(Math.floor(ms / 3600000)), ms % 3600000 >= 60000 ? ` و${ar(Math.floor((ms % 3600000) / 60000))} دقيقة` : '') : t('{0} دقيقة', ar(Math.max(1, Math.ceil(ms / 60000))));
  };
  useEffect(() => {
    if (!o.payment_proof) return;
    supabase.storage.from('receipts').createSignedUrl(o.payment_proof, 600).then(({ data }) => setUrl(data?.signedUrl ?? null));
  }, [o.payment_proof]);

  async function decide(ok: boolean) {
    if (!ok && !note.trim()) return toast(t('اكتب سبب الرفض.'));
    setBusy(true);
    const { error } = await supabase.rpc('review_payment', { p_order: o.id, p_ok: ok, p_note: note.trim() });
    setBusy(false);
    if (error) toast(friendlyError(error)); else toast(ok ? t('تمام، ابدأ جهّز الأوردر.') : t('بلّغنا العميل.'));
  }
  async function refunded() {
    setBusy(true);
    const { error } = await supabase.rpc('mark_refunded', { p_order: o.id, p_note: note.trim() });
    setBusy(false);
    if (error) toast(friendlyError(error)); else toast(t('اتسجّل إنك رجّعت الفلوس.'));
  }

  if (o.payment_method !== 'instapay') return null;
  if (o.payment_status === 'refund_due') {
    return (
      <View style={{ backgroundColor: colors.warnSoft, borderRadius: radius.lg, padding: 16, gap: 10 }}>
        <T w="bold" size={15} color={colors.warn}>{t('العميل لغى بعد ما حوّل، رجّعله')}{' '}{money(total)} {t('ج.م خلال')}{' '}{leftFrom(o.refund_due_at ?? o.updated_at, 48)}</T>
        <Field value={note} onChangeText={setNote} placeholder={t('رقم عملية الاسترجاع (اختياري)')} ltr />
        <Btn kind="dark" icon="checkmark-done" title={t('رجّعت المبلغ للعميل')} loading={busy} onPress={refunded} />
      </View>
    );
  }
  if (o.payment_status === 'awaiting' || o.payment_status === 'failed') {
    return (
      <Row gap={10} style={{ backgroundColor: colors.warnSoft, borderRadius: radius.lg, padding: 14 }}>
        <Icon name="hourglass" size={20} color={colors.warn} />
        <T size={13.5} color={colors.warn} style={{ flex: 1 }}>{t('العميل لسه ماحوّلش. متبدأش تجهّز قبل ما تأكّد الدفع. لو ماحوّلش خلال')}{' '}{leftFrom(o.created_at, 2)} {t('الأوردر بيتلغى.')}</T>
      </Row>
    );
  }
  if (o.payment_status !== 'review') return null;
  return (
    <View style={{ backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1.5, borderColor: colors.primary, padding: 16, gap: 12 }}>
      <Row gap={8}><Icon name="receipt" size={20} color={colors.primary} /><T w="bold" size={16} style={{ flex: 1 }}>{t('العميل حوّل، راجع الإيصال')}</T></Row>
      <Muted size={13}>{t('أكّد خلال')}{' '}{leftFrom(o.updated_at, 2)}</Muted>
      <Row gap={12} style={{ alignItems: 'flex-start' }}>
        {url ? <Image source={{ uri: url }} style={{ width: 110, height: 150, borderRadius: 10, backgroundColor: colors.soft }} resizeMode="cover" accessibilityLabel={t('صورة إيصال التحويل')} />
          : <View style={{ width: 110, height: 150, borderRadius: 10, backgroundColor: colors.soft }} />}
        <View style={{ flex: 1, gap: 4 }}>
          <Muted size={12}>{t('المبلغ المطلوب')}</Muted>
          <T w="bold" size={20}>{money(total)} {t('ج.م')}</T>
          <Muted size={12}>{t('رقم العملية')}</Muted>
          <T w="semibold" size={14} style={{ writingDirection: 'ltr', textAlign: startAlign() }}>{o.payment_ref || t('مش مكتوب')}</T>
        </View>
      </Row>
      <Muted size={12.5}>{t('افتح InstaPay أو المحفظة واتأكد إن المبلغ وصلك فعلاً. صورة الإيصال لوحدها مش دليل.')}</Muted>
      <Field value={note} onChangeText={setNote} placeholder={t('سبب الرفض (مطلوب)')} />
      <Row gap={10}>
        <Btn icon="checkmark-circle" title={t('الفلوس وصلت')} loading={busy} onPress={() => decide(true)} style={{ flex: 1 }} />
        <Btn kind="danger" title={t('الفلوس ماوصلتش')} loading={busy} onPress={() => decide(false)} style={{ flex: 1 }} />
      </Row>
    </View>
  );
}

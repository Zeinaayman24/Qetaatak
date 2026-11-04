import { useEffect, useState } from 'react';
import { Image, View } from 'react-native';
import { useAuth } from '@/lib/auth';
import { useNow } from '@/lib/live';
import { ar, friendlyError, money, orderNo, type Order } from '@/lib/data';
import { DEPOSIT_STATUS, cardAvailable, depositOpen, depositRules, payByCard, paySettings, type DepositRules, type PaySettings } from '@/lib/payments';
import { pickPhoto, uploadPhoto } from '@/lib/photos';
import { supabase } from '@/lib/supabase';
import { colors, radius } from '@/lib/theme';
import { Btn, CopyBox, Field, Icon, Muted, Pill, Press, Row, Sheet, T, toast } from './ui';
import { isEn, t } from '@/lib/i18n';

const when = (iso: string) =>
  new Date(iso).toLocaleString(isEn() ? 'en-GB' : 'ar-EG', { weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' });
const leftText = (ms: number) =>
  ms >= 3600000 ? t('{0} ساعة و{1} دقيقة', ar(Math.floor(ms / 3600000)), ar(Math.floor((ms % 3600000) / 60000))) : t('{0} دقيقة', ar(Math.max(1, Math.ceil(ms / 60000))));

/**
 * The deposit block on a pickup order (change 1.33): pay it (card, or InstaPay to Daghta with a receipt),
 * then what it means at each step. The rest of the price is paid to the shop at the counter.
 */
export function DepositPanel({ order: o }: { order: Order }) {
  const { session } = useAuth();
  const [rules, setRules] = useState<DepositRules | null>(null);
  const [card, setCard] = useState(false);
  const [pay, setPay] = useState<PaySettings | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [ref, setRef] = useState('');
  const [busy, setBusy] = useState(false);
  const open = depositOpen(o);
  const now = useNow(open ? 30000 : 0);
  useEffect(() => {
    depositRules().then(setRules);
    if (open) { cardAvailable().then(setCard); paySettings().then(setPay); }
  }, [open]);

  const dep = Number(o.deposit ?? 0);
  const rest = Number(o.items_total) - dep;
  const st = o.deposit_status ?? 'none';
  if (st === 'none') return null;
  const s = DEPOSIT_STATUS[st];
  const payLeft = Math.max(0, new Date(o.created_at).getTime() + (rules?.payHours ?? 2) * 3600000 - now);
  const transfer = !!pay && (!!pay.instapay_address || !!pay.wallet_number);

  async function sendReceipt() {
    if (!photo || !session) return;
    setBusy(true);
    try {
      const path = await uploadPhoto(photo, session.user.id, 'receipts');
      const { error } = await supabase.rpc('submit_deposit_proof', { p_order: o.id, p_path: path, p_ref: ref.trim() });
      if (error) throw error;
      setPhoto(null); toast(t('الإيصال وصلنا. أول ما نأكّد، رقم المحل وعنوانه هيظهروا.'));
    } catch (e) { toast(friendlyError(e)); }
    setBusy(false);
  }
  async function byCard() {
    setBusy(true);
    const err = await payByCard(o.id);
    setBusy(false);
    if (err) toast(err);
  }

  return (
    <View style={{ backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: open ? 1.5 : 1, borderColor: open ? colors.primary : colors.line, padding: 16, gap: 14 }}>
      <Row gap={12}>
        <View style={{ width: 42, height: 42, borderRadius: 12, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="bookmark" size={21} color={colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Muted size={12}>{t('عربون الحجز')}</Muted>
          <T w="bold" size={17}>{money(dep)} {t('ج.م')}</T>
        </View>
        <Pill label={s.label} tone={s.tone} />
      </Row>

      {open ? (
        <>
          <T size={14}>{t('ادفع العربون عشان المحل يحجز القطعة باسمك ويبدأ يجهّزها. الباقي')}{' '}<T w="bold" size={14}>{money(rest)} {t('ج.م')}</T>{' '}{t('تدفعه في المحل وانت بتستلم.')}</T>
          <Muted size={13}>{t('رقم المحل وعنوانه بيظهروا بعد العربون. لو المحل لغى أو القطعة طلعت مش زي العرض، العربون بيرجعلك.')}</Muted>
          {st === 'failed' && o.deposit_note ? (
            <Row gap={8} style={{ backgroundColor: colors.badSoft, borderRadius: radius.md, padding: 12, alignItems: 'flex-start' }}>
              <Icon name="alert-circle" size={18} color={colors.bad} />
              <T size={13.5} color={colors.bad} style={{ flex: 1 }}>{t('العربون ماوصلناش: «{0}». جرّب تاني.', o.deposit_note)}</T>
            </Row>
          ) : null}
          <Row gap={6} style={{ backgroundColor: colors.warnSoft, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 8, alignSelf: 'flex-start' }}>
            <Icon name="time" size={15} color={colors.warn} /><T w="semibold" size={13} color={colors.warn}>{t('فاضل {0} على دفع العربون', leftText(payLeft))}</T>
          </Row>

          {card ? (
            <>
              <Btn icon="card" title={t('ادفع {0} ج.م بالبطاقة أو المحفظة', money(dep))} loading={busy} onPress={byCard} />
              <Row gap={6} style={{ justifyContent: 'center' }}><Icon name="lock-closed" size={13} color={colors.muted} /><Muted size={12}>{t('دفع آمن عن طريق Paymob، بيانات بطاقتك مش بتعدّي علينا')}</Muted></Row>
            </>
          ) : null}

          {transfer ? (
            <View style={{ gap: 10 }}>
              {card ? <Muted size={12.5} center>{t('أو حوّل بـ InstaPay')}</Muted> : null}
              <T size={13.5}>{t('حوّل')}{' '}<T w="bold" size={13.5}>{money(dep)} {t('ج.م')}</T>{' '}{t('لحساب ضغطة، وبعدين ارفع صورة الإيصال.')}</T>
              {pay!.instapay_address ? <View style={{ gap: 4 }}><Muted size={12}>{t('عنوان InstaPay')}</Muted><CopyBox text={pay!.instapay_address} /></View> : null}
              {pay!.wallet_number ? <View style={{ gap: 4 }}><Muted size={12}>{t('رقم المحفظة (فودافون كاش وغيرها)')}</Muted><CopyBox text={pay!.wallet_number} /></View> : null}
              <Muted size={12.5}>{pay!.account_name ? t('اتأكد إن الاسم اللي بيظهرلك هو {0}، ', pay!.account_name) : ''}{t('واكتب رقم الأوردر {0} في ملاحظة التحويل.', orderNo(o.order_no))}</Muted>
              <Press onPress={async () => { try { const u = await pickPhoto(); if (u) setPhoto(u); } catch { toast(t('الصورة دي مش مدعومة. اختار صورة JPG أو PNG.')); } }}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: radius.md, borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#C9DDF2' }}>
                {photo ? <Image source={{ uri: photo }} style={{ width: 52, height: 52, borderRadius: 10 }} /> : (
                  <View style={{ width: 52, height: 52, borderRadius: 10, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}><Icon name="image-up" size={24} color={colors.primary} /></View>
                )}
                <View style={{ flex: 1 }}>
                  <T w="semibold" size={14}>{photo ? t('صورة الإيصال جاهزة') : t('ارفع صورة الإيصال')}</T>
                  <Muted size={12}>{photo ? t('اضغط للتغيير') : t('صورة الشاشة من InstaPay أو المحفظة')}</Muted>
                </View>
              </Press>
              <Field value={ref} onChangeText={setRef} placeholder={t('رقم العملية (اختياري)')} ltr icon="receipt" />
              <Btn icon="upload" kind={card ? 'secondary' : 'primary'} title={t('ابعت الإيصال')} disabled={!photo} loading={busy} onPress={sendReceipt} />
            </View>
          ) : null}

          {!card && !transfer && pay ? <Muted size={13}>{t('دفع العربون لسه مش متاح. كلّمنا من «عندك مشكلة في الأوردر؟».')}</Muted> : null}
        </>
      ) : null}

      {st === 'review' ? (
        <Row gap={8} style={{ backgroundColor: colors.primarySoft, borderRadius: radius.md, padding: 12 }}>
          <Icon name="hourglass" size={18} color={colors.primary} />
          <T size={13.5} style={{ flex: 1 }}>{t('الإيصال وصلنا{0} وبنراجعه. أول ما نأكّد، رقم المحل وعنوانه هيظهروا والمحل يبدأ يجهّز.', o.deposit_ref ? t(' (عملية {0})', o.deposit_ref) : '')}</T>
        </Row>
      ) : null}
      {st === 'paid' ? (
        <View style={{ gap: 6 }}>
          <Row gap={8}><Icon name="checkmark-circle" size={18} color={colors.good} /><T size={13.5} style={{ flex: 1 }}>{t('القطعة محجوزة باسمك. هتدفع في المحل {0} ج.م بس.', money(rest))}</T></Row>
          {o.hold_until ? <Muted size={13}>{t('استلمها قبل {0}. لو ماجيتش، العربون مش هيرجع.', when(o.hold_until))}</Muted>
            : <Muted size={13}>{t('أول ما المحل يجهّزها هتفضل محجوزة {0} ساعة.', ar(rules?.holdHours ?? 48))}</Muted>}
        </View>
      ) : null}
      {st === 'used' ? <Muted size={13}>{t('العربون اتخصم من سعر القطع. دفعت {0} ج.م للمحل.', money(rest))}</Muted> : null}
      {st === 'forfeited' ? <Muted size={13}>{o.cancel_reason === 'no_show' ? t('ماجيتش تستلم في المعاد، فالحجز اتلغى والعربون مارجعش.') : t('لغيت بعد دفع العربون، فالعربون مارجعش.')}</Muted> : null}
      {st === 'refund_check' ? <Muted size={13}>{t('رفضت القطعة. بنأكد مع المحل، وبعدها هنرجّعلك {0} ج.م.', money(dep))}</Muted> : null}
      {st === 'disputed' ? <Muted size={13}>{t('المحل قال إنك استلمت القطعة. فريق ضغطة بيراجع وهيكلّمك.')}</Muted> : null}
      {st === 'refund_due' ? <Muted size={13}>{t('هنرجّعلك {0} ج.م على نفس طريقة الدفع خلال {1} أيام عمل.', money(dep), ar(3))}</Muted> : null}
      {st === 'refunded' ? <Muted size={13}>{t('رجّعنالك {0} ج.م.', money(dep))}{o.deposit_note ? ` ${o.deposit_note}` : ''}</Muted> : null}
      {st === 'void' ? <Muted size={13}>{o.cancel_reason === 'unpaid' ? t('العربون مااتدفعش في المعاد، فالأوردر اتلغى والقطع رجعت للطلب.') : t('الأوردر اتلغى قبل دفع العربون.')}</Muted> : null}
    </View>
  );
}

/** The shop's side of a deposit order. Shop screens are Arabic only. */
export function ShopDepositCard({ order: o }: { order: Order }) {
  const [asking, setAsking] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const st = o.deposit_status ?? 'none';
  if (st === 'none') return null;
  const dep = Number(o.deposit ?? 0);
  const rest = Number(o.items_total) - dep;

  async function answer(agree: boolean) {
    if (!agree && !note.trim()) return toast('اكتب إيه اللي حصل.');
    setBusy(true);
    const { error } = await supabase.rpc('shop_answer_refusal', { p_order: o.id, p_agree: agree, p_note: note.trim() });
    setBusy(false);
    if (error) return toast(friendlyError(error));
    setAsking(false);
    toast(agree ? 'تمام، هنرجّع العربون للعميل.' : 'ردّك وصل لفريق ضغطة.');
  }

  const box = (bg: string, icon: string, color: string, text: string) => (
    <Row gap={10} style={{ backgroundColor: bg, borderRadius: radius.lg, padding: 14, alignItems: 'flex-start' }}>
      <Icon name={icon} size={20} color={color} /><T size={14} color={color} style={{ flex: 1 }}>{text}</T>
    </Row>
  );

  if (st === 'awaiting' || st === 'failed' || st === 'review') {
    return box(colors.warnSoft, 'hourglass', colors.warn, `العميل لسه مادفعش العربون (${money(dep)} ج.م). متجهّزش القطعة قبل ما يتدفع، هنبلّغك أول ما يوصل. لو مادفعش في المعاد الأوردر بيتلغى لوحده.`);
  }
  if (st === 'paid') {
    return (
      <View style={{ backgroundColor: colors.goodSoft, borderRadius: radius.lg, padding: 14, gap: 6 }}>
        <Row gap={8}><Icon name="checkmark-circle" size={20} color={colors.good} /><T w="bold" size={15} color="#0B4D37" style={{ flex: 1 }}>العميل دفع العربون، القطعة محجوزة له</T></Row>
        <T size={14} color="#0B4D37">حصّل منه <T w="bold" size={14} color="#0B4D37">{money(rest)} ج.م</T> بس وهو بيستلم. العربون ({money(dep)} ج.م) عند ضغطة، ومفيش عمولة عليك في الأوردر ده.</T>
        {o.hold_until ? <Muted size={12.5}>الحجز لحد {new Date(o.hold_until).toLocaleString('ar-EG', { weekday: 'long', hour: 'numeric', minute: '2-digit' })}. لو العميل ماجاش، ليك نص العربون تعويض.</Muted> : null}
      </View>
    );
  }
  if (st === 'used') return box(colors.soft, 'receipt', colors.muted, `العميل دفعلك ${money(rest)} ج.م والعربون ${money(dep)} ج.م لضغطة. مفيش عمولة عليك في الأوردر ده.`);
  if (st === 'forfeited') return box(colors.soft, 'cash', colors.ink, o.shop_comp_paid_at ? `العميل ماستلمش. حوّلنالك ${money(Number(o.shop_comp ?? 0))} ج.م تعويض.` : `العميل ماستلمش. ليك ${money(Number(o.shop_comp ?? 0))} ج.م تعويض هيتحوّلك من ضغطة.`);
  if (st === 'refund_check') {
    return (
      <View style={{ backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1.5, borderColor: colors.primary, padding: 16, gap: 10 }}>
        <T w="bold" size={15}>العميل رفض القطعة. أكّد إنه ماخدهاش</T>
        <Muted size={13}>لو أكّدت، العربون بيرجعله. لو مارديتش خلال ٢٤ ساعة، بيرجعله برضه.</Muted>
        <Row gap={10}>
          <Btn title="أيوه، ماخدهاش" loading={busy} onPress={() => answer(true)} style={{ flex: 1 }} />
          <Btn kind="secondary" title="لأ، خدها" onPress={() => setAsking(true)} style={{ flex: 1, minHeight: 46 }} />
        </Row>
        <Sheet open={asking} onClose={() => setAsking(false)} title="العميل خد القطعة؟">
          <View style={{ gap: 12 }}>
            <Field value={note} onChangeText={setNote} multiline placeholder="اكتب إيه اللي حصل" />
            <Muted size={12.5}>فريق ضغطة هيراجع ويكلّمك انت والعميل.</Muted>
            <Btn kind="danger" title="ابعت" loading={busy} disabled={!note.trim()} onPress={() => answer(false)} />
          </View>
        </Sheet>
      </View>
    );
  }
  if (st === 'disputed') return box(colors.primarySoft, 'chatbubbles', colors.primary, 'ردّك وصل. فريق ضغطة بيراجع العربون وهيكلّمك.');
  if (st === 'refund_due' || st === 'refunded') return box(colors.soft, 'return-down-back', colors.muted, `العربون (${money(dep)} ج.م) ${st === 'refunded' ? 'رجع' : 'هيرجع'} للعميل من ضغطة. مفيش عليك حاجة.`);
  return null;
}

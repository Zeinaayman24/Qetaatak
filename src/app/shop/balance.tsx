import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { BackBar, Btn, Card, CopyBox, Empty, Field, Icon, Loading, Muted, PhotoPicker, Pill, Row, Screen, Section, Sheet, T, toast } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { ago, ar, friendlyError, money, orderNo } from '@/lib/data';
import { useLive } from '@/lib/live';
import { paySettings, type PaySettings } from '@/lib/payments';
import { pickPhoto, uploadPhoto } from '@/lib/photos';
import { supabase } from '@/lib/supabase';
import { colors, radius } from '@/lib/theme';

type Balance = {
  free: boolean; free_until: string; pct: number; limit: number; fees: number; paid: number; owed: number; due_at: string | null;
  orders: { id: string; order_no: number; at: string; total: number; fee: number; state: 'free' | 'fee' | 'returned'; parts: string | null }[];
  statements: { month: string; amount: number }[];
  payments: { id: string; amount: number; ref: string; status: 'pending' | 'confirmed' | 'rejected'; note: string; created_at: string }[];
};

/**
 * «حسابك مع ضغطة» (Product Register B16). Each shop is free for a period from its approval; after that
 * commission is owed only after a sale (no top-up), with a monthly statement, settled here.
 */
export default function ShopBalance() {
  const { ready, session } = useAuth();
  const uid = session?.user.id;
  const [pay, setPay] = useState(false);
  const [amount, setAmount] = useState('');
  const [ref, setRef] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [bank, setBank] = useState<PaySettings | null>(null);
  const { data, loading } = useLive(async () => {
    if (!uid) return null;
    const { data, error } = await supabase.rpc('my_balance');
    if (error) throw error;
    return data as Balance;
  }, ['orders', 'shop_settlements'], [uid]);

  if (ready && !session) return <Redirect href="/login" />;
  const back = () => (router.canGoBack() ? router.back() : router.replace('/account'));
  if (loading && !data) return <Screen><BackBar title="حسابك مع ضغطة" onBack={back} /><Loading /></Screen>;
  const b = data;
  if (!b) return <Screen><BackBar title="حسابك مع ضغطة" onBack={back} /><Empty text="مقدرناش نحمّل الحساب." /></Screen>;
  const free = b.free && b.owed <= 0;
  const over = b.owed >= b.limit;
  const day = (iso: string) => new Date(iso).toLocaleDateString('ar-EG', { day: 'numeric', month: 'long', year: 'numeric' });
  const endingSoon = b.free && new Date(b.free_until).getTime() - Date.now() < 30 * 86400000;

  async function openPay() {
    setAmount(String(Math.round(b!.owed)));
    setPay(true);
    if (!bank) setBank(await paySettings());
  }
  async function sendPayment() {
    const n = Number(amount.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))));
    if (!n || n <= 0) return toast('اكتب المبلغ اللي حوّلته.');
    setBusy(true);
    try {
      const path = photo ? await uploadPhoto(photo, uid!, 'receipts') : null;
      const { error } = await supabase.rpc('submit_settlement', { p_amount: n, p_ref: ref.trim(), p_path: path });
      if (error) throw error;
      setPay(false); setPhoto(null); setRef(''); toast('وصلنا، هنأكّد خلال يوم عمل ونبلّغك.');
    } catch (e) { toast(friendlyError(e)); }
    setBusy(false);
  }

  return (
    <Screen>
      <BackBar title="حسابك مع ضغطة" onBack={back} />

      <View style={{ backgroundColor: colors.ink, borderRadius: 20, padding: 18, gap: 12 }}>
        {free ? (
          <>
            <T w="bold" size={22} color="#fff">ضغطة مجاناً لحد {day(b.free_until)}</T>
            <T size={14} color="rgba(255,255,255,.8)">انت مش مطالب بأي حاجة دلوقتي.</T>
            {endingSoon ? <T size={13} color={colors.accent}>الفترة المجانية بتخلص {day(b.free_until)}. بعدها العمولة {ar(b.pct)}٪ من سعر القطع بس.</T> : null}
          </>
        ) : (
          <>
            <T size={13} color="rgba(255,255,255,.7)">عليك لضغطة</T>
            <T w="bold" size={34} color={over ? '#FFB4B4' : '#fff'}>{money(b.owed)} <T size={15} color="rgba(255,255,255,.6)">ج.م</T></T>
            {b.due_at && b.owed > 0 ? <T size={13} color="rgba(255,255,255,.75)">مستحق يوم {day(b.due_at)}</T> : null}
            <View style={{ height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,.15)' }}>
              <View style={{ width: `${Math.min(100, (b.owed / Math.max(1, b.limit)) * 100)}%`, height: 6, borderRadius: 3, backgroundColor: over ? colors.bad : colors.accent }} />
            </View>
            <T size={12.5} color="rgba(255,255,255,.7)">{over ? 'وصلت للحد. سدّد عشان ترجع تستقبل طلبات جديدة.' : `الحد ${money(b.limit)} ج.م، سدّد قبله عشان الطلبات الجديدة ماتقفش.`}</T>
            {b.owed > 0 ? <Btn kind="primary" icon="wallet" title="سدّد دلوقتي" onPress={openPay} /> : null}
          </>
        )}
      </View>

      <Card>
        <T w="bold" size={15}>إزاي العمولة بتشتغل</T>
        {[
          ['checkmark-circle', 'بتدفع بس لما تبيع: العمولة بتتحسب لما العميل يستلم.'],
          ['cash', 'الفلوس كلها بتوصلك انت من العميل، مفيش شحن رصيد.'],
          ['receipt', `العمولة ${ar(b.pct)}٪ من سعر القطع بس، من غير التوصيل.`],
          ['return-up-back', 'لو العميل رجّع القطعة، العمولة بتتشال.'],
          ['calendar', 'كشف حساب كل شهر، والسداد خلال ٧ أيام.'],
        ].map(([icon, t]) => (
          <Row key={t} gap={10} style={{ alignItems: 'flex-start' }}><Icon name={icon} size={18} color={colors.primary} /><T size={13.5} style={{ flex: 1 }}>{t}</T></Row>
        ))}
      </Card>

      <Section title={`الأوردرات اللي اتباعت (${ar(b.orders.length)})`}>
        {b.orders.length ? (
          <View style={{ backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 14 }}>
            {b.orders.map((o, i) => (
              <Row key={o.id} gap={12} style={[{ paddingVertical: 12 }, i < b.orders.length - 1 && { borderBottomWidth: 1, borderColor: colors.line }]}>
                <View style={{ flex: 1 }}>
                  <T w="semibold" size={14} numberOfLines={1}>{o.parts || 'أوردر'}</T>
                  <Muted size={12}>أوردر {orderNo(o.order_no)}، {money(o.total)} ج.م{o.at ? ` · ${ago(o.at)}` : ''}</Muted>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  {o.state === 'fee' ? <T w="bold" size={14}>{money(o.fee)} ج.م</T> : null}
                  <Muted size={11.5}>{o.state === 'fee' ? 'عمولة' : o.state === 'free' ? 'مجاناً' : 'اتشالت (مرتجع)'}</Muted>
                </View>
              </Row>
            ))}
          </View>
        ) : <Empty icon="receipt-outline" text="لما عميل يستلم أوردر منك، هيظهر هنا." />}
      </Section>

      {b.statements.length ? (
        <Section title="كشوف الحساب">
          {b.statements.map((st) => (
            <Row key={st.month} gap={10} style={{ backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.line, padding: 12 }}>
              <T w="semibold" size={14} style={{ flex: 1 }}>{new Date(st.month).toLocaleDateString('ar-EG', { month: 'long', year: 'numeric' })}</T>
              <T w="bold" size={14}>{money(st.amount)} ج.م</T>
            </Row>
          ))}
        </Section>
      ) : null}

      {b.payments.length ? (
        <Section title="مدفوعاتك">
          {b.payments.map((p) => (
            <Row key={p.id} gap={10} style={{ backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.line, padding: 12 }}>
              <View style={{ flex: 1 }}><T w="semibold" size={14}>{money(p.amount)} ج.م</T><Muted size={12}>{ago(p.created_at)}{p.note ? `، ${p.note}` : ''}</Muted></View>
              <Pill label={p.status === 'confirmed' ? 'اتأكد' : p.status === 'rejected' ? 'اترفض' : 'بنراجع'} tone={p.status === 'confirmed' ? 'good' : p.status === 'rejected' ? 'bad' : 'wait'} />
            </Row>
          ))}
        </Section>
      ) : null}

      <Sheet open={pay} onClose={() => setPay(false)} title="سدّد العمولة">
        <View style={{ gap: 12 }}>
          <Muted size={13}>حوّل المبلغ لضغطة على واحد من دول، وارفع صورة التحويل:</Muted>
          {bank?.instapay_address ? <View style={{ gap: 4 }}><Muted size={12}>InstaPay</Muted><CopyBox text={bank.instapay_address} /></View> : null}
          {bank?.wallet_number ? <View style={{ gap: 4 }}><Muted size={12}>محفظة</Muted><CopyBox text={bank.wallet_number} /></View> : null}
          {bank?.bank_account ? <View style={{ gap: 4 }}><Muted size={12}>حساب بنكي</Muted><CopyBox text={bank.bank_account} /></View> : null}
          <Field label="المبلغ اللي حوّلته" value={amount} onChangeText={setAmount} keyboardType="number-pad" ltr />
          <Field label="رقم العملية (اختياري)" value={ref} onChangeText={setRef} ltr />
          <PhotoPicker uri={photo} onPick={async () => { try { const u = await pickPhoto(); if (u) setPhoto(u); } catch { toast('الصورة دي مش مدعومة.'); } }} hint="صورة الشاشة للتحويل" />
          <Btn icon="upload" title="ابعت" loading={busy} onPress={sendPayment} />
        </View>
      </Sheet>
    </Screen>
  );
}

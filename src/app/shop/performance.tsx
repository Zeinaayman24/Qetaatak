import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { BackBar, Btn, Card, Empty, Field, Icon, Loading, Muted, Notice, Pill, PhotoPicker, Row, Screen, Sheet, T, toast } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { REPORT_CATEGORIES, TICKET_STATUS, ar, friendlyError, orderNo } from '@/lib/data';
import { must, useLive } from '@/lib/live';
import { pickPhoto, uploadPhoto } from '@/lib/photos';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';

type Metrics = { reply_min: number | null; answered_pct: number | null; offers: number; sold: number; cancels: number; refusal_pct: number | null; rating: number | null; ratings: number };
type Complaint = { id: string; ticket_no: number; order_no: number; category: string; status: string; created_at: string; replied: boolean };
type Level = 'good' | 'warn' | 'risk' | null;
const LEVEL: Record<'good' | 'warn' | 'risk', { label: string; tone: 'good' | 'wait' | 'bad' }> = {
  good: { label: 'كويس', tone: 'good' }, warn: { label: 'محتاج تحسين', tone: 'wait' }, risk: { label: 'خطر', tone: 'bad' },
};

/** «أداء محلك» (Product Register B17, B18, B21): the last 30 days, complaints, and the pause page. */
export default function ShopPerformance() {
  const { ready, session, shop } = useAuth();
  const [replying, setReplying] = useState<Complaint | null>(null);
  const [body, setBody] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { data, loading, reload } = useLive(async () => {
    const [m, c] = await Promise.all([supabase.rpc('shop_performance'), supabase.rpc('shop_complaints')]);
    return { m: must(m) as Metrics, complaints: (must(c) ?? []) as Complaint[] };
  }, ['orders', 'reports'], [session?.user.id]);

  if (ready && !session) return <Redirect href="/login" />;
  const back = () => (router.canGoBack() ? router.back() : router.replace('/shop'));
  if (loading && !data) return <Screen><BackBar title="أداء محلك" onBack={back} /><Loading /></Screen>;
  const m = data?.m;

  const rows: { label: string; value: string; level: Level; tip?: string }[] = m ? [
    { label: 'متوسط وقت الرد', value: m.reply_min == null ? '—' : m.reply_min >= 60 ? `${ar(Math.floor(m.reply_min / 60))} ساعة${m.reply_min % 60 ? ` و${ar(m.reply_min % 60)} دقيقة` : ''}` : `${ar(m.reply_min)} دقيقة`,
      level: m.reply_min == null ? null : m.reply_min > 60 ? 'warn' : 'good', tip: 'ردّ أسرع: شغّل الإشعارات وقفّل المحل في التطبيق لما تكون مش موجود.' },
    { label: 'نسبة الطلبات اللي ردّيت عليها', value: m.answered_pct == null ? '—' : `${ar(m.answered_pct)}٪`, level: null },
    { label: 'العروض اللي اتباعت', value: `${ar(m.sold)} من ${ar(m.offers)}`, level: null },
    { label: 'إلغاءات منك', value: ar(m.cancels), level: m.cancels >= 3 ? 'risk' : m.cancels === 2 ? 'warn' : 'good', tip: 'شيل العرض أول ما القطعة تتباع عشان متضطرش تلغي.' },
    { label: 'رفض العملاء', value: m.refusal_pct == null ? '—' : `${ar(m.refusal_pct)}٪`,
      level: m.refusal_pct == null ? null : m.refusal_pct > 10 ? 'risk' : m.refusal_pct >= 5 ? 'warn' : 'good', tip: 'صوّر القطعة نفسها واكتب حالتها بدقة عشان متترفضش.' },
    { label: 'التقييم', value: m.rating == null ? '—' : `★ ${ar(String(m.rating)).replace('.', '٫')} (${ar(m.ratings)})`,
      level: m.rating == null ? null : m.rating < 3 && m.ratings >= 10 ? 'risk' : m.rating < 3.5 ? 'warn' : 'good' },
  ] : [];
  const weak = rows.filter((r) => r.level === 'warn' || r.level === 'risk');

  async function sendReply() {
    if (!replying || !body.trim()) return;
    setBusy(true);
    try {
      const path = photo && session ? await uploadPhoto(photo, session.user.id) : null;
      const { error } = await supabase.rpc('reply_complaint', { p_report: replying.id, p_body: body.trim(), p_photo: path });
      if (error) throw error;
      setReplying(null); setBody(''); setPhoto(null); toast('ردّك وصل، وهنبلّغك بالقرار.'); reload();
    } catch (e) { toast(friendlyError(e)); }
    setBusy(false);
  }

  return (
    <Screen>
      <BackBar title="أداء محلك" onBack={back} />

      {shop?.status === 'closed' ? (
        <Card style={{ backgroundColor: colors.badSoft }}>
          <T size={14.5}>المحل اتقفل بسبب مخالفة اتفاقية التاجر. لو شايف إن ده غلط، اكتبلنا.</T>
          <Btn kind="secondary" title="اكتبلنا" onPress={() => router.push('/support')} />
        </Card>
      ) : shop?.status === 'suspended' ? (
        <Card style={{ backgroundColor: colors.badSoft, gap: 10 }}>
          <Row gap={8}><Icon name="pause-circle" size={24} color={colors.bad} /><T w="bold" size={18} color={colors.bad}>المحل موقوف مؤقتاً</T></Row>
          {shop.suspend_reason ? (
            <T size={14}>السبب: {shop.suspend_reason}{shop.suspended_at ? ` · من ${new Date(shop.suspended_at).toLocaleDateString('ar-EG', { day: 'numeric', month: 'long' })}` : ''}</T>
          ) : null}
          <Muted size={13.5}>مش هتوصلك طلبات جديدة. الأوردرات الشغالة كمّلها عادي، ولو عليك فلوس لعملاء لازم ترجّعها.</Muted>
          {shop.reopen_step === 'pay' ? (
            <>
              <T size={14}>سدّد المبلغ المستحق والمحل هيرجع يستقبل طلبات أول ما نأكّد.</T>
              <Btn title="سدّد دلوقتي" onPress={() => router.push('/shop/balance')} />
            </>
          ) : (
            <>
              <T size={14}>عشان نرجّع المحل: {shop.reopen_step || 'كلّمنا ونقولك الخطوة المطلوبة'}</T>
              <Btn kind="secondary" title="اكتبلنا" onPress={() => router.push('/support')} />
              <Muted size={12.5}>هنرد خلال يوم عمل.</Muted>
            </>
          )}
        </Card>
      ) : null}

      {weak.length && shop?.status === 'approved' ? <Notice icon="warning">تنبيه: {weak[0].label} محتاج تحسين. لو فضل كده، المحل ممكن يتوقف مؤقتاً.</Notice> : null}

      <Card>
        <Row style={{ justifyContent: 'space-between' }}><T w="bold" size={16}>آخر ٣٠ يوم</T></Row>
        {rows.map((r, i) => (
          <Row key={r.label} gap={10} style={{ paddingVertical: 10, borderTopWidth: i ? 1 : 0, borderColor: colors.line }}>
            <T size={14} style={{ flex: 1 }}>{r.label}</T>
            <T w="bold" size={14.5}>{r.value}</T>
            {r.level ? <Pill label={LEVEL[r.level].label} tone={LEVEL[r.level].tone} /> : null}
          </Row>
        ))}
      </Card>
      {weak.filter((r) => r.tip).map((r) => (
        <Row key={r.label} gap={10} style={{ backgroundColor: colors.warnSoft, borderRadius: 14, padding: 12, alignItems: 'flex-start' }}>
          <Icon name="bulb" size={18} color={colors.warn} /><T size={13.5} style={{ flex: 1 }}>{r.tip}</T>
        </Row>
      ))}

      <T w="bold" size={17}>شكاوى على محلك</T>
      {data?.complaints.length ? (
        <Card>
          {data.complaints.map((c, i) => (
            <View key={c.id} style={{ gap: 6, paddingVertical: 10, borderTopWidth: i ? 1 : 0, borderColor: colors.line }}>
              <Row gap={8}>
                <T w="semibold" size={14} style={{ flex: 1 }}>أوردر {orderNo(c.order_no)} · {REPORT_CATEGORIES[c.category] ?? c.category}</T>
                <Pill label={TICKET_STATUS[c.status] ?? c.status} tone={c.status === 'resolved' ? 'good' : 'wait'} />
              </Row>
              {c.status !== 'resolved' ? <Btn kind="link" title={c.replied ? 'ردّ تاني' : 'ردّ على الشكوى'} onPress={() => setReplying(c)} style={{ alignSelf: 'flex-start' }} /> : null}
            </View>
          ))}
          <Muted size={12}>بيانات العميل مش بتظهر هنا غير لو كان عندك أوردر معاه.</Muted>
        </Card>
      ) : <Empty icon="happy-outline" text="مفيش شكاوى على محلك. كمّل كده." />}

      <Sheet open={!!replying} onClose={() => setReplying(null)} title="ردّ على الشكوى">
        <View style={{ gap: 12 }}>
          <Field value={body} onChangeText={setBody} multiline placeholder="اكتب ردّك لفريق ضغطة" />
          <PhotoPicker uri={photo} onPick={async () => { try { const u = await pickPhoto(); if (u) setPhoto(u); } catch { toast('الصورة دي مش مدعومة. اختار صورة JPG أو PNG.'); } }} hint="أضف صورة (اختياري)" />
          <Btn title="ابعت" loading={busy} disabled={!body.trim()} onPress={sendReply} />
        </View>
      </Sheet>
    </Screen>
  );
}

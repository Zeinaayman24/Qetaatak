import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { ChatFrame, type ChatMsg, type Chip } from '@/components/chat';
import { Loading, Muted, Screen, T, toast } from '@/components/ui';
import { aiAvailable, askSupport, norm, parse } from '@/lib/assistant';
import { useAuth } from '@/lib/auth';
import { ORDER_STEPS, REPORT_CATEGORIES, friendlyError, reqNo, type Report, type Request, type TicketMessage } from '@/lib/data';
import { must, useLive } from '@/lib/live';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';

/**
 * One complaint = one conversation. The assistant tries to solve it first; if it can't (or the customer asks),
 * it hands the same chat to customer service. An agent joins, the customer keeps writing here, until the agent ends it.
 */
export function CaseChat({ id, fresh }: { id: string; fresh?: boolean }) {
  const { session } = useAuth();
  const uid = session?.user.id;
  const [text, setText] = useState('');
  const [typing, setTyping] = useState(false);
  const [busy, setBusy] = useState(false);
  const [aiOn, setAiOn] = useState(false);
  const [aiChips, setAiChips] = useState<string[]>([]);
  const helped = useRef(false);

  const { data, reload } = useLive(async () => {
    const t = must(await supabase.from('reports').select('*').eq('id', id).maybeSingle()) as Report | null;
    const msgs = must(await supabase.from('ticket_messages').select('*').eq('report_id', id).order('created_at')) as TicketMessage[];
    let req: Request | null = null; let warranty: number | null = null;
    if (t?.request_id) {
      req = must(await supabase.from('requests').select('*').eq('id', t.request_id).maybeSingle()) as Request | null;
      if (req?.chosen_quote_id) {
        const q = await supabase.from('quotes').select('warranty_days').eq('id', req.chosen_quote_id).maybeSingle();
        warranty = q.data?.warranty_days ?? null;
      }
    }
    return { t, msgs, req, warranty };
  }, ['ticket_messages', 'reports'], [id]);

  useEffect(() => { aiAvailable().then(setAiOn); }, []);

  const t = data?.t;
  const status = t?.status;

  /* ---------- the assistant's turn */
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
  async function botSay(body: string) {
    setTyping(true);
    await wait(650);
    const { error } = await supabase.from('ticket_messages').insert({ report_id: id, body, kind: 'bot' });
    setTyping(false);
    if (error) toast(friendlyError(error));
    reload();
  }

  async function help() {
    if (!t || !data) return;
    const r = data.req;
    const body = norm(t.body);
    const late = /اتاخر|متاخر|تاخير|مجاش|موصلش|لسه|فين/.test(body);
    const bad = /بايظ|عيب|مش مظبوط|غلط|مكسور|خدش|مش شغال|ترجيع|ارجع|استرجاع|مضروب/.test(body);
    if (t.category === 'shop' || t.category === 'customer' || t.category === 'other' || /موظف|خدمه العملاء|فلوسي|نصب/.test(body)) {
      await botSay('دي محتاجة حد من فريقنا يراجعها بنفسه.');
      return escalate();
    }
    if (t.category === 'app') {
      await botSay('آسفين على الإزعاج 🙏 جرّب الحاجات دي الأول:\n• اقفل التطبيق وافتحه تاني\n• اتأكد إن النت شغال\n• لو على الموقع، اعمل تحديث للصفحة\n• اتأكد إنك على آخر نسخة من التطبيق');
    } else if (!r) {
      await botSay('شوف صفحة «طلباتي»، فيها حالة كل طلب ورقمه. ولو المشكلة في قطعة اشتريتها، المحل عليه ضمان وتقدر تكلّمه من صفحة الطلب.');
    } else if (r.status === 'open') {
      await botSay(`طلبك ${reqNo(r.num)} (${r.part}) لسه بيستقبل عروض من المحلات. أغلب الطلبات بيوصلها أول عرض خلال ساعة، وهيوصلك إشعار أول ما يوصل.`);
    } else if (r.status === 'cancelled') {
      await botSay(`طلبك ${reqNo(r.num)} اتلغى، فمفيش أي مبلغ مطلوب منك عليه. لو عايز القطعة تاني ابعت طلب جديد.`);
    } else if (r.status === 'chosen') {
      const st = ORDER_STEPS.find((s) => s.key === r.order_status)?.label ?? 'المحل بيجهّز';
      await botSay(`طلبك ${reqNo(r.num)} (${r.part}) اتأكد مع المحل، وحالته دلوقتي: «${st}».\n` +
        (late ? 'لو اتأخر عن المعاد، أسرع حل إنك تكلّم المحل مباشرة من الشات في صفحة الطلب، وهو بيرد بسرعة عادةً.' : 'تقدر تكلّم المحل مباشرة من الشات في صفحة الطلب.'));
    } else {
      const w = data.warranty;
      await botSay((bad ? 'آسفين إن القطعة طلعت فيها مشكلة. ' : '') +
        (w ? `القطعة دي عليها ضمان ${w} يوم من المحل. لو فيها عيب أو مش مطابقة، كلّم المحل من صفحة الطلب، والمحل ملزم يبدّلها أو يرجّع فلوسها خلال الضمان.`
           : 'المحل ما اداش ضمان على القطعة دي، بس لو القطعة مش زي الوصف (غلط في الموديل أو الجنب أو الحالة أو مش زي الصورة) من حقك تبدّلها أو ترجّع فلوسها. كلّم المحل من صفحة الطلب، ولو مارضيش أحوّلك لخدمة العملاء.'));
    }
    await botSay('كده المشكلة اتحلّت؟ لو لأ، أحوّلك لحد من خدمة العملاء.');
  }

  useEffect(() => {
    if (!fresh || helped.current || !data?.t || data.t.status !== 'bot') return;
    helped.current = true;
    help();
  }, [fresh, data?.t?.id]);

  async function escalate() {
    if (status !== 'bot') return;
    await botSay('هحوّلك لحد من خدمة العملاء 👋 هيكمّل معاك هنا في نفس المحادثة. مش لازم تفضل فاتح التطبيق، هيوصلك إشعار أول ما يرد.');
    const { error } = await supabase.rpc('escalate_ticket', { p_report: id });
    if (error) toast(friendlyError(error));
    reload();
  }
  async function resolve() {
    if (status === 'bot') await botSay('العفو! مبسوط إن المشكلة اتحلّت 🙏 لو احتجت أي حاجة أنا هنا.');
    const { error } = await supabase.rpc('customer_resolve_ticket', { p_report: id });
    if (error) toast(friendlyError(error));
    reload();
  }

  /* ---------- the customer's turn */
  async function write(body: string) {
    if (!body.trim() || busy) return;
    setBusy(true);
    const { error } = await supabase.from('ticket_messages').insert({ report_id: id, body: body.trim() });
    setBusy(false);
    if (error) return toast(friendlyError(error));
    setText('');
    reload();
    if (status !== 'bot') return; // people are handling it now

    if (aiOn && data) {
      setTyping(true);
      const history = [...data.msgs, { kind: 'user', body, sender_id: uid } as TicketMessage]
        .filter((m) => m.kind !== 'system')
        .map((m) => ({ role: m.kind === 'bot' ? 'assistant' as const : 'user' as const, content: m.body }));
      const r = await askSupport(history, {
        category: REPORT_CATEGORIES[t!.category], complaint: t!.body,
        order: data.req ? { num: data.req.num, part: data.req.part, status: data.req.status, order_status: data.req.order_status, warranty_days: data.warranty } : null,
      });
      setTyping(false);
      if (r) {
        setAiChips(r.quick_replies ?? []);
        if (r.action === 'escalate') { if (r.reply) await botSay(r.reply); return escalate(); }
        if (r.action === 'resolved') return resolve();
        return botSay(r.reply || '…');
      }
    }
    const p = parse(body);
    const n = norm(body);
    if (p.yes || p.intent === 'thanks' || n.includes('اتحل')) return resolve();
    return escalate(); // the free assistant can't go further than its first answer: hand over to people
  }

  /* ---------- render */
  if (!data) return <Screen><Loading /></Screen>;
  if (!t) return <Screen><Muted center>المحادثة دي مش موجودة.</Muted></Screen>;

  const hasTranscript = data.msgs.some((m) => m.kind === 'bot');
  const messages: ChatMsg[] = [
    ...(hasTranscript ? [] : [{ id: 'first', who: 'me' as const, text: t.body }]),
    ...(t.admin_reply ? [{ id: 'old', who: 'agent' as const, name: 'خدمة العملاء', text: t.admin_reply }] : []),
    ...data.msgs.map((m): ChatMsg => ({
      id: m.id,
      who: m.kind === 'system' ? 'system' : m.kind === 'bot' ? 'bot' : m.sender_id === uid ? 'me' : 'agent',
      name: m.kind === 'user' && m.sender_id !== uid ? 'خدمة العملاء' : undefined,
      text: m.body,
    })),
  ];
  const openReq: Chip[] = data.req ? [{ label: 'افتح الطلب', icon: 'receipt-outline', fn: () => router.push(`/customer/${data.req!.id}`) }] : [];

  let chips: Chip[] = [];
  if (status === 'bot') {
    chips = [
      ...aiChips.map((c) => ({ label: c, fn: () => write(c) })),
      { label: 'اتحلّت، شكراً', icon: 'checkmark', fn: () => write('اتحلّت، شكراً') },
      { label: 'لأ، عايز أكلّم موظف', icon: 'headset-outline', fn: () => write('لأ، عايز أكلّم موظف') },
      ...openReq,
    ];
  } else if (status === 'open' || status === 'in_progress') {
    chips = [...openReq, { label: 'المشكلة اتحلّت', icon: 'checkmark', fn: resolve }];
  } else {
    chips = [{ label: 'محادثة جديدة', main: true, icon: 'add', fn: () => router.replace('/assistant') }, { label: 'شكاويّا', fn: () => router.push('/support') }];
  }

  const sub = `T-${t.ticket_no}، ` + (status === 'bot' ? 'المساعد بيحاول يحلّها' : status === 'open' ? 'بنوصّلك بموظف…' : status === 'in_progress' ? 'موظف معاك دلوقتي' : 'المحادثة انتهت');
  const footer = status === 'open' ? (
    <View style={{ backgroundColor: colors.accentSoft, borderRadius: 14, padding: 12 }}>
      <T size={13.5} w="medium">حوّلناك لخدمة العملاء</T>
      <Muted size={12.5}>أول موظف فاضي هيرد عليك هنا. تقدر تكتب أي تفاصيل زيادة وهتوصله.</Muted>
    </View>
  ) : status === 'resolved' ? (
    <Muted center size={13}>المحادثة دي انتهت. لو عندك مشكلة تانية ابدأ محادثة جديدة.</Muted>
  ) : null;

  return (
    <ChatFrame
      subtitle={sub}
      live={status !== 'resolved'}
      avatar={status === 'in_progress' ? 'agent' : 'bot'}
      onBack={() => (router.canGoBack() ? router.back() : router.replace('/support'))}
      right={<Pressable onPress={() => router.push('/support')} hitSlop={8}><Muted size={12.5}>شكاويّا</Muted></Pressable>}
      messages={messages}
      typing={typing}
      busy={busy}
      chips={chips}
      footer={footer}
      composer={status === 'resolved' ? null : {
        value: text, onChange: setText, onSend: () => write(text),
        placeholder: status === 'in_progress' ? 'اكتب لخدمة العملاء…' : 'اكتب رسالتك…',
      }}
    />
  );
}

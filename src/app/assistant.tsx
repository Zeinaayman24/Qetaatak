import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable } from 'react-native';
import { CaseChat } from '@/components/CaseChat';
import { ChatFrame } from '@/components/chat';
import { Loading, Muted, Screen, toast } from '@/components/ui';
import { aiAvailable, askAi, parse, partIsSided, splitParts, type AiTurn, type Parsed } from '@/lib/assistant';
import { useAuth } from '@/lib/auth';
import { COMMON_PARTS, REPORT_CATEGORIES, SIDES, URGENCY, WANTED, ar, friendlyError, money, newId, reqNo, type Car, type Request } from '@/lib/data';
import { pickPhoto, uploadPhoto } from '@/lib/photos';
import { supabase } from '@/lib/supabase';
import { t as tr } from '@/lib/i18n';

/* The chat assistant: customers make part requests and complaints by talking to it.
   Free mode: guided buttons + on-device understanding of simple Arabic.
   Smart mode: turns on by itself when an AI key is added on the server (see supabase/functions/assistant). */

type Link = { label: string; href: string };
type Msg = { id: number; from: 'bot' | 'me'; text?: string; photo?: string; lines?: [string, string][]; links?: Link[] };
type Step = 'menu' | 'part' | 'car' | 'side' | 'cond' | 'urgency' | 'photo' | 'budget' | 'confirm' | 'edit'
  | 'c_cat' | 'c_order' | 'c_body' | 'c_confirm' | 'ai' | 'done';
type Cond = 'used' | 'new' | 'any';
type Urg = 'normal' | 'today' | 'urgent';
type Side = '' | 'right' | 'left' | 'front' | 'rear';
type Draft = {
  part: string; carKey: string | null; side: Side | null; cond: Cond | null; urgency: Urg | null;
  photo: string | null; photoAsked: boolean; budget: number | null; budgetAsked: boolean; notes: string;
};
type CDraft = { category: string | null; requestId: string | null; requestAsked: boolean; body: string };
type CarOpt = { key: string; label: string; make: string; model: string; year: number; vin: string };

const emptyDraft = (): Draft => ({ part: '', carKey: null, side: null, cond: null, urgency: 'normal', photo: null, photoAsked: false, budget: null, budgetAsked: false, notes: '' });
const emptyC = (): CDraft => ({ category: null, requestId: null, requestAsked: false, body: '' });
const STATUS: Record<string, string> = { open: tr('بيستقبل عروض'), chosen: tr('اتأكد مع المحل'), done: tr('اتسلّم'), cancelled: tr('اتلغى') };

export default function Assistant() {
  const { ready, session, profile } = useAuth();
  const params = useLocalSearchParams<{ mode?: string; part?: string; request?: string; cond?: string; side?: string; notes?: string; ticket?: string }>();
  const str = (v: unknown) => (typeof v === 'string' ? v : '');
  
  const [ticket, setTicket] = useState<{ id: string; fresh: boolean } | null>(str(params.ticket) ? { id: str(params.ticket), fresh: false } : null);
  useEffect(() => { const t = str(params.ticket); if (t && t !== ticket?.id) setTicket({ id: t, fresh: false }); }, [params.ticket]);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [step, setStep] = useState<Step>('menu');
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [basket, setBasket] = useState<Draft[]>([]); // parts already filled in, when the customer needs more than one
  const [cdraft, setC] = useState<CDraft>(emptyC);
  const [typing, setTyping] = useState(false);
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState('');
  const [cars, setCars] = useState<CarOpt[] | null>(null);
  const [recent, setRecent] = useState<Request[]>([]);
  const [aiOn, setAiOn] = useState(false);
  const [aiChips, setAiChips] = useState<string[]>([]);
  const aiLog = useRef<AiTurn[]>([]);
  const nextId = useRef(1);
  const queue = useRef(0);
  const started = useRef(false);
  const uid = session?.user.id;
  const isShop = !!profile?.is_shop;

  /* ---------- data */
  useEffect(() => {
    if (!uid || !profile) return;
    (async () => {
      const [{ data: extra }, { data: reqs }] = await Promise.all([
        supabase.from('cars').select('*').eq('owner_id', uid).order('created_at'),
        isShop ? Promise.resolve({ data: [] as Request[] }) : supabase.from('requests').select('*').eq('customer_id', uid).order('created_at', { ascending: false }).limit(6),
      ]);
      const list: CarOpt[] = [];
      if (profile.car_make) list.push({ key: 'main', label: `${profile.car_make} ${profile.car_model ?? ''} ${ar(profile.car_year ?? '')}`.trim(), make: profile.car_make, model: profile.car_model ?? '', year: profile.car_year ?? 0, vin: profile.car_vin ?? '' });
      ((extra ?? []) as Car[]).forEach((c) => list.push({ key: c.id, label: `${c.make} ${c.model} ${ar(c.year)}`, make: c.make, model: c.model, year: c.year, vin: c.vin }));
      setCars(list);
      setRecent((reqs ?? []) as Request[]);
    })();
    aiAvailable().then(setAiOn);
  }, [uid, profile?.id]);

  /* ---------- chat plumbing */
  const push = (m: Omit<Msg, 'id'>) => setMsgs((xs) => [...xs, { ...m, id: nextId.current++ }]);
  /** The bot "types" briefly, then says each message in turn. */
  function say(...ms: Omit<Msg, 'id' | 'from'>[]) {
    ms.forEach((m) => {
      queue.current += 1;
      setTyping(true);
      setTimeout(() => {
        push({ from: 'bot', ...m });
        queue.current -= 1;
        if (!queue.current) setTyping(false);
      }, 380 * queue.current + 120);
    });
    ms.forEach((m) => m.text && aiLog.current.push({ role: 'assistant', content: m.text }));
  }
  const me = (t: string, photo?: string) => { push({ from: 'me', text: t, photo }); aiLog.current.push({ role: 'user', content: t || tr('صورة') }); };

  /* ---------- start */
  useEffect(() => { start(); }, [profile?.id, cars]);
  function start() {
    if (!profile || !cars || started.current) return;
    started.current = true;
    const first = (profile.full_name || '').split(' ')[0];
    const mode = str(params.mode);
    if (mode === 'complaint') {
      say({ text: tr('أهلاً يا {0}. أنا مساعد ضغطة. احكيلنا المشكلة وهنوصّلها لخدمة العملاء.', first) });
      const rid = str(params.request);
      return advanceC({ ...emptyC(), category: rid ? 'order' : null, requestId: rid || null, requestAsked: !!rid });
    }
    if (mode === 'track') { say({ text: tr('أهلاً يا {0}.', first) }); return showTrack(); }
    if (mode === 'request' && !isShop) {
      say({ text: tr('أهلاً يا {0}. هسألك كام سؤال سريع وأبعت طلبك للمحلات المناسبة.', first) });
      const p = str(params.part);
      const cond = str(params.cond);
      return advance({
        ...emptyDraft(), part: p,
        cond: (['used', 'new', 'any'].includes(cond) ? cond : null) as Cond | null,
        side: (str(params.side) && Object.keys(SIDES).includes(str(params.side)) ? str(params.side) : null) as Side | null,
        notes: str(params.notes),
      });
    }
    supabase.from('reports').select('id, ticket_no').eq('reporter_id', uid!).in('status', ['open', 'in_progress']).order('updated_at', { ascending: false }).limit(1)
      .then(({ data }) => {
        const live = data?.[0];
        if (live) say({ text: tr('عندك محادثة مفتوحة مع خدمة العملاء (T-{0}).', live.ticket_no), links: [{ label: tr('كمّل المحادثة'), href: `/assistant?ticket=${live.id}` }] });
      });
    say({ text: isShop
      ? tr('أهلاً يا {0}. أنا مساعد ضغطة. لو عندك مشكلة أو شكوى اكتبها هنا وهنوصّلها لخدمة العملاء.', first)
      : tr('أهلاً يا {0}. أنا مساعد ضغطة، وأقدر أساعدك تطلب قطعة، أو تتابع طلب، أو تسجّل شكوى. اكتب طلبك، مثلاً «فانوس أمامي يمين مستعمل»، أو اختار من تحت.', first) });
    setStep('menu');
  }

  /* ---------- request flow */
  const carOf = (d: Draft) => cars?.find((c) => c.key === d.carKey) ?? cars?.[0];
  function merge(d: Draft, p: Parsed): Draft {
    return {
      ...d,
      part: p.part && !d.part ? p.part : d.part,
      side: p.side !== undefined && d.side === null ? p.side : d.side,
      cond: p.cond && !d.cond ? p.cond : d.cond,
      urgency: p.urgency && !d.urgency ? p.urgency : d.urgency,
      budget: p.budget && d.budget === null ? p.budget : d.budget,
      budgetAsked: d.budgetAsked || !!p.budget,
    };
  }
  function advance(d: Draft, b: Draft[] = basket) {
    if (cars && cars.length === 1 && !d.carKey) d = { ...d, carKey: cars[0].key };
    setDraft(d);
    if (!d.part) { setStep('part'); return say({ text: tr('اسم القطعة إيه؟ اكتبها بأي طريقة، أو اختار من تحت.') }); }
    if (!d.carKey && cars && cars.length > 1) { setStep('car'); return say({ text: tr('{0}، تمام. لأنهي عربية؟', d.part) }); }
    if (!cars?.length) { setStep('menu'); return say({ text: tr('محتاج تضيف عربيتك الأول عشان المحلات تعرف القطعة.'), links: [{ label: tr('ضيف عربيتي'), href: '/profile' }] }); }
    if (d.side === null && partIsSided(d.part)) { setStep('side'); return say({ text: tr('أنهي جهة؟') }); }
    if (!d.cond) { setStep('cond'); return say({ text: tr('عايزها مستعملة ولا جديدة؟') }); }
    if (!d.urgency) { setStep('urgency'); return say({ text: tr('محتاجها إمتى؟') }); }
    if (!d.photo && !d.photoAsked) { setStep('photo'); return say({ text: tr('عندك صورة للقطعة القديمة؟ الصورة بتخلي المحل يعرفها أسرع ويديك سعر مظبوط.') }); }
    if (d.budget === null && !d.budgetAsked) { setStep('budget'); return say({ text: tr('في ميزانية معينة في دماغك؟ اكتب الرقم بالجنيه، أو تخطّى.') }); }
    setStep('confirm');
    const car = carOf(d)!;
    const all = [...b, d];
    const itemLine = (x: Draft): string => [x.part, x.side ? SIDES[x.side] : '', WANTED[x.cond ?? d.cond ?? 'any']].filter(Boolean).join(tr('، '));
    say({
      text: all.length > 1 ? tr('تمام، ده طلبك ({0} قطع). أبعته للمحلات؟ كل محل هيسعّر اللي عنده.', ar(all.length)) : tr('تمام، ده طلبك. أبعته للمحلات؟'),
      photo: d.photo ?? undefined,
      lines: all.length > 1 ? [
        ...all.map((x, i) => [tr('قطعة {0}', ar(i + 1)), itemLine(x)] as [string, string]),
        [tr('العربية'), car.label],
      ] : [
        [tr('القطعة'), d.part],
        [tr('العربية'), car.label],
        ...(d.side ? [[tr('الجهة'), SIDES[d.side]] as [string, string]] : []),
        [tr('الحالة'), WANTED[d.cond]],
        [tr('الميزانية'), d.budget ? money(d.budget) + tr(' ج') : tr('مفتوحة')],
        ...(d.notes ? [[tr('ملاحظات'), d.notes] as [string, string]] : []),
      ],
    });
  }
  async function sendRequest() {
    if (busy || !profile) return;
    const d = draft;
    const car = carOf(d);
    if (!car) return;
    me(tr('ابعت الطلب'));
    setBusy(true);
    try {
      const all = [...basket, d];
      const batch = all.length > 1 ? newId() : null;
      const rows = [];
      for (const x of all) {
        const photo_path = x.photo ? await uploadPhoto(x.photo, profile.id) : null;
        rows.push({
          customer_id: profile.id, part: x.part, car_make: car.make, car_model: car.model, car_year: car.year, vin: car.vin,
          wanted_condition: x.cond ?? d.cond, side: x.side ?? '', urgency: d.urgency, budget: x.budget, area: profile.area, notes: x.notes, photo_path, batch_id: batch,
        });
      }
      const { data: made, error } = await supabase.from('requests').insert(rows).select('*');
      if (error) throw error;
      const sorted = [...(made as Request[])].sort((a, b) => a.num - b.num);
      const data = sorted[0];
      setRecent((r) => [...sorted, ...r]);
      setStep('done');
      setDraft(emptyDraft()); setBasket([]);
      say({ text: tr('اتبعت. طلبك رقم {0}{1} وصل للمحلات اللي بتشتغل في {2}.\nأول ما محل يبعت سعر هيوصلك إشعار، وتقدر تقارن العروض وتختار.', reqNo(data.num), all.length > 1 ? ` (${ar(all.length)} قطع)` : '', car.make), links: [{ label: tr('افتح الطلب'), href: `/customer/${data.id}` }] });
    } catch (x) {
      say({ text: tr('معرفتش أبعت الطلب: ') + friendlyError(x) + tr('\nجرّب تاني.') });
    } finally { setBusy(false); }
  }

  /* ---------- complaint flow */
  const complaintCats = Object.entries(REPORT_CATEGORIES).filter(([k]) => (isShop ? k !== 'shop' : k !== 'customer'));
  function advanceC(c: CDraft) {
    setC(c);
    if (!c.category) { setStep('c_cat'); return say({ text: tr('آسفين على اللي حصل. الشكوى عن إيه؟') }); }
    if ((c.category === 'order' || c.category === 'shop') && !c.requestId && !c.requestAsked && recent.length) {
      setStep('c_order'); return say({ text: tr('عن أنهي طلب؟') });
    }
    if (c.body.trim().length < 5) { setStep('c_body'); return say({ text: tr('احكيلي اللي حصل بالتفصيل، وأنا هوصّله لفريق خدمة العملاء.') }); }
    setStep('c_confirm');
    const r = recent.find((x) => x.id === c.requestId);
    say({
      text: tr('ده ملخص شكوتك. أبعتها؟'),
      lines: [
        [tr('النوع'), REPORT_CATEGORIES[c.category]],
        ...(r ? [[tr('الطلب'), tr('{0}، {1}', reqNo(r.num), r.part)] as [string, string]] : []),
        [tr('التفاصيل'), c.body.trim()],
      ],
    });
  }
  async function sendComplaint() {
    if (busy) return;
    me(tr('ابعت الشكوى'));
    setBusy(true);
    // The assistant opens a case and keeps handling it in this same chat; customer service joins if needed.
    const { data, error } = await supabase.from('reports')
      .insert({ category: cdraft.category, body: cdraft.body.trim(), request_id: cdraft.requestId, status: 'bot' })
      .select('id, ticket_no').single();
    if (error) { setBusy(false); return say({ text: tr('معرفتش أسجّل الشكوى: ') + friendlyError(error) }); }
    const history = [...msgs, { id: 0, from: 'me' as const, text: tr('ابعت الشكوى') }, { id: 0, from: 'bot' as const, text: tr('سجّلنا شكوتك برقم T-{0}. هيرد عليك موظف هنا في المحادثة.', data.ticket_no) }]
      .map((m) => ({ report_id: data.id, kind: m.from === 'bot' ? 'bot' : 'user', body: asText(m) }))
      .filter((m) => m.body);
    await supabase.from('ticket_messages').insert(history);
    setBusy(false);
    setC(emptyC());
    setTicket({ id: data.id, fresh: true });
    router.setParams({ ticket: data.id });
  }

  /* ---------- tracking */
  async function showTrack() {
    setStep('done');
    if (isShop) return say({ text: tr('متابعة الطلبات من شاشة الطلبات بتاعة المحل.'), links: [{ label: tr('الطلبات'), href: '/shop' }] });
    const { data } = await supabase.from('requests').select('*').eq('customer_id', uid!).in('status', ['open', 'chosen']).order('created_at', { ascending: false }).limit(5);
    const rs = (data ?? []) as Request[];
    if (!rs.length) return say({ text: tr('مفيش طلبات شغالة دلوقتي. تحب أدوّرلك على قطعة؟') });
    say({ text: rs.length === 1 ? tr('عندك طلب شغال:') : tr('عندك {0} طلبات شغالة:', ar(rs.length)), links: rs.map((r) => ({ label: tr('{0}، {1} — {2}', reqNo(r.num), r.part, STATUS[r.status]), href: `/customer/${r.id}` })) });
  }

  /* ---------- understanding typed text */
  function startFrom(t: string) {
    const p = parse(t);
    if (p.intent === 'complaint' || p.intent === 'human') {
      const long = t.trim().length >= 18;
      if (p.intent === 'human') say({ text: tr('أكيد، هوصّلك بخدمة العملاء. هسجّل طلبك والموظف يرد عليك في محادثة.') });
      return advanceC({ ...emptyC(), category: p.category && complaintCats.some(([k]) => k === p.category) ? p.category : null, body: long ? t.trim() : '' });
    }
    if (p.intent === 'track') return showTrack();
    if (p.intent === 'request') {
      if (isShop) return say({ text: tr('طلب القطع للعملاء بس. لو عندك مشكلة اكتبهالي.') });
      // «عايز فانوس يمين ومراية شمال» → two parts in one request
      const segs = splitParts(t).map(parse).filter((x) => x.part);
      const car = cars?.find((c) => t.includes(c.make));
      if (segs.length > 1) {
        const earlier = segs.slice(0, -1).map((x) => ({ ...emptyDraft(), part: x.part!, side: x.side ?? (partIsSided(x.part!) ? null : ''), cond: x.cond ?? p.cond ?? null, photoAsked: true, budgetAsked: true }));
        const last = segs[segs.length - 1];
        let d = merge({ ...emptyDraft(), part: last.part!, side: last.side ?? null, cond: last.cond ?? p.cond ?? null }, p);
        if (car) d = { ...d, carKey: car.key };
        setBasket(earlier);
        say({ text: tr('تمام، {0} قطع: {1}.', ar(segs.length), segs.map((x) => x.part).join('، ')) });
        return advance(d, earlier);
      }
      let d = merge(emptyDraft(), p);
      if (car) d = { ...d, carKey: car.key };
      return advance(d);
    }
    if (p.intent === 'thanks') return say({ text: tr('العفو. أقدر أساعدك في حاجة تانية؟') });
    if (p.intent === 'greet') return say({ text: tr('أهلاً بيك! محتاج قطعة، ولا عندك مشكلة؟') });
    setStep('menu');
    say({ text: tr('مفهمتش قصدك. جرّب تكتب مثلاً «رديتر مستعمل» أو «عندي شكوى من محل»، أو اختار من تحت.') });
  }

  async function onText(raw: string) {
    const t = raw.trim();
    if (!t || busy) return;
    setText('');
    me(t);
    if (aiOn && step !== 'c_body' && step !== 'part') {
      setTyping(true);
      const r = await askAi(aiLog.current, {
        customer_name: profile?.full_name, is_shop: isShop, step,
        cars: (cars ?? []).map((c, i) => ({ index: i, car: c.label })),
        recent_requests: recent.map((x) => ({ num: x.num, part: x.part, status: x.status })),
        current_request_draft: draft, current_complaint_draft: cdraft,
      });
      setTyping(false);
      if (r) return applyAi(r);
    }
    const p = parse(t);
    switch (step) {
      case 'part': return advance(merge({ ...draft, part: p.part ?? t }, p));
      case 'car': {
        const c = cars?.find((x) => t.includes(x.make) || t.includes(x.model));
        return c ? advance({ ...draft, carKey: c.key }) : say({ text: tr('اختار العربية من الأزرار تحت.') });
      }
      case 'side': return p.side !== undefined || p.skip ? advance({ ...draft, side: p.side ?? '' }) : say({ text: tr('أنهي جهة؟') });
      case 'cond': return p.cond ? advance(merge(draft, p)) : say({ text: tr('جديدة ولا مستعملة؟') });
      case 'urgency': return p.urgency ? advance(merge(draft, p)) : say({ text: tr('عادي، النهارده، ولا مستعجل جداً؟') });
      case 'photo': return advance({ ...draft, photoAsked: true, notes: p.skip || p.no ? draft.notes : [draft.notes, t].filter(Boolean).join(tr('، ')) });
      case 'budget':
        if (p.budget) return advance({ ...draft, budget: p.budget, budgetAsked: true });
        if (p.skip || p.no) return advance({ ...draft, budgetAsked: true });
        return say({ text: tr('اكتب الرقم بالجنيه، مثلاً ١٥٠٠، أو اضغط «مفيش ميزانية».') });
      case 'confirm':
        if (p.yes) return sendRequest();
        if (p.no) { setStep('edit'); return say({ text: tr('تحب تغيّر إيه؟') }); }
        if (p.part || p.side !== undefined || p.cond || p.urgency || p.budget) {
          return advance({ ...draft, ...(p.part ? { part: p.part } : {}), ...(p.side !== undefined ? { side: p.side } : {}), ...(p.cond ? { cond: p.cond } : {}), ...(p.urgency ? { urgency: p.urgency } : {}), ...(p.budget ? { budget: p.budget } : {}) });
        }
        say({ text: tr('ضفت ده كملاحظة للمحل.') });
        return advance({ ...draft, notes: [draft.notes, t].filter(Boolean).join(tr('، ')) });
      case 'c_cat': {
        const cat = p.category && complaintCats.some(([k]) => k === p.category) ? p.category : 'other';
        return advanceC({ ...cdraft, category: cat, body: t.length >= 18 ? t : cdraft.body });
      }
      case 'c_order': {
        const n = parseInt(t.replace(/\D/g, ''), 10);
        const r = recent.find((x) => x.num === n || t.includes(x.part));
        return advanceC({ ...cdraft, requestId: r?.id ?? null, requestAsked: true, body: !r && t.length >= 18 ? t : cdraft.body });
      }
      case 'c_body': return t.length < 5 ? say({ text: tr('اكتب تفاصيل أكتر شوية عشان نقدر نساعدك.') }) : advanceC({ ...cdraft, body: t });
      case 'c_confirm':
        if (p.yes) return sendComplaint();
        return advanceC({ ...cdraft, body: cdraft.body.trim() + '\n' + t });
      default: return startFrom(t);
    }
  }

  /** Smart mode: the AI fills the same drafts; the app still shows the summary and the customer confirms. */
  function applyAi(r: NonNullable<Awaited<ReturnType<typeof askAi>>>) {
    const g = r.draft;
    if (g?.intent === 'request' && !isShop) {
      const car = typeof g.car_index === 'number' ? cars?.[g.car_index] : undefined;
      const d: Draft = {
        ...draft,
        part: g.part || draft.part,
        carKey: car?.key ?? draft.carKey,
        side: g.side !== undefined && g.side in SIDES ? (g.side as Side) : draft.side,
        cond: g.condition && g.condition in WANTED ? (g.condition as Cond) : draft.cond,
        urgency: g.urgency && g.urgency in URGENCY ? (g.urgency as Urg) : draft.urgency,
        budget: typeof g.budget === 'number' ? g.budget : draft.budget,
        budgetAsked: draft.budgetAsked || 'budget' in g,
        notes: g.notes ?? draft.notes,
      };
      if (r.ready) { if (r.reply) say({ text: r.reply }); return advance(d); }
      setDraft(d);
    }
    if (g?.intent === 'complaint') {
      const rq = recent.find((x) => x.num === g.request_num);
      const c: CDraft = {
        ...cdraft,
        category: g.category && complaintCats.some(([k]) => k === g.category) ? g.category : cdraft.category,
        requestId: rq?.id ?? cdraft.requestId, requestAsked: cdraft.requestAsked || !!rq,
        body: g.complaint_text || cdraft.body,
      };
      if (r.ready) { if (r.reply) say({ text: r.reply }); return advanceC({ ...c, requestAsked: true }); }
      setC(c);
    }
    setAiChips(r.quick_replies ?? []);
    setStep('ai');
    say({ text: r.reply || '…' });
  }

  async function addPhoto() {
    try {
      const uri = await pickPhoto();
      if (!uri) return;
      me('', uri);
      advance({ ...draft, photo: uri, photoAsked: true });
    } catch { toast(tr('الصورة دي مش مدعومة. جرّب صورة تانية.')); }
  }

  /* ---------- the buttons under the chat */
  const tap = (label: string, fn: () => void) => ({ label, fn: () => { me(label); fn(); } });
  const menu = isShop
    ? [tap(tr('عندي شكوى'), () => advanceC(emptyC())), { label: tr('شكاويّا السابقة'), fn: () => router.push('/support') }]
    : [
        tap(tr('عايز قطعة غيار'), () => advance(emptyDraft())),
        tap(tr('عندي شكوى'), () => advanceC(emptyC())),
        tap(tr('فين طلبي؟'), showTrack),
        { label: tr('شكاويّا السابقة'), fn: () => router.push('/support') },
      ];
  let chips: { label: string; fn: () => void; icon?: string }[] = [];
  switch (step) {
    case 'menu': case 'done': chips = menu; break;
    case 'part': chips = COMMON_PARTS.map((p) => tap(p, () => advance({ ...draft, part: p }))); break;
    case 'car': chips = [...(cars ?? []).map((c) => tap(c.label, () => advance({ ...draft, carKey: c.key }))), { label: tr('+ عربية تانية'), fn: () => router.push('/cars') }]; break;
    case 'side': chips = (['right', 'left', 'front', 'rear', ''] as Side[]).map((v) => tap(SIDES[v], () => advance({ ...draft, side: v }))); break;
    case 'cond': chips = (['used', 'new', 'any'] as Cond[]).map((v) => tap(WANTED[v], () => advance({ ...draft, cond: v }))); break;
    case 'urgency': chips = (['normal', 'today', 'urgent'] as Urg[]).map((v) => tap(URGENCY[v], () => advance({ ...draft, urgency: v }))); break;
    case 'photo': chips = [{ label: tr('ضيف صورة'), icon: 'camera-outline', fn: addPhoto }, tap(tr('مش معايا صورة'), () => advance({ ...draft, photoAsked: true }))]; break;
    case 'budget': chips = [...[500, 1000, 2000, 5000].map((n) => tap(tr('لحد {0} ج', money(n)), () => advance({ ...draft, budget: n, budgetAsked: true }))), tap(tr('مفيش ميزانية'), () => advance({ ...draft, budgetAsked: true }))]; break;
    case 'confirm': chips = [
      { label: busy ? tr('بيتبعت…') : tr('ابعت الطلب'), fn: sendRequest },
      tap(tr('ضيف قطعة تانية'), () => {
        const nb = [...basket, draft];
        setBasket(nb);
        advance({ ...emptyDraft(), carKey: draft.carKey, urgency: draft.urgency }, nb);
      }),
      tap(tr('غيّر حاجة'), () => { setStep('edit'); say({ text: tr('تحب تغيّر إيه؟') }); }),
      tap(tr('إلغاء'), () => { setDraft(emptyDraft()); setBasket([]); setStep('menu'); say({ text: tr('لغيت الطلب. أي خدمة تانية؟') }); }),
    ]; break;
    case 'edit': chips = [
      tap(tr('القطعة'), () => advance({ ...draft, part: '' })),
      ...((cars?.length ?? 0) > 1 ? [tap(tr('العربية'), () => advance({ ...draft, carKey: null }))] : []),
      ...(partIsSided(draft.part) ? [tap(tr('الجهة'), () => advance({ ...draft, side: null }))] : []),
      tap(tr('مستعمل/جديد'), () => advance({ ...draft, cond: null })),
      tap(tr('الصورة'), () => advance({ ...draft, photo: null, photoAsked: false })),
      tap(tr('الميزانية'), () => advance({ ...draft, budget: null, budgetAsked: false })),
    ]; break;
    case 'c_cat': chips = complaintCats.map(([k, v]) => tap(v, () => advanceC({ ...cdraft, category: k }))); break;
    case 'c_order': chips = [...recent.map((r) => tap(tr('{0}، {1}', reqNo(r.num), r.part), () => advanceC({ ...cdraft, requestId: r.id, requestAsked: true }))), tap(tr('مش عن طلب معين'), () => advanceC({ ...cdraft, requestAsked: true }))]; break;
    case 'c_body': chips = []; break;
    case 'c_confirm': chips = [
      { label: busy ? tr('بتتبعت…') : tr('ابعت الشكوى'), fn: sendComplaint },
      tap(tr('عدّل الكلام'), () => advanceC({ ...cdraft, body: '' })),
      tap(tr('إلغاء'), () => { setC(emptyC()); setStep('menu'); say({ text: tr('تمام، لغيتها. أي خدمة تانية؟') }); }),
    ]; break;
    case 'ai': chips = [...aiChips.map((c) => ({ label: c, fn: () => onText(c) })), ...menu.slice(-1)]; break;
  }

  if (ready && !session) return <Redirect href="/login" />;
  if (ticket) return <CaseChat key={ticket.id} id={ticket.id} fresh={ticket.fresh} />;
  if (!profile || !cars) return <Screen><Loading /></Screen>;

  const placeholder = step === 'c_body' ? tr('اكتب اللي حصل…') : step === 'part' ? tr('اسم القطعة…') : step === 'budget' ? tr('المبلغ بالجنيه…') : tr('اكتب رسالتك…');
  const back = () => (router.canGoBack() ? router.back() : router.replace(isShop ? '/account' : '/customer'));
  const main = step === 'confirm' || step === 'c_confirm';

  return (
    <ChatFrame
      subtitle={aiOn ? tr('متصل، ذكاء اصطناعي') : tr('متصل دايماً')}
      onBack={back}
      right={!isShop ? (
        <Pressable onPress={() => router.push('/customer/new')} hitSlop={8} accessibilityRole="button">
          <Muted size={12.5}>{tr('الفورم العادي')}</Muted>
        </Pressable>
      ) : null}
      messages={msgs.map((m) => ({ id: m.id, who: m.from === 'me' ? 'me' : 'bot', text: m.text, photo: m.photo, lines: m.lines, links: m.links }))}
      typing={typing}
      busy={busy}
      chips={chips.map((c, i) => ({ ...c, main: main && i === 0 }))}
      composer={{ value: text, onChange: setText, onSend: () => onText(text), placeholder }}
    />
  );
}

/** One readable line per chat message, for the case history customer service sees. */
const asText = (m: Msg) => [m.photo ? tr('صورة') : '', m.text ?? '', ...(m.lines ?? []).map(([k, v]) => `${k}: ${v}`)].filter(Boolean).join('\n').slice(0, 2000);

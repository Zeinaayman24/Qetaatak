/**
 * Free, on-device understanding for the chat assistant.
 * It reads simple Egyptian Arabic ("عايز فانوس يمين جديد", "عندي شكوى من محل") and pulls out
 * what it can: intent, part, side, condition, urgency, budget, complaint type.
 */
import { supabase } from './supabase';
import { toLatin } from './data';

export const norm = (s: string) =>
  toLatin(s)
    .replace(/[ً-ْـ]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .toLowerCase()
    .trim();

const has = (t: string, words: string[]) => words.some((w) => t.includes(norm(w)));

/** Spoken names → the part name shops will see. `sided` parts get a "which side?" question. */
const PARTS: { words: string[]; name: string; rear?: string; sided?: boolean }[] = [
  { words: ['فانوس', 'فوانيس', 'كشاف', 'شمعه', 'اسطب', 'ستوب'], name: 'فانوس أمامي', rear: 'فانوس خلفي', sided: true },
  { words: ['مرايه', 'مرايا', 'مراية', 'مرايات'], name: 'مراية جانبية', sided: true },
  { words: ['رديتر', 'ردياتير', 'رادياتير'], name: 'رديتر مياه' },
  { words: ['كمبروسر', 'كومبروسر', 'تكييف'], name: 'كمبروسر تكييف' },
  { words: ['دبرياج', 'كلاتش', 'ديبرياج'], name: 'طقم دبرياج' },
  { words: ['تيل', 'فرامل', 'طنابير', 'ديسك'], name: 'تيل فرامل' },
  { words: ['دينامو'], name: 'دينامو' },
  { words: ['مارش'], name: 'مارش' },
  { words: ['رفرف'], name: 'رفرف', sided: true },
  { words: ['اكصدام', 'صدام', 'بمبر', 'اكسدام'], name: 'أكصدام أمامي', rear: 'أكصدام خلفي', sided: true },
  { words: ['باب', 'ابواب'], name: 'باب', sided: true },
  { words: ['كبوت', 'كابوت'], name: 'كبوت' },
  { words: ['شنطه'], name: 'باب شنطة' },
  { words: ['زجاج', 'ازاز', 'قزاز', 'برابريز'], name: 'زجاج أمامي', rear: 'زجاج خلفي' },
  { words: ['بطاريه', 'بطارية'], name: 'بطارية' },
  { words: ['طرمبه بنزين', 'طلمبه بنزين'], name: 'طرمبة بنزين' },
  { words: ['طرمبه مياه', 'طلمبه مياه'], name: 'طرمبة مياه' },
  { words: ['مساعدين', 'امسورتير', 'مساعد امامي', 'مساعد خلفي'], name: 'مساعدين', sided: true },
  { words: ['جنط', 'جنوط'], name: 'جنط' },
  { words: ['كاوتش', 'كاوتشات', 'اطار', 'فرد'], name: 'كاوتش' },
  { words: ['شكمان', 'شكمانات'], name: 'شكمان' },
  { words: ['مقص'], name: 'مقص', sided: true },
  { words: ['كويل', 'بوبينه'], name: 'كويل' },
  { words: ['بواجي', 'بوجيهات'], name: 'بواجي' },
  { words: ['فلتر'], name: 'فلتر' },
  { words: ['مروحه'], name: 'مروحة رديتر' },
  { words: ['كرونه', 'سيور', 'سير مكينه'], name: 'طقم سيور' },
  { words: ['ركبه', 'ركبة'], name: 'ركبة' },
  { words: ['عفشه'], name: 'عفشة' },
  { words: ['تابلوه', 'طبلون'], name: 'تابلوه' },
  { words: ['كنتاك', 'سويتش'], name: 'كونتاكت' },
];

export const SIDED_HINT = ['فانوس', 'مراية', 'رفرف', 'أكصدام', 'باب', 'مساعد', 'مقص'];
export const partIsSided = (part: string) => SIDED_HINT.some((w) => part.includes(w));

export type Parsed = {
  intent: 'request' | 'complaint' | 'track' | 'greet' | 'thanks' | 'human' | null;
  part?: string; sided?: boolean; side?: '' | 'right' | 'left' | 'front' | 'rear';
  cond?: 'used' | 'new' | 'any'; urgency?: 'normal' | 'today' | 'urgent'; budget?: number;
  category?: 'order' | 'shop' | 'app' | 'other'; yes?: boolean; no?: boolean; skip?: boolean;
};

export function parse(raw: string): Parsed {
  const t = norm(raw);
  const out: Parsed = { intent: null };

  // Part
  for (const p of PARTS) {
    if (p.words.some((w) => t.includes(norm(w)))) {
      const rear = p.rear && has(t, ['خلفي', 'ورا', 'ورايا', 'الخلفيه']);
      out.part = rear ? p.rear : p.name;
      out.sided = !!p.sided;
      break;
    }
  }
  // Side
  if (has(t, ['يمين', 'اليمين', 'يميني'])) out.side = 'right';
  else if (has(t, ['شمال', 'الشمال', 'يسار'])) out.side = 'left';
  else if (has(t, ['خلفي', 'ورا'])) out.side = 'rear';
  else if (has(t, ['قدام', 'امامي', 'الامامي'])) out.side = 'front';
  // Condition
  if (has(t, ['مستعمل', 'استعمال', 'تشليح', 'كسر زيرو', 'اوريجينال مستعمل'])) out.cond = 'used';
  else if (has(t, ['جديد', 'زيرو', 'متبرشم'])) out.cond = 'new';
  else if (has(t, ['اي حاجه', 'مش فارق', 'مش فارقه', 'اي نوع'])) out.cond = 'any';
  // Urgency
  if (has(t, ['مستعجل', 'ضروري', 'حالا', 'دلوقتي', 'عاجل', 'بسرعه'])) out.urgency = 'urgent';
  else if (has(t, ['النهارده', 'انهارده', 'النهاردة'])) out.urgency = 'today';
  else if (has(t, ['مش مستعجل', 'براحتي', 'عادي'])) out.urgency = 'normal';
  // Budget: "ميزانيتي 2000" / "في حدود ١٥٠٠ جنيه" / "2 الاف"
  const num = t.match(/(\d[\d,.]*)\s*(الف|الاف|k)?/);
  if (num && (has(t, ['جنيه', 'ميزاني', 'حدود', 'مش اكتر', 'الف', 'سعر']) || /^\s*\d[\d,.]*\s*$/.test(t))) {
    let n = parseFloat(num[1].replace(/,/g, ''));
    if (num[2]) n *= 1000;
    if (n >= 10) out.budget = Math.round(n);
  }
  // Complaint type
  if (has(t, ['محل', 'التاجر', 'البايع', 'المحل'])) out.category = 'shop';
  else if (has(t, ['التطبيق', 'الابلكيشن', 'البرنامج', 'app', 'مش بيفتح', 'بيهنج', 'الموقع'])) out.category = 'app';
  else if (has(t, ['طلب', 'اوردر', 'القطعه', 'توصيل', 'الدليفري', 'وصلت', 'موصلتش'])) out.category = 'order';

  out.yes = /^(اه|ايوه|ايوا|تمام|ماشي|اوك|ok|yes|نعم|اكيد|ابعت|يلا)\b/.test(t);
  out.no = /^(لا|لأ|لاء|no|مش عايز)\b/.test(t);
  out.skip = has(t, ['تخطي', 'مش مهم', 'بلاش', 'مفيش', 'لا شكرا', 'سيبها']);

  // Intent
  if (has(t, ['شكوي', 'شكوى', 'اشتكي', 'مشكله', 'مشكلة', 'زعلان', 'نصب', 'اتاخر', 'متاخر', 'مش مظبوط', 'بايظ', 'بايظه', 'غلط', 'استرجاع', 'ارجع', 'فلوسي', 'وحش']))
    out.intent = 'complaint';
  else if (has(t, ['خدمه العملاء', 'موظف', 'بني ادم', 'حد يكلمني', 'كلمني'])) out.intent = 'human';
  else if (has(t, ['فين طلبي', 'متابعه', 'تابع', 'حاله الطلب', 'طلباتي', 'وصل فين'])) out.intent = 'track';
  else if (out.part || has(t, ['عايز قطعه', 'محتاج قطعه', 'قطعه غيار', 'عايز', 'محتاج', 'بدور علي', 'دور لي'])) out.intent = 'request';
  else if (has(t, ['شكرا', 'تسلم', 'متشكر', 'ميرسي'])) out.intent = 'thanks';
  else if (has(t, ['اهلا', 'السلام', 'هاي', 'مرحبا', 'صباح', 'مساء', 'ازيك'])) out.intent = 'greet';
  return out;
}

/* ---------------------------------------------------------------- smart AI (optional) */
export type AiTurn = { role: 'user' | 'assistant'; content: string };
export type AiReply = {
  configured: boolean; error?: string; reply?: string; quick_replies?: string[]; ready?: boolean;
  draft?: {
    intent?: 'request' | 'complaint' | null; part?: string; car_index?: number; side?: string; condition?: string;
    urgency?: string; budget?: number | null; notes?: string; category?: string; request_num?: number | null; complaint_text?: string;
  } | null;
};

let aiState: boolean | null = null;
/** Asks the server once whether the smart AI is switched on (an API key is set). Free when it's off. */
export async function aiAvailable(): Promise<boolean> {
  if (aiState !== null) return aiState;
  try {
    const { data, error } = await supabase.functions.invoke('assistant', { body: { ping: true } });
    aiState = !error && !!data?.configured;
  } catch { aiState = false; }
  return aiState;
}

export async function askAi(messages: AiTurn[], context: unknown): Promise<AiReply | null> {
  try {
    const { data, error } = await supabase.functions.invoke('assistant', { body: { messages, context } });
    if (error || !data?.configured || data.error) return null;
    return data as AiReply;
  } catch { return null; }
}

export type SupportReply = { reply?: string; quick_replies?: string[]; action?: 'escalate' | 'resolved' | null };
/** Smart mode inside a complaint chat: try to solve it, or say it needs a person. */
export async function askSupport(messages: AiTurn[], context: unknown): Promise<SupportReply | null> {
  try {
    const { data, error } = await supabase.functions.invoke('assistant', { body: { mode: 'support', messages, context } });
    if (error || !data?.configured || data.error) return null;
    return data as SupportReply;
  } catch { return null; }
}

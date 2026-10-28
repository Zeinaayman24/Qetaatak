import { CATEGORY, ORDER_STATUS, REQUEST_STATUS, money, orderId, ticketId, type All, type Ticket, type TicketMessage } from './lib';

/**
 * The hand-over brief: everything an agent needs to pick up a case in seconds.
 * Built from the case, the chat with the assistant, the linked order, and the customer's history.
 */

export type Tag = { label: string; tone: 'bad' | 'wait' | 'plain' | 'good' };
export type Brief = {
  headline: string;
  tags: Tag[];
  customerSaid: string;
  why: string;
  waiting: string | null;
  botTried: string[];
  order: [string, string][] | null;
  history: [string, string][];
  shop: [string, string][] | null;
  suggest: string[];
};

const norm = (s: string) => s.replace(/[ً-ْـ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').toLowerCase();
const has = (t: string, words: string[]) => words.some((w) => t.includes(norm(w)));
const days = (a: string, b = new Date().toISOString()) => Math.floor((new Date(b).getTime() - new Date(a).getTime()) / 86400000);
const mins = (a: string) => Math.max(1, Math.round((Date.now() - new Date(a).getTime()) / 60000));
const dur = (m: number) => (m < 60 ? `${m} دقيقة` : m < 1440 ? `${Math.round(m / 60)} ساعة` : `${Math.round(m / 1440)} يوم`);
const BOT_NOISE = ['أهلاً', 'احكيلي', 'ده ملخص', 'سجّلت شكوتك', 'كده المشكلة', 'هحوّلك', 'الشكوى عن إيه', 'عن أنهي طلب', 'آسفين إن في مشكلة'];

export function buildBrief(t: Ticket, msgs: TicketMessage[], all: All): Brief {
  const p = all.byId[t.reporter_id];
  const isShop = !!p?.is_shop;
  const fromCustomer = msgs.filter((m) => m.kind === 'user' && m.sender_id === t.reporter_id && !m.internal);
  const words = norm([t.body, ...fromCustomer.map((m) => m.body)].join(' \n '));
  const req = t.request_id ? all.requests.find((r) => r.id === t.request_id) : undefined;
  const quote = req?.chosen_quote_id ? all.quotes.find((q) => q.id === req.chosen_quote_id) : undefined;
  const shopId = quote?.shop_id;

  /* ---- what kind of problem */
  const tags: Tag[] = [];
  const late = has(words, ['اتاخر', 'متاخر', 'تاخير', 'مجاش', 'موصلش', 'لسه موصلتش', 'فين المندوب', 'المندوب']);
  const faulty = has(words, ['بايظ', 'عيب', 'مش مظبوط', 'مكسور', 'خدش', 'مش شغال', 'مضروب', 'غلط', 'مش هي', 'مش مطابق']);
  const refund = has(words, ['فلوسي', 'ارجع الفلوس', 'استرجاع', 'ترجيع', 'رجوع', 'refund']);
  const angry = has(words, ['نصب', 'حرامي', 'مش محترم', 'قرف', 'زهقت', 'اسوا', 'مهزله', 'هشتكي', 'جهاز حمايه']) || /!{2,}/.test(words);
  const noReply = has(words, ['محدش بيرد', 'مش بيرد', 'مبيردش', 'قافل']);
  if (late) tags.push({ label: 'تأخير', tone: 'wait' });
  if (faulty) tags.push({ label: 'قطعة فيها مشكلة', tone: 'bad' });
  if (refund) tags.push({ label: 'عايز فلوسه', tone: 'bad' });
  if (noReply) tags.push({ label: 'المحل مش بيرد', tone: 'wait' });
  if (angry) tags.push({ label: 'العميل متضايق جداً', tone: 'bad' });
  if (t.priority === 'high') tags.push({ label: 'أولوية عاجلة', tone: 'bad' });

  /* ---- customer history */
  const theirTickets = all.tickets.filter((x) => x.reporter_id === t.reporter_id && x.id !== t.id);
  const theirReqs = isShop ? [] : all.requests.filter((r) => r.customer_id === t.reporter_id);
  const done = theirReqs.filter((r) => r.status === 'done');
  const cancelled = theirReqs.filter((r) => r.status === 'cancelled');
  const spent = theirReqs.filter((r) => r.chosen_quote_id).reduce((s, r) => s + (all.quotes.find((q) => q.id === r.chosen_quote_id)?.price ?? 0), 0);
  const rated = done.filter((r) => r.rating);
  const age = p ? days(p.created_at) : 0;
  if (p && age < 7) tags.push({ label: isShop ? 'محل جديد' : 'عميل جديد', tone: 'plain' });
  if (theirTickets.length >= 2) tags.push({ label: `اشتكى ${theirTickets.length} مرات قبل كده`, tone: 'wait' });
  if (!isShop && done.length >= 5) tags.push({ label: 'عميل دايم', tone: 'good' });
  if (p?.is_blocked) tags.push({ label: 'محظور', tone: 'bad' });

  const last = theirTickets[0];
  const history: [string, string][] = [
    ['معانا من', age < 1 ? 'النهارده' : `${age} يوم`],
    ...(!isShop ? [
      ['الطلبات', `${theirReqs.length} طلب · ${done.length} اتسلّم${cancelled.length ? ` · ${cancelled.length} اتلغى` : ''}`] as [string, string],
      ['اشترى بـ', money(spent)] as [string, string],
      ...(rated.length ? [['تقييماته للمحلات', (rated.reduce((a, r) => a + (r.rating ?? 0), 0) / rated.length).toFixed(1) + ' ★']] as [string, string][] : []),
    ] : []),
    ['شكاوى قبل كده', theirTickets.length ? `${theirTickets.length}` : 'أول مرة يشتكي'],
    ...(last ? [['آخر شكوى', `${ticketId(last.ticket_no)} · ${CATEGORY[last.category]} · ${last.status === 'resolved' ? 'اتحلّت' : 'لسه مفتوحة'}`]] as [string, string][] : []),
  ];

  /* ---- the order */
  let order: [string, string][] | null = null;
  let warrantyLeft: number | null = null;
  if (req) {
    const deliveredAt = req.done_at;
    if (quote && deliveredAt) warrantyLeft = quote.warranty_days - days(deliveredAt);
    order = [
      ['الطلب', `${orderId(req.num)} · ${req.part}`],
      ['العربية', `${req.car_make} ${req.car_model} ${req.car_year}`],
      ['الحالة', req.order_status && req.status === 'chosen' ? ORDER_STATUS[req.order_status] : REQUEST_STATUS[req.status]],
      ...(quote ? [
        ['السعر', money(quote.price)] as [string, string],
        ['الاستلام', req.delivery_mode === 'delivery' ? 'توصيل' : 'من المحل'] as [string, string],
        ['الضمان', `${quote.warranty_days} يوم` + (warrantyLeft === null ? '' : warrantyLeft >= 0 ? ` · فاضل ${warrantyLeft} يوم` : ` · خلص من ${-warrantyLeft} يوم`)] as [string, string],
      ] : []),
      ['اتطلب', `من ${dur(mins(req.created_at))}`],
    ];
    if (warrantyLeft !== null && warrantyLeft >= 0 && faulty) tags.push({ label: 'لسه في الضمان', tone: 'good' });
  }

  /* ---- the shop involved */
  let shop: [string, string][] | null = null;
  let shopComplaints = 0;
  if (shopId) {
    const sq = all.quotes.filter((q) => q.shop_id === shopId);
    const sales = all.requests.filter((r) => sq.some((q) => q.id === r.chosen_quote_id));
    const sRated = sales.filter((r) => r.rating);
    shopComplaints = all.tickets.filter((x) => x.id !== t.id && x.request_id && sales.some((r) => r.id === x.request_id)).length;
    shop = [
      ['المحل', all.priv[shopId]?.name ?? '—'],
      ['موبايل المحل', all.priv[shopId]?.phone ?? '—'],
      ['التقييم', sRated.length ? (sRated.reduce((a, r) => a + (r.rating ?? 0), 0) / sRated.length).toFixed(1) + ` ★ (${sRated.length})` : 'لسه مفيش'],
      ['شكاوى على المحل', shopComplaints ? `${shopComplaints} قبل كده` : 'مفيش'],
    ];
    if (shopComplaints >= 2) tags.push({ label: `المحل عليه ${shopComplaints} شكاوى`, tone: 'wait' });
  }

  /* ---- what the assistant already did, and why it handed over */
  const botTried = msgs.filter((m) => m.kind === 'bot' && !BOT_NOISE.some((n) => m.body.startsWith(n))).map((m) => m.body.split('\n')[0]);
  const askedHuman = fromCustomer.some((m) => has(norm(m.body), ['موظف', 'خدمه العملاء', 'حد يكلمني']) || /^(لا|لأ|لاء)(\s|،|,|\.|$)/.test(m.body.trim()));
  const why =
    t.status === 'bot' ? 'لسه مع المساعد الآلي.' :
    !msgs.some((m) => m.kind === 'bot') ? 'الشكوى اتبعتت لخدمة العملاء مباشرة.' :
    ['shop', 'customer', 'other'].includes(t.category) ? 'النوع ده لازم موظف يراجعه، فالمساعد حوّلها على طول.' :
    askedHuman && botTried.length ? 'المساعد رد بالمعلومات اللي عنده، والعميل قال إن المشكلة ما اتحلّتش وطلب موظف.' :
    'المساعد مقدرش يحلّها.';
  const waiting = t.status === 'open' ? `مستني من ${dur(mins(t.escalated_at ?? t.created_at))}` : null;

  /* ---- suggested next steps */
  const suggest: string[] = [];
  const shopName = shopId ? all.priv[shopId]?.name : null;
  if (late && req?.status === 'chosen') suggest.push(`كلّم ${shopName ?? 'المحل'} واعرف مكان الطلب بالظبط، وبلّغ العميل بوقت وصول واضح.`);
  if (noReply && shopId) suggest.push(`اتصل بالمحل على ${all.priv[shopId]?.phone ?? 'رقمه'} بنفسك بدل ما العميل يفضل مستني.`);
  if (faulty && warrantyLeft !== null) {
    suggest.push(warrantyLeft >= 0
      ? `القطعة لسه في الضمان (فاضل ${warrantyLeft} يوم): اطلب من المحل يبدّلها أو يرجّع الفلوس.`
      : `الضمان خلص من ${-warrantyLeft} يوم: اتفاوض مع المحل على حل ودّي، ومتوعدش العميل بحاجة قبل ما المحل يوافق.`);
  } else if (faulty) suggest.push('اطلب من العميل صورة للقطعة والعيب، واعرض الصور على المحل.');
  if (refund) suggest.push('أي استرجاع فلوس لازم يتأكد مع الإدارة قبل ما توعد العميل.');
  if (t.category === 'shop') suggest.push(`راجع تاريخ المحل${shopComplaints ? ` (عليه ${shopComplaints} شكاوى قبل كده)` : ''}، ولو المشكلة متكررة بلّغ الأدمن.`);
  if (t.category === 'app') suggest.push('اسأل عن نوع الموبايل واطلب سكرين شوت للمشكلة.');
  if (angry) suggest.push('العميل متضايق: ابدأ باعتذار واضح، وقوله هتعمل إيه وإمتى.');
  if (theirTickets.length >= 3) suggest.push('العميل اشتكى كتير قبل كده: راجع شكاويه القديمة قبل ما ترد.');
  if (!suggest.length) suggest.push('اسأل العميل عن التفاصيل الناقصة، وطمّنه إنك ماسك المشكلة لحد ما تتحل.');

  const who = isShop ? `المحل ${all.priv[t.reporter_id]?.name ?? ''}` : p?.full_name?.split(' ')[0] ?? 'العميل';
  const what = [late && 'تأخير', faulty && 'قطعة فيها مشكلة', refund && 'عايز فلوسه', noReply && 'المحل مش بيرد'].filter(Boolean).join(' + ') || CATEGORY[t.category];
  const headline = `${who}: ${what}${req ? ` في طلب ${orderId(req.num)} (${req.part})` : ''}${shopName ? ` من ${shopName}` : ''}.`;

  return { headline, tags, customerSaid: t.body, why, waiting, botTried, order, history, shop, suggest };
}

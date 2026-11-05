import { isEn, t } from '@/lib/i18n';
export const MAKES = ['هيونداي', 'كيا', 'نيسان', 'تويوتا', 'ميتسوبيشي', 'شيفروليه', 'دايو', 'شيري', 'بي واي دي', 'إم جي', 'فيات', 'بيجو', 'رينو', 'سكودا', 'أوبل', 'سوزوكي', 'جيلي', 'أخرى'];

export const AREAS = ['مدينة نصر', 'مصر الجديدة', 'التجمع الخامس', 'المعادي', 'حلوان', 'شبرا', 'شبرا الخيمة', 'وسط البلد', 'حدائق القبة', 'عين شمس', 'المطرية', 'الدقي', 'المهندسين', 'فيصل', 'الهرم', '٦ أكتوبر', 'الشيخ زايد', 'السبتية', 'التوفيقية', 'أخرى'];

export const GOVERNORATES = ['القاهرة', 'الجيزة', 'الإسكندرية', 'القليوبية', 'الدقهلية', 'الشرقية', 'الغربية', 'المنوفية', 'البحيرة', 'كفر الشيخ', 'دمياط', 'بورسعيد', 'الإسماعيلية', 'السويس', 'الفيوم', 'بني سويف', 'المنيا', 'أسيوط', 'سوهاج', 'قنا', 'الأقصر', 'أسوان', 'البحر الأحمر', 'الوادي الجديد', 'مطروح', 'شمال سيناء', 'جنوب سيناء'];

export const COUNTRIES = ['مصر'];

export const SHOP_TYPES: Record<string, string> = { used: t('قطع مستعملة'), new: t('قطع جديدة'), both: t('مستعمل وجديد') };

export const SPECIALTIES = ['ميكانيكا', 'كهرباء', 'صاج وبودي', 'فوانيس ومرايات', 'تكييف وتبريد', 'عفشة ودبرياج', 'فرامل', 'فرش وإكسسوارات', 'إطارات وجنوط', 'زيوت وفلاتر', 'زجاج'];

export const COMMON_PARTS = ['فانوس أمامي', 'مراية جانبية', 'رديتر مياه', 'كمبروسر تكييف', 'طقم دبرياج', 'تيل فرامل', 'دينامو', 'مارش', 'رفرف', 'أكصدام'];

export const YEARS = Array.from({ length: 36 }, (_, i) => new Date().getFullYear() - i);

export const WANTED: Record<string, string> = { any: t('جديد أو مستعمل'), used: t('مستعمل بس'), new: t('جديد بس') };

/** Labels for every condition an offer can carry (used_clean is from older offers and reads as used). */
export const CONDITIONS: Record<string, string> = {
  used_original: t('مستعملة'),
  used_clean: t('مستعملة'),
  new_original: t('جديدة أصلي'),
  new_aftermarket: t('جديدة ماركة تانية'),
  imported: t('استيراد'),
};
/** The choices a shop picks from when sending an offer, in the order shops say them. */
export const OFFER_CONDITIONS = ['used_original', 'new_original', 'new_aftermarket', 'imported'] as const;

/** Warranty is optional: most shops sell parts without one. 0 = no warranty; otherwise the shop types the days. */
export const MAX_WARRANTY_DAYS = 730;
export const warrantyLabel = (d: number) => (d > 0 ? t('ضمان {0} يوم', ar(d)) : t('بدون ضمان'));
/** What every order gets, warranty or not: the part must match what was described. */
export const MATCH_HOURS = 48;
export const DELIVERY_FEE = 60;

const AD = '٠١٢٣٤٥٦٧٨٩';
/** Digits as the reader expects them: Arabic-Indic in Arabic, 0-9 in English. */
export const ar = (v: string | number) => (isEn() ? String(v) : String(v).replace(/\d/g, (d) => AD[Number(d)]));
export const money = (n: number) => (isEn() ? Math.round(n || 0).toLocaleString('en-US') : ar(Math.round(n || 0).toLocaleString('en-US')).replace(/,/g, '٬'));
export const reqNo = (n: number) => '#' + ar(n);

/** "٣ يوم" / "3 days": how long since `iso`, without the "since" word. */
export const sinceShort = (iso: string) => {
  const m = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (m < 60) return t('{0} دقيقة', ar(m));
  const h = Math.round(m / 60);
  if (h < 24) return t('{0} ساعة', ar(h));
  return t('{0} يوم', ar(Math.round(h / 24)));
};
export const ago = (iso: string) => {
  const m = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (m < 60) return t('من {0} دقيقة', ar(m));
  const h = Math.round(m / 60);
  if (h < 24) return t('من {0} ساعة', ar(h));
  return t('من {0} يوم', ar(Math.round(h / 24)));
};

/** A live stopwatch since `iso`: "٤٥ ث"، "١٢ د"، "١ س ٥ د"، "٢ يوم". */
export const elapsed = (iso: string, now = Date.now()) => {
  const sec = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 1000));
  if (sec < 60) return ar(sec) + t(' ث');
  const m = Math.floor(sec / 60);
  if (m < 60) return ar(m) + t(' د');
  const h = Math.floor(m / 60);
  if (h < 24) return ar(h) + t(' س') + (m % 60 ? ' ' + ar(m % 60) + t(' د') : '');
  return ar(Math.floor(h / 24)) + t(' يوم');
};
export const minutesSince = (iso: string, now = Date.now()) => (now - new Date(iso).getTime()) / 60000;

/** How fast a shop usually answers, for the customer. */
export const replyLabel = (min: number | null | undefined) =>
  min == null ? t('محل جديد') : min <= 1 ? t('بيرد في دقيقة') : min < 60 ? t('بيرد في {0} د', ar(min)) : t('بيرد في {0} س', ar(Math.round(min / 60)));

/** What the customer sees about a shop that sent an offer. */
export type ShopCard = { id: string; name: string; area: string; rating: number | null; ratings: number; sales: number; reply_min: number | null; photo_path?: string | null;
  /** the shop subscribes to be visible: name and contact show, no pickup deposit (change 1.35) */
  visible?: boolean };
/** The shops columns anyone signed in may read. Location, storefront photo and internal notes come only through
 *  my_shop() (the shop itself), staff_shops() (the team) or shop_cards()/shop_profile() (hidden until allowed). */
export const SHOP_COLS = 'id, area, brands, status, created_at, governorate, shop_type, specialties, offers_delivery, fee_area, fee_city, fee_far, featured_until, hours, accepting, approved_at, submitted_at, public_until';

export const validPhone = (p: string) => /^01\d{9}$/.test(p.replace(/\s/g, ''));
export const validPostal = (p: string) => p.trim() === '' || /^\d{5}$/.test(toLatin(p.trim()));
/** Converts Arabic-Indic digits typed on Arabic keyboards to 0-9. */
export const toLatin = (s: string) => s.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));

export type Profile = {
  id: string; full_name: string; phone: string; area: string;
  car_make: string | null; car_model: string | null; car_year: number | null; car_vin: string; car_powertrain?: string;
  is_customer: boolean; is_shop: boolean; is_admin: boolean;
  email: string; country: string; governorate: string; street: string; building: string;
  floor: string; apartment: string; landmark: string; postal_code: string;
  marketing_consent?: boolean; deleted_at?: string | null;
};
export type Shop = {
  id: string; area: string; brands: string[]; status: 'draft' | 'pending' | 'changes' | 'approved' | 'suspended' | 'closed'; created_at: string;
  governorate: string; shop_type: 'used' | 'new' | 'both'; specialties: string[]; offers_delivery: boolean;
  /** delivery fees by distance: same area, same governorate, other governorates (null = doesn't deliver there) */
  fee_area: number | null; fee_city: number | null; fee_far: number | null;
  /** paid visibility: listed first with a badge until this date */
  featured_until?: string | null;
  /** visible to customers (paid subscription) until this date; otherwise hidden until the deposit (change 1.35) */
  public_until?: string | null;
  accepting?: boolean; suspend_reason?: string; reopen_step?: string; suspended_at?: string | null; lat?: number | null; lng?: number | null; hours?: ShopHours; photo_path?: string | null; review_note?: string;
  agreement_version?: string | null; agreement_at?: string | null; approved_at?: string | null;
  /** what the shop does: sells parts, installs parts, or both (at least one) */
  sells?: boolean; installs?: boolean; about?: string; photos?: string[];
};
export type ShopPrivate = {
  id: string; name: string; owner_name: string; phone: string; phone2: string;
  street: string; building: string; landmark: string; postal_code: string; commercial_register: string;
  instapay_address: string; wallet_number: string;
  payout_name?: string; doc_id_front?: string | null; doc_id_back?: string | null; doc_register?: string | null; doc_tax?: string | null;
};
/** Opening hours (Cairo time); days off are 0 = Sunday … 6 = Saturday. */
export type ShopHours = { open: string; close: string; off: number[] };
export const WEEKDAYS = ['الحد', 'الاتنين', 'التلات', 'الأربع', 'الخميس', 'الجمعة', 'السبت'];

/** One readable line for an address. */
export const addressLine = (a: { street?: string; building?: string; floor?: string; apartment?: string; area?: string; governorate?: string }) =>
  [a.street, a.building && t('عمارة ') + a.building, a.floor && t('دور ') + a.floor, a.apartment && t('شقة ') + a.apartment, a.area, a.governorate].filter(Boolean).join(t('، '));
export type Request = {
  id: string; num: number; customer_id: string; part: string; car_make: string; car_model: string; car_year: number; powertrain?: string; part_number?: string;
  wanted_condition: 'used' | 'new' | 'any'; area: string; notes: string; photo_path: string | null;
  status: 'open' | 'chosen' | 'done' | 'cancelled' | 'expired'; chosen_quote_id: string | null; delivery_mode: 'delivery' | 'pickup' | null;
  rating: number | null; created_at: string;
  vin: string; side: '' | 'right' | 'left' | 'both' | 'front' | 'rear'; urgency: 'normal' | 'today' | 'urgent'; budget: number | null;
  order_status: 'preparing' | 'ready' | 'out_for_delivery' | 'delivered' | null; review: string; done_at?: string | null;
  batch_id: string | null; qty: number; order_id: string | null;
};
export type Car = { id: string; make: string; model: string; year: number; vin: string; powertrain?: string };
export type Message = { id: string; request_id: string; shop_id: string; sender_id: string; body: string; photo_path: string | null; flagged?: boolean; created_at: string };
export type Notification = { id: string; title: string; body: string; link: string; read_at: string | null; created_at: string };
export type Report = { id: string; ticket_no: number; reporter_id: string; request_id: string | null; category: string; body: string; status: 'bot' | 'open' | 'in_progress' | 'resolved'; admin_reply: string; created_at: string; updated_at: string };
export type TicketMessage = { id: string; report_id: string; sender_id: string; body: string; kind: 'user' | 'bot' | 'system'; internal?: boolean; created_at: string };
export const TICKET_STATUS: Record<string, string> = { bot: t('المساعد بيحاول يحلّها'), open: t('مستني موظف'), in_progress: t('موظف معاك'), resolved: t('اتقفلت') };

export const SIDES: Record<string, string> = { '': t('مش مهم'), right: t('يمين'), left: t('شمال'), both: t('الاتنين'), front: t('أمامي'), rear: t('خلفي') };
export const URGENCY: Record<string, string> = { normal: t('عادي'), today: t('النهارده'), urgent: t('مستعجل جداً') };
export const ORDER_STEPS: { key: string; label: string; pickupLabel?: string }[] = [
  { key: 'preparing', label: t('المحل بيجهّز') },
  { key: 'ready', label: t('جاهزة'), pickupLabel: t('جاهزة للاستلام') },
  { key: 'out_for_delivery', label: t('خرجت للتوصيل') },
  { key: 'delivered', label: t('اتسلّمت') },
];
export const REPORT_CATEGORIES: Record<string, string> = { order: t('مشكلة في طلب'), shop: t('شكوى من محل'), customer: t('شكوى من عميل'), app: t('مشكلة في التطبيق'), other: t('حاجة تانية') };
export type Quote = {
  id: string; request_id: string; shop_id: string; price: number; condition: string; warranty_days: number;
  photo_path: string | null; created_at: string; brand: string; note: string;
  /** can THIS part be delivered, and an optional fee for it (heavy parts) instead of the shop's distance fees */
  can_deliver: boolean; delivery_fee: number | null;
  expires_at: string;
  /** the shop can also install it: a fixed fee, or (fee null + needs inspection) priced at the shop */
  install_available?: boolean; install_fee?: number | null; install_needs_inspection?: boolean;
};
/** A shop can send up to this many offers for one part (different brands / prices). */
/** No limit on offers per part (change 1.36). */
export const MAX_OFFERS = Infinity;

export function friendlyError(e: any): string {
  const msg = String(e?.message || e || '');
  if (/Invalid login credentials/i.test(msg)) return t('الإيميل أو كلمة السر غلط.');
  if (/already registered|already exists/i.test(msg)) return t('الإيميل ده متسجل قبل كده. جرّب تسجّل دخول.');
  if (/Password should be/i.test(msg)) return t('كلمة السر لازم تكون ٦ حروف أو أكتر.');
  if (/Email not confirmed/i.test(msg)) return t('لازم تأكد إيميلك الأول من الرسالة اللي وصلتك.');
  if (/rate limit/i.test(msg)) return t('محاولات كتير. استنى شوية وجرّب تاني.');
  if (/profiles_one_role/i.test(msg)) return t('الحساب ده متسجل بدور تاني. كل حساب يا عميل يا محل.');
  if (/does not deliver/i.test(msg)) return t('المحل ده مش بيوصّل. اختار الاستلام من المحل.');
  if (/request is closed/i.test(msg)) return t('الطلب ده اتقفل.');
  if (/daily limit/i.test(msg)) return t('وصلت لأقصى عدد طلبات النهارده (٢٠). جرّب بكرة.');
  if (/offer expired|cannot choose/i.test(msg)) return t('العرض ده انتهى أو المحل سحبه. اختار عرض تاني.');
  if (/address needed/i.test(msg)) return t('اكتب عنوان التوصيل كامل.');
  if (/max addresses/i.test(msg)) return t('تقدر تحفظ ٥ عناوين بس. امسح عنوان قديم الأول.');
  if (/shop has open items/i.test(msg)) return t('لازم تكمّل الأوردرات الشغالة، وترجّع أي فلوس لعملاء، وتسدّد العمولة الأول.');
  if (/not ready yet/i.test(msg)) return t('الأوردر لسه بيتجهّز.');
  if (/reason needed/i.test(msg)) return t('اختار سبب الرفض.');
  if (/postal_code/i.test(msg)) return t('الرقم البريدي لازم يكون ٥ أرقام.');
  if (/too many offers/i.test(msg)) return t('وصلت لأقصى عدد عروض (٥) على القطعة دي.');
  if (/balance due/i.test(msg)) return t('عليك عمولة وصلت للحد. سدّد من «حسابك مع ضغطة» عشان تبعت عروض جديدة.');
  if (/payment pending/i.test(msg)) return t('لسه الدفع ماتأكدش.');
  if (/deposit pending/i.test(msg)) return t('لسه العربون ماتدفعش.');
  if (/payment already settled/i.test(msg)) return t('الدفع ده اتسجّل خلاص.');
  if (/no transfer details/i.test(msg)) return t('المحل ده مش مفعّل الدفع بالتحويل.');
  if (/warranty_days/i.test(msg)) return t('مدة الضمان لازم تكون من ١ لـ ٧٣٠ يوم.');
  if (/network|fetch/i.test(msg)) return t('مفيش اتصال بالإنترنت. جرّب تاني.');
  return t('حصلت مشكلة. جرّب تاني.');
}

/** Parts sent together share a batch; the apps show a batch as one request. */
export type Group = { key: string; first: Request; items: Request[] };
export function groupRequests(rs: Request[]): Group[] {
  const map = new Map<string, Request[]>();
  for (const r of rs) {
    const k = r.batch_id ?? r.id;
    map.set(k, [...(map.get(k) ?? []), r]);
  }
  return [...map.entries()].map(([key, items]) => {
    const sorted = [...items].sort((a, b) => a.num - b.num);
    return { key, first: sorted[0], items: sorted };
  });
}
export const partsLabel = (items: { part: string }[]) =>
  items.length === 1 ? t(items[0].part) : items.length === 2 ? t(items[0].part) + t(' و') + t(items[1].part) : t('{0} و{1} قطع تانية', t(items[0].part), ar(items.length - 1));

/** A random id for a batch of parts (no crypto needed). */
export const newId = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
  const r = (Math.random() * 16) | 0;
  return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
});

/** One step of progress for a group of parts, 0..4, and its label for the customer. */
export function groupProgress(items: Request[], quoteCount: number): { step: number; label: string } {
  if (items.every((r) => r.status === 'done')) return { step: 4, label: t('اتسلّم') };
  if (items.every((r) => r.status === 'cancelled')) return { step: 0, label: t('اتلغى') };
  if (items.some((r) => r.status === 'chosen' && r.order_status === 'out_for_delivery')) return { step: 3, label: t('في الطريق ليك') };
  if (items.some((r) => r.status === 'chosen')) return { step: 3, label: t('المحل بيجهّز') };
  if (quoteCount) return { step: 2, label: t('{0} عروض مستنياك', ar(quoteCount)) };
  return { step: 1, label: t('بندوّر عند المحلات') };
}

/* ---------------------------------------------------------------- orders */
export type Order = {
  id: string; order_no: number; customer_id: string; shop_id: string; delivery_mode: 'delivery' | 'pickup';
  status: 'preparing' | 'ready' | 'out_for_delivery' | 'delivered' | 'received' | 'cancelled';
  items_total: number; delivery_fee: number; rating: number | null; review: string;
  created_at: string; updated_at: string; received_at: string | null;
  delivery_address?: DeliveryAddress | null; refused_at?: string | null; refund_due_at?: string | null; refusal_reason?: string; cancel_reason?: string;
  payment_method: PayMethod; payment_status: PayStatus; payment_ref: string; payment_proof: string | null; payment_note: string; paid_at: string | null;
  // pickup deposit (change 1.33): 'none' on delivery orders and on orders from before deposits
  deposit?: number; deposit_status?: DepositStatus; deposit_method?: '' | 'card' | 'instapay'; deposit_ref?: string; deposit_note?: string;
  deposit_proof?: string | null; deposit_paid_at?: string | null; hold_until?: string | null; refusal_answer_due?: string | null;
  shop_comp?: number; shop_comp_paid_at?: string | null;
  /** installation at the shop: fee paid at the shop, appointment, progress */
  install_fee?: number; install_at?: string | null; install_status?: '' | 'requested' | 'confirmed' | 'in_progress' | 'done';
};
export type DepositStatus = 'none' | 'awaiting' | 'review' | 'failed' | 'paid' | 'used' | 'forfeited' | 'refund_check' | 'disputed' | 'refund_due' | 'refunded' | 'void';
export type DeliveryAddress = { governorate: string; area: string; street: string; building: string; floor: string; apartment: string; landmark: string; contact_phone: string };
export type SavedAddress = DeliveryAddress & { id: string; label: string; used_at: string };
export type PayMethod = 'cash' | 'shop' | 'instapay' | 'card';
export type PayStatus = 'unpaid' | 'awaiting' | 'review' | 'paid' | 'failed' | 'refund_due' | 'refunded';
export const orderNo = (n: number) => '#' + ar(n);
/** What the customer reads for each order status. */
export const ORDER_LABEL: Record<Order['status'], { title: string; short: string; icon: string }> = {
  preparing: { title: t('المحل بيجهّز أوردرك'), short: t('بيتجهّز'), icon: 'construct' },
  ready: { title: t('أوردرك جاهز'), short: t('جاهز'), icon: 'bag-check' },
  // older orders may still carry these two; they read as "ready"
  out_for_delivery: { title: t('أوردرك جاهز'), short: t('جاهز'), icon: 'bag-check' },
  delivered: { title: t('أوردرك جاهز'), short: t('جاهز'), icon: 'bag-check' },
  received: { title: t('استلمت الأوردر'), short: t('اتسلّم'), icon: 'checkmark-circle' },
  cancelled: { title: t('الأوردر اتلغى'), short: t('اتلغى'), icon: 'close-circle' },
};
/** The order's headline, worded for delivery or pickup. */
export const orderTitle = (o: Pick<Order, 'status' | 'delivery_mode'>) =>
  ['ready', 'out_for_delivery', 'delivered'].includes(o.status)
    ? (o.delivery_mode === 'delivery' ? t('أوردرك جاهز وخارج لك') : t('أوردرك جاهز للاستلام من المحل'))
    : ORDER_LABEL[o.status].title;
/** Every order goes through the same three steps: the shop prepares it, it is ready, the customer receives it. */
export const orderSteps = (_mode?: Order['delivery_mode']): Order['status'][] => ['preparing', 'ready', 'received'];
/** Where an order sits on those steps (older statuses count as ready). */
export const orderStep = (o: Pick<Order, 'status'>) =>
  o.status === 'cancelled' ? -1 : o.status === 'received' ? 2 : o.status === 'preparing' ? 0 : 1;
export const ORDER_STEP_NAME: Record<string, string> = {
  preparing: t('بيتجهّز'), ready: t('جاهز'), out_for_delivery: t('جاهز'), delivered: t('جاهز'), received: t('استلمت'),
};
export const orderActive = (o: Pick<Order, 'status'>) => o.status !== 'received' && o.status !== 'cancelled';

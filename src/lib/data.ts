export const MAKES = ['هيونداي', 'كيا', 'نيسان', 'تويوتا', 'ميتسوبيشي', 'شيفروليه', 'دايو', 'شيري', 'بي واي دي', 'إم جي', 'فيات', 'بيجو', 'رينو', 'سكودا', 'أوبل', 'سوزوكي', 'جيلي', 'أخرى'];

export const AREAS = ['مدينة نصر', 'مصر الجديدة', 'التجمع الخامس', 'المعادي', 'حلوان', 'شبرا', 'شبرا الخيمة', 'وسط البلد', 'حدائق القبة', 'عين شمس', 'المطرية', 'الدقي', 'المهندسين', 'فيصل', 'الهرم', '٦ أكتوبر', 'الشيخ زايد', 'السبتية', 'التوفيقية', 'أخرى'];

export const GOVERNORATES = ['القاهرة', 'الجيزة', 'الإسكندرية', 'القليوبية', 'الدقهلية', 'الشرقية', 'الغربية', 'المنوفية', 'البحيرة', 'كفر الشيخ', 'دمياط', 'بورسعيد', 'الإسماعيلية', 'السويس', 'الفيوم', 'بني سويف', 'المنيا', 'أسيوط', 'سوهاج', 'قنا', 'الأقصر', 'أسوان', 'البحر الأحمر', 'الوادي الجديد', 'مطروح', 'شمال سيناء', 'جنوب سيناء'];

export const COUNTRIES = ['مصر'];

export const SHOP_TYPES: Record<string, string> = { used: 'مستعمل / تشليح', new: 'جديد', both: 'مستعمل وجديد' };

export const SPECIALTIES = ['ميكانيكا', 'كهرباء', 'صاج وبودي', 'فوانيس ومرايات', 'تكييف وتبريد', 'عفشة ودبرياج', 'فرامل', 'فرش وإكسسوارات', 'إطارات وجنوط', 'زيوت وفلاتر', 'زجاج'];

export const COMMON_PARTS = ['فانوس أمامي', 'مراية جانبية', 'رديتر مياه', 'كمبروسر تكييف', 'طقم دبرياج', 'تيل فرامل', 'دينامو', 'مارش', 'رفرف', 'أكصدام'];

export const YEARS = Array.from({ length: 36 }, (_, i) => new Date().getFullYear() - i);

export const WANTED: Record<string, string> = { used: 'مستعمل', new: 'جديد', any: 'أي حاجة' };

export const CONDITIONS: Record<string, string> = {
  used_original: 'مستعمل أصلي',
  used_clean: 'مستعمل نضيف جداً',
  new_aftermarket: 'تجاري جديد',
  new_original: 'أصلي جديد',
};

export const WARRANTY_DAYS = [3, 7, 14, 30];
export const DELIVERY_FEE = 60;
export const COMMISSION = 0.05;

const AD = '٠١٢٣٤٥٦٧٨٩';
export const ar = (v: string | number) => String(v).replace(/\d/g, (d) => AD[Number(d)]);
export const money = (n: number) => ar(Math.round(n || 0).toLocaleString('en-US')).replace(/,/g, '٬');
export const reqNo = (n: number) => '#' + ar(n);

export const ago = (iso: string) => {
  const m = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (m < 60) return 'من ' + ar(m) + ' دقيقة';
  const h = Math.round(m / 60);
  if (h < 24) return 'من ' + ar(h) + ' ساعة';
  return 'من ' + ar(Math.round(h / 24)) + ' يوم';
};

export const validPhone = (p: string) => /^01\d{9}$/.test(p.replace(/\s/g, ''));
export const validPostal = (p: string) => p.trim() === '' || /^\d{5}$/.test(toLatin(p.trim()));
/** Converts Arabic-Indic digits typed on Arabic keyboards to 0-9. */
export const toLatin = (s: string) => s.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));

export type Profile = {
  id: string; full_name: string; phone: string; area: string;
  car_make: string | null; car_model: string | null; car_year: number | null; car_vin: string;
  is_customer: boolean; is_shop: boolean; is_admin: boolean;
  email: string; country: string; governorate: string; street: string; building: string;
  floor: string; apartment: string; landmark: string; postal_code: string;
};
export type Shop = {
  id: string; area: string; brands: string[]; status: 'pending' | 'approved' | 'suspended'; created_at: string;
  governorate: string; shop_type: 'used' | 'new' | 'both'; specialties: string[]; offers_delivery: boolean;
};
export type ShopPrivate = {
  id: string; name: string; owner_name: string; phone: string; phone2: string;
  street: string; building: string; landmark: string; postal_code: string; commercial_register: string;
};

/** One readable line for an address. */
export const addressLine = (a: { street?: string; building?: string; floor?: string; apartment?: string; area?: string; governorate?: string }) =>
  [a.street, a.building && 'عمارة ' + a.building, a.floor && 'دور ' + a.floor, a.apartment && 'شقة ' + a.apartment, a.area, a.governorate].filter(Boolean).join('، ');
export type Request = {
  id: string; num: number; customer_id: string; part: string; car_make: string; car_model: string; car_year: number;
  wanted_condition: 'used' | 'new' | 'any'; area: string; notes: string; photo_path: string | null;
  status: 'open' | 'chosen' | 'done' | 'cancelled'; chosen_quote_id: string | null; delivery_mode: 'delivery' | 'pickup' | null;
  rating: number | null; created_at: string;
  vin: string; side: '' | 'right' | 'left' | 'front' | 'rear'; urgency: 'normal' | 'today' | 'urgent'; budget: number | null;
  order_status: 'preparing' | 'ready' | 'out_for_delivery' | 'delivered' | null; review: string; done_at?: string | null;
  batch_id: string | null; qty: number; order_id: string | null;
};
export type Car = { id: string; make: string; model: string; year: number; vin: string };
export type Message = { id: string; request_id: string; shop_id: string; sender_id: string; body: string; photo_path: string | null; flagged?: boolean; created_at: string };
export type Notification = { id: string; title: string; body: string; link: string; read_at: string | null; created_at: string };
export type Report = { id: string; ticket_no: number; reporter_id: string; request_id: string | null; category: string; body: string; status: 'bot' | 'open' | 'in_progress' | 'resolved'; admin_reply: string; created_at: string; updated_at: string };
export type TicketMessage = { id: string; report_id: string; sender_id: string; body: string; kind: 'user' | 'bot' | 'system'; internal?: boolean; created_at: string };
export const TICKET_STATUS: Record<string, string> = { bot: 'مع المساعد', open: 'مستنية موظف', in_progress: 'بنحلّها', resolved: 'اتحلّت' };

export const SIDES: Record<string, string> = { '': 'مش مهم', right: 'يمين', left: 'شمال', front: 'قدام', rear: 'ورا' };
export const URGENCY: Record<string, string> = { normal: 'عادي', today: 'النهارده', urgent: 'مستعجل جداً' };
export const ORDER_STEPS: { key: string; label: string; pickupLabel?: string }[] = [
  { key: 'preparing', label: 'المحل بيجهّز' },
  { key: 'ready', label: 'جاهزة', pickupLabel: 'جاهزة للاستلام' },
  { key: 'out_for_delivery', label: 'خرجت للتوصيل' },
  { key: 'delivered', label: 'اتسلّمت' },
];
export const REPORT_CATEGORIES: Record<string, string> = { order: 'مشكلة في طلب', shop: 'شكوى من محل', customer: 'شكوى من عميل', app: 'مشكلة في التطبيق', other: 'حاجة تانية' };
export type Quote = {
  id: string; request_id: string; shop_id: string; price: number; condition: string; warranty_days: number;
  photo_path: string | null; created_at: string;
};

export function friendlyError(e: any): string {
  const msg = String(e?.message || e || '');
  if (/Invalid login credentials/i.test(msg)) return 'الإيميل أو كلمة السر غلط.';
  if (/already registered|already exists/i.test(msg)) return 'الإيميل ده متسجل قبل كده. جرّب تسجّل دخول.';
  if (/Password should be/i.test(msg)) return 'كلمة السر لازم تكون ٦ حروف أو أكتر.';
  if (/Email not confirmed/i.test(msg)) return 'لازم تأكد إيميلك الأول من الرسالة اللي وصلتك.';
  if (/rate limit/i.test(msg)) return 'محاولات كتير. استنى شوية وجرّب تاني.';
  if (/profiles_one_role/i.test(msg)) return 'الحساب ده متسجل بدور تاني. كل حساب يا عميل يا محل.';
  if (/does not deliver/i.test(msg)) return 'المحل ده مش بيوصّل. اختار الاستلام من المحل.';
  if (/request is closed|cannot choose/i.test(msg)) return 'الطلب ده اتقفل.';
  if (/postal_code/i.test(msg)) return 'الرقم البريدي لازم يكون ٥ أرقام.';
  if (/network|fetch/i.test(msg)) return 'مفيش اتصال بالإنترنت. جرّب تاني.';
  return 'حصلت مشكلة. جرّب تاني.';
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
  items.length === 1 ? items[0].part : items.length === 2 ? items[0].part + ' و' + items[1].part : `${items[0].part} و${ar(items.length - 1)} قطع تانية`;

/** A random id for a batch of parts (no crypto needed). */
export const newId = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
  const r = (Math.random() * 16) | 0;
  return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
});

/** One step of progress for a group of parts, 0..4, and its label for the customer. */
export function groupProgress(items: Request[], quoteCount: number): { step: number; label: string } {
  if (items.every((r) => r.status === 'done')) return { step: 4, label: 'اتسلّم' };
  if (items.every((r) => r.status === 'cancelled')) return { step: 0, label: 'اتلغى' };
  if (items.some((r) => r.status === 'chosen' && r.order_status === 'out_for_delivery')) return { step: 3, label: 'في الطريق ليك' };
  if (items.some((r) => r.status === 'chosen')) return { step: 3, label: 'المحل بيجهّز' };
  if (quoteCount) return { step: 2, label: `${ar(quoteCount)} عروض مستنياك` };
  return { step: 1, label: 'بندوّر عند المحلات' };
}

/* ---------------------------------------------------------------- orders */
export type Order = {
  id: string; order_no: number; customer_id: string; shop_id: string; delivery_mode: 'delivery' | 'pickup';
  status: 'preparing' | 'ready' | 'out_for_delivery' | 'delivered' | 'received' | 'cancelled';
  items_total: number; delivery_fee: number; rating: number | null; review: string;
  created_at: string; updated_at: string; received_at: string | null;
};
export const orderNo = (n: number) => '#' + ar(n);
/** What the customer reads for each order status. */
export const ORDER_LABEL: Record<Order['status'], { title: string; short: string; icon: string }> = {
  preparing: { title: 'المحل بيجهّز أوردرك', short: 'بيتجهّز', icon: 'construct' },
  ready: { title: 'أوردرك جاهز للاستلام', short: 'جاهز للاستلام', icon: 'bag-check' },
  out_for_delivery: { title: 'أوردرك في الطريق ليك', short: 'في الطريق', icon: 'bicycle' },
  delivered: { title: 'المحل سلّم الأوردر', short: 'اتسلّم من المحل', icon: 'checkmark-done' },
  received: { title: 'استلمت الأوردر', short: 'اتسلّم', icon: 'checkmark-circle' },
  cancelled: { title: 'الأوردر اتلغى', short: 'اتلغى', icon: 'close-circle' },
};
/** The steps an order goes through, depending on delivery or pickup. */
export const orderSteps = (mode: Order['delivery_mode']): Order['status'][] =>
  mode === 'delivery' ? ['preparing', 'out_for_delivery', 'delivered', 'received'] : ['preparing', 'ready', 'delivered', 'received'];
export const ORDER_STEP_NAME: Record<string, string> = {
  preparing: 'بيتجهّز', ready: 'جاهز', out_for_delivery: 'في الطريق', delivered: 'اتسلّم', received: 'تمام',
};
export const orderActive = (o: Pick<Order, 'status'>) => o.status !== 'received' && o.status !== 'cancelled';

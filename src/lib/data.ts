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
};
export type Car = { id: string; make: string; model: string; year: number; vin: string };
export type Message = { id: string; request_id: string; shop_id: string; sender_id: string; body: string; photo_path: string | null; created_at: string };
export type Notification = { id: string; title: string; body: string; link: string; read_at: string | null; created_at: string };
export type Report = { id: string; reporter_id: string; request_id: string | null; category: string; body: string; status: 'open' | 'resolved'; admin_reply: string; created_at: string };

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

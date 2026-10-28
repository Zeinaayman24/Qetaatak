import { createClient } from '@supabase/supabase-js';
import { useCallback, useEffect, useRef, useState } from 'react';

// Same project as the app. Publishable key; access is controlled by row level security (staff only).
export const supabase = createClient('https://ztnbyvfupadzhddnbdje.supabase.co', 'sb_publishable_Cq6sW08mbNDB8gUzn9jvlQ_YnjzBQ9d', {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: 'qetaatak-manage-auth' },
});

export const photoUrl = (path?: string | null) => (path ? supabase.storage.from('photos').getPublicUrl(path).data.publicUrl : null);

/* ---------------------------------------------------------------- types */
export type Profile = {
  id: string; member_no: number; full_name: string; phone: string; email: string; area: string; governorate: string; country: string;
  street: string; building: string; floor: string; apartment: string; landmark: string; postal_code: string;
  car_make: string | null; car_model: string | null; car_year: number | null; car_vin: string;
  is_customer: boolean; is_shop: boolean; is_admin: boolean; is_support: boolean; is_blocked: boolean; created_at: string;
};
export type Shop = { id: string; area: string; governorate: string; brands: string[]; specialties: string[]; shop_type: string; offers_delivery: boolean; status: 'pending' | 'approved' | 'suspended'; created_at: string };
export type ShopPrivate = { id: string; name: string; owner_name: string; phone: string; phone2: string; street: string; building: string; landmark: string; postal_code: string; commercial_register: string };
export type Request = {
  id: string; num: number; customer_id: string; part: string; car_make: string; car_model: string; car_year: number; vin: string;
  wanted_condition: string; side: string; urgency: string; budget: number | null; area: string; notes: string; photo_path: string | null;
  status: 'open' | 'chosen' | 'done' | 'cancelled'; chosen_quote_id: string | null; delivery_mode: string | null; order_status: string | null;
  rating: number | null; review: string; created_at: string; chosen_at: string | null; done_at: string | null;
  batch_id: string | null; qty: number;
};
export type Quote = { id: string; request_id: string; shop_id: string; price: number; condition: string; warranty_days: number; created_at: string };
export type Ticket = {
  id: string; ticket_no: number; reporter_id: string; request_id: string | null; category: string; body: string;
  status: 'bot' | 'open' | 'in_progress' | 'resolved'; priority: 'low' | 'normal' | 'high'; assigned_to: string | null;
  admin_reply: string; created_at: string; updated_at: string; resolved_at: string | null;
  escalated_at: string | null; resolved_by: 'bot' | 'agent' | 'customer' | null;
};
export type TicketMessage = { id: string; report_id: string; sender_id: string; body: string; internal: boolean; kind: 'user' | 'bot' | 'system'; created_at: string };
export type Message = { id: string; request_id: string; shop_id: string; sender_id: string; body: string; photo_path: string | null; created_at: string };

/* ---------------------------------------------------------------- labels */
export const memberId = (p: Pick<Profile, 'member_no' | 'is_customer' | 'is_shop'> | undefined | null) =>
  p ? (p.is_shop ? 'S-' : p.is_customer ? 'C-' : 'U-') + p.member_no : '—';
export const ticketId = (n: number) => 'T-' + n;
export const orderId = (n: number) => '#' + n;

export const REQUEST_STATUS: Record<string, string> = { open: 'مستني عروض', chosen: 'اتأكد', done: 'اتسلّم', cancelled: 'اتلغى' };
export const ORDER_STATUS: Record<string, string> = { preparing: 'بيتجهّز', ready: 'جاهز للاستلام', out_for_delivery: 'خرج للتوصيل', delivered: 'اتسلّم' };
export const SHOP_STATUS: Record<string, string> = { pending: 'مستني موافقة', approved: 'شغال', suspended: 'موقوف' };
export const TICKET_STATUS: Record<string, string> = { bot: 'مع المساعد الآلي', open: 'مستنية موظف', in_progress: 'مع موظف', resolved: 'انتهت' };
export const RESOLVED_BY: Record<string, string> = { bot: 'المساعد حلّها', agent: 'موظف قفلها', customer: 'العميل قفلها' };
/** Tickets that need a person: escalated by the assistant or already with an agent. */
export const needsPeople = (t: { status: string }) => t.status === 'open' || t.status === 'in_progress';
export const PRIORITY: Record<string, string> = { low: 'منخفضة', normal: 'عادية', high: 'عاجلة' };
export const CATEGORY: Record<string, string> = { order: 'مشكلة في طلب', shop: 'شكوى من محل', customer: 'شكوى من عميل', app: 'مشكلة في التطبيق', other: 'حاجة تانية' };
export const CONDITION: Record<string, string> = { used_original: 'مستعمل أصلي', used_clean: 'مستعمل نضيف جداً', new_aftermarket: 'تجاري جديد', new_original: 'أصلي جديد' };
export const WANTED: Record<string, string> = { used: 'مستعمل', new: 'جديد', any: 'أي حاجة' };
export const SHOP_TYPE: Record<string, string> = { used: 'مستعمل / تشليح', new: 'جديد', both: 'مستعمل وجديد' };
export const SIDE: Record<string, string> = { '': '', right: 'يمين', left: 'شمال', front: 'قدام', rear: 'ورا' };
export const URGENCY: Record<string, string> = { normal: 'عادي', today: 'النهارده', urgent: 'مستعجل جداً' };

export const money = (n: number) => Math.round(n || 0).toLocaleString('en-US') + ' ج.م';
export const date = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString('ar-EG', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
export const dateTime = (iso?: string | null) => (iso ? new Date(iso).toLocaleString('ar-EG', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '—');
export const ago = (iso: string) => {
  const m = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (m < 60) return `من ${m} دقيقة`;
  const h = Math.round(m / 60);
  return h < 24 ? `من ${h} ساعة` : `من ${Math.round(h / 24)} يوم`;
};
export const address = (a: { street?: string; building?: string; floor?: string; apartment?: string; area?: string; governorate?: string }) =>
  [a.street, a.building && 'عمارة ' + a.building, a.floor && 'دور ' + a.floor, a.apartment && 'شقة ' + a.apartment, a.area, a.governorate].filter(Boolean).join('، ');

/* ---------------------------------------------------------------- live data */
let seq = 0;
/** Loads data and reloads it whenever one of `tables` changes. */
export function useLive<T>(fetcher: () => Promise<T>, tables: string[], deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef(fetcher); ref.current = fetcher;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reload = useCallback(async () => {
    try { setData(await ref.current()); setError(null); } catch (e: any) { setError(e?.message ?? 'خطأ'); }
  }, []);
  useEffect(() => {
    reload();
    const ch = supabase.channel('m-' + ++seq);
    tables.forEach((t) => ch.on('postgres_changes', { event: '*', schema: 'public', table: t }, () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(reload, 400);
    }));
    ch.subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tables.join(','), ...deps]);
  return { data, error, reload };
}

export function must<T>(res: { data: T | null; error: any }): T {
  if (res.error) throw res.error;
  return res.data as T;
}

/** Everything the lists need, loaded once and kept live. */
export async function loadAll() {
  const [profiles, shops, priv, requests, quotes, tickets] = await Promise.all([
    supabase.from('profiles').select('*').order('member_no', { ascending: false }),
    supabase.from('shops').select('*'),
    supabase.from('shop_private').select('*'),
    supabase.from('requests').select('*').order('created_at', { ascending: false }).limit(1000),
    supabase.from('quotes').select('*').limit(5000),
    supabase.from('reports').select('*').order('updated_at', { ascending: false }).limit(1000),
  ]);
  const p = must(profiles) as Profile[];
  return {
    profiles: p,
    byId: Object.fromEntries(p.map((x) => [x.id, x])) as Record<string, Profile>,
    shops: Object.fromEntries((must(shops) as Shop[]).map((x) => [x.id, x])) as Record<string, Shop>,
    priv: Object.fromEntries((must(priv) as ShopPrivate[]).map((x) => [x.id, x])) as Record<string, ShopPrivate>,
    requests: must(requests) as Request[],
    quotes: must(quotes) as Quote[],
    tickets: must(tickets) as Ticket[],
  };
}
export type All = Awaited<ReturnType<typeof loadAll>>;
export const ALL_TABLES = ['profiles', 'shops', 'requests', 'quotes', 'reports'];

/** Where a part sits in a multi-part request: "1 of 3", with the batch's first order number. */
export function batchOf(requests: Request[], r: Request) {
  if (!r.batch_id) return null;
  const parts = requests.filter((x) => x.batch_id === r.batch_id).sort((a, b) => a.num - b.num);
  return { parts, index: parts.findIndex((x) => x.id === r.id) + 1, first: parts[0] };
}

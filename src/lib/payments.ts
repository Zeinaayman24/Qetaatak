import { Linking, Platform } from 'react-native';
import type { Order, PayMethod, PayStatus } from './data';
import { supabase } from './supabase';

/** The four ways to pay, in the order the checkout lists them. */
export const PAY_METHODS: { v: PayMethod; title: string; sub: string; icon: string }[] = [
  { v: 'cash', title: 'كاش عند الاستلام', sub: 'ادفع للمندوب أو المحل لما القطعة توصلك', icon: 'cash' },
  { v: 'instapay', title: 'InstaPay أو محفظة', sub: 'حوّل المبلغ وارفع صورة الإيصال، وإحنا نأكد', icon: 'phone' },
  { v: 'card', title: 'بطاقة بنكية', sub: 'فيزا · ماستركارد · ميزة، دفع آمن عن طريق Paymob', icon: 'card' },
  { v: 'shop', title: 'الدفع في المحل', sub: 'للاستلام من المحل بس: ادفع وانت بتستلم', icon: 'storefront' },
];
export const PAY_NAME: Record<PayMethod, string> = { cash: 'كاش عند الاستلام', instapay: 'InstaPay / محفظة', card: 'بطاقة بنكية', shop: 'الدفع في المحل' };

/** How each payment state reads to the customer, and its pill tone. */
export const PAY_STATUS: Record<PayStatus, { label: string; tone: 'good' | 'wait' | 'bad' | 'plain' | 'new' }> = {
  unpaid: { label: 'الدفع عند الاستلام', tone: 'plain' },
  awaiting: { label: 'مستني الدفع', tone: 'wait' },
  review: { label: 'بنراجع الإيصال', tone: 'new' },
  paid: { label: 'مدفوع', tone: 'good' },
  failed: { label: 'الدفع ماتمّش', tone: 'bad' },
  refund_due: { label: 'هيترجعلك المبلغ', tone: 'wait' },
  refunded: { label: 'المبلغ رجع', tone: 'plain' },
};

/** True when an online payment still has to happen before the shop can move on. */
export const needsPayment = (o: Pick<Order, 'payment_method' | 'payment_status' | 'status'>) =>
  o.status !== 'cancelled' && (o.payment_method === 'instapay' || o.payment_method === 'card') && ['awaiting', 'failed'].includes(o.payment_status);

let cardCache: boolean | null = null;
/** Is card payment switched on (Paymob keys set on the server)? Cached for the session. */
export async function cardAvailable(): Promise<boolean> {
  if (cardCache !== null) return cardCache;
  try {
    const { data } = await supabase.functions.invoke('paymob', { body: { mode: 'ping' } });
    cardCache = !!data?.configured;
  } catch { cardCache = false; }
  return cardCache;
}

/** Opens Paymob's secure checkout for one order. Returns an error message, or null when it opened. */
export async function payByCard(orderId: string): Promise<string | null> {
  const { data, error } = await supabase.functions.invoke('paymob', { body: { mode: 'create', order: orderId } });
  if (error || !data?.url) return data?.configured === false ? 'الدفع بالبطاقة لسه مش متفعّل.' : 'مقدرناش نفتح صفحة الدفع. جرّب تاني.';
  if (Platform.OS === 'web' && typeof window !== 'undefined') window.location.href = data.url;
  else await Linking.openURL(data.url);
  return null;
}

export type PaySettings = { instapay_address: string; wallet_number: string; account_name: string; payment_note: string };
/** The company's InstaPay / wallet details, set by the team in the management system. */
export async function paySettings(): Promise<PaySettings> {
  const { data } = await supabase.from('app_settings').select('key, value');
  const m = Object.fromEntries(((data ?? []) as { key: string; value: string }[]).map((r) => [r.key, r.value]));
  return { instapay_address: m.instapay_address ?? '', wallet_number: m.wallet_number ?? '', account_name: m.account_name ?? '', payment_note: m.payment_note ?? '' };
}

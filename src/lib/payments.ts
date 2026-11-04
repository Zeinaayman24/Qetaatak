import { Linking, Platform } from 'react-native';
import type { DepositStatus, Order, PayMethod, PayStatus } from './data';
import { supabase } from './supabase';
import { t } from '@/lib/i18n';

/** The four ways to pay, in the order the checkout lists them. */
export const PAY_METHODS: { v: PayMethod; title: string; sub: string; icon: string }[] = [
  { v: 'cash', title: t('كاش عند الاستلام'), sub: t('ادفع للمندوب أو المحل لما القطعة توصلك'), icon: 'cash' },
  { v: 'instapay', title: t('InstaPay أو محفظة'), sub: t('حوّل للمحل مباشرة وارفع صورة الإيصال، والمحل يأكد'), icon: 'phone' },
  { v: 'card', title: t('بطاقة بنكية'), sub: t('فيزا، ماستركارد، ميزة، دفع آمن عن طريق Paymob'), icon: 'card' },
  { v: 'shop', title: t('الدفع في المحل'), sub: t('للاستلام من المحل بس: ادفع وانت بتستلم'), icon: 'storefront' },
];
export const PAY_NAME: Record<PayMethod, string> = { cash: t('كاش عند الاستلام'), instapay: t('InstaPay / محفظة'), card: t('بطاقة بنكية'), shop: t('الدفع في المحل') };

/** How each payment state reads to the customer, and its pill tone. */
export const PAY_STATUS: Record<PayStatus, { label: string; tone: 'good' | 'wait' | 'bad' | 'plain' | 'new' }> = {
  unpaid: { label: t('الدفع عند الاستلام'), tone: 'plain' },
  awaiting: { label: t('مستني الدفع'), tone: 'wait' },
  review: { label: t('المحل بيراجع الإيصال'), tone: 'new' },
  paid: { label: t('مدفوع'), tone: 'good' },
  failed: { label: t('الدفع ماتمّش'), tone: 'bad' },
  refund_due: { label: t('هيترجّعلك المبلغ'), tone: 'wait' },
  refunded: { label: t('المبلغ رجع'), tone: 'plain' },
};

/** True when a pickup order's deposit still has to be paid (or was not accepted and can be paid again). */
export const depositOpen = (o: Pick<Order, 'deposit_status' | 'status'>) =>
  o.status !== 'cancelled' && (o.deposit_status === 'awaiting' || o.deposit_status === 'failed');

/** True when an online payment still has to happen before the shop can move on. */
export const needsPayment = (o: Pick<Order, 'payment_method' | 'payment_status' | 'status' | 'deposit_status'>) =>
  depositOpen(o) || (o.status !== 'cancelled' && (o.payment_method === 'instapay' || o.payment_method === 'card') && ['awaiting', 'failed'].includes(o.payment_status));

/** How each deposit state reads to the customer, and its pill tone. */
export const DEPOSIT_STATUS: Record<DepositStatus, { label: string; tone: 'good' | 'wait' | 'bad' | 'plain' | 'new' }> = {
  none: { label: '', tone: 'plain' },
  awaiting: { label: t('ادفع العربون'), tone: 'wait' },
  review: { label: t('بنراجع الإيصال'), tone: 'new' },
  failed: { label: t('العربون ماوصلش'), tone: 'bad' },
  paid: { label: t('العربون اتدفع'), tone: 'good' },
  used: { label: t('العربون اتخصم'), tone: 'good' },
  forfeited: { label: t('العربون مارجعش'), tone: 'plain' },
  refund_check: { label: t('بنأكد مع المحل'), tone: 'new' },
  disputed: { label: t('فريق ضغطة بيراجع'), tone: 'new' },
  refund_due: { label: t('هيرجعلك العربون'), tone: 'wait' },
  refunded: { label: t('العربون رجع'), tone: 'plain' },
  void: { label: t('اتلغى'), tone: 'plain' },
};

/** The deposit rules as the app shows them; the server keeps the real values in app_settings. */
export type DepositRules = { on: boolean; flat: number; threshold: number; pct: number; cap: number; holdHours: number; payHours: number };
let rulesCache: DepositRules | null = null;
export async function depositRules(): Promise<DepositRules> {
  if (rulesCache) return rulesCache;
  const { data } = await supabase.from('app_settings').select('key, value').like('key', 'deposit%');
  const m = Object.fromEntries(((data ?? []) as { key: string; value: string }[]).map((r) => [r.key, r.value]));
  const n = (k: string, d: number) => (m[k] != null && m[k] !== '' && !Number.isNaN(Number(m[k])) ? Number(m[k]) : d);
  rulesCache = { on: m.deposits === 'on', flat: n('deposit_flat', 50), threshold: n('deposit_threshold', 1000), pct: n('deposit_pct', 5),
    cap: n('deposit_cap', 500), holdHours: n('deposit_hold_hours', 48), payHours: n('deposit_pay_hours', 2) };
  return rulesCache;
}
/** Same formula as public.deposit_for on the server. */
export const depositFor = (total: number, r: DepositRules) =>
  total < r.threshold ? Math.min(r.flat, total) : Math.min(r.cap, Math.round((total * r.pct) / 100));

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
  if (error || !data?.url) return data?.configured === false ? t('الدفع بالبطاقة لسه مش متفعّل.') : t('مقدرناش نفتح صفحة الدفع. جرّب تاني.');
  if (Platform.OS === 'web' && typeof window !== 'undefined') window.location.href = data.url;
  else await Linking.openURL(data.url);
  return null;
}

export type PaySettings = { instapay_address: string; wallet_number: string; account_name: string; payment_note: string; bank_account: string };
/** The company's InstaPay / wallet details, set by the team in the management system. */
export async function paySettings(): Promise<PaySettings> {
  const { data } = await supabase.from('app_settings').select('key, value');
  const m = Object.fromEntries(((data ?? []) as { key: string; value: string }[]).map((r) => [r.key, r.value]));
  return { instapay_address: m.instapay_address ?? '', wallet_number: m.wallet_number ?? '', account_name: m.account_name ?? '', payment_note: m.payment_note ?? '', bank_account: m.bank_account ?? '' };
}

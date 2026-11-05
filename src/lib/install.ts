import { money } from './data';
import { t } from './i18n';

export type InstallRequest = {
  id: string; num: number; customer_id: string; service_id: string; car_make: string; car_model: string; car_year: number | null;
  part_desc: string; photo_path: string | null; notes: string; governorate: string; area: string; target_shop: string | null;
  status: 'open' | 'booked' | 'cancelled' | 'expired'; created_at: string;
};
export type InstallQuote = { id: string; request_id: string; shop_id: string; price: number | null; price_max: number | null; needs_inspection: boolean; note: string; earliest: string; created_at: string };
export const IR_STATUS: Record<string, { label: string; tone: 'new' | 'good' | 'plain' | 'wait' }> = {
  open: { label: t('مستني عروض'), tone: 'new' }, booked: { label: t('اتحجز'), tone: 'good' }, cancelled: { label: t('اتلغى'), tone: 'plain' }, expired: { label: t('انتهى'), tone: 'plain' },
};
export const quotePrice = (q: Pick<InstallQuote, 'price' | 'price_max' | 'needs_inspection'>) =>
  q.price == null ? t('السعر بعد المعاينة')
    : q.price_max != null && q.price_max > q.price ? t('{0} – {1} ج.م', money(q.price), money(q.price_max)) : t('{0} ج.م', money(q.price));


import { ar, type Quote, type Request } from '@/lib/data';
import { Pill } from './ui';
import { t } from '@/lib/i18n';

export function customerPill(r: Request, quoteCount: number) {
  if (r.status === 'done') return <Pill label={t('اتسلّم')} tone="good" />;
  if (r.status === 'chosen') return <Pill label={t('اتأكد')} tone="good" />;
  if (r.status === 'cancelled') return <Pill label={t('اتلغى')} />;
  if (quoteCount) return <Pill label={ar(quoteCount) + t(' عروض')} tone="new" />;
  return <Pill label={t('مستني عروض')} tone="wait" />;
}

export type ShopState = 'open' | 'quoted' | 'sold' | 'lost' | 'declined' | 'closed';

/** How a request looks from one shop's side. `myQuote` is that shop's quote, if any. */
export function shopState(r: Request, myQuote: Pick<Quote, 'id'> | undefined, declined: boolean): ShopState {
  if (r.status === 'chosen' || r.status === 'done') {
    if (myQuote && r.chosen_quote_id === myQuote.id) return 'sold';
    return myQuote ? 'lost' : 'closed';
  }
  if (r.status === 'cancelled' || r.status === 'expired') return 'closed';
  if (myQuote) return 'quoted';
  if (declined) return 'declined';
  return 'open';
}

export function shopPill(st: ShopState) {
  switch (st) {
    case 'open': return <Pill label={t('جديد')} tone="new" />;
    case 'quoted': return <Pill label={t('بعت عرض')} tone="wait" />;
    case 'sold': return <Pill label={t('اتباع')} tone="good" />;
    case 'lost': return <Pill label={t('اختار محل تاني')} />;
    case 'declined': return <Pill label={t('مش متوفر')} />;
    default: return <Pill label={t('اتقفل')} />;
  }
}

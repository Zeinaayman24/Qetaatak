import { ar, type Quote, type Request } from '@/lib/data';
import { Pill } from './ui';

export function customerPill(r: Request, quoteCount: number) {
  if (r.status === 'done') return <Pill label="اتسلّم" tone="good" />;
  if (r.status === 'chosen') return <Pill label="اتأكد" tone="good" />;
  if (r.status === 'cancelled') return <Pill label="اتلغى" />;
  if (quoteCount) return <Pill label={ar(quoteCount) + ' عروض'} tone="new" />;
  return <Pill label="مستني عروض" tone="wait" />;
}

export type ShopState = 'open' | 'quoted' | 'sold' | 'lost' | 'declined' | 'closed';

/** How a request looks from one shop's side. `myQuote` is that shop's quote, if any. */
export function shopState(r: Request, myQuote: Pick<Quote, 'id'> | undefined, declined: boolean): ShopState {
  if (r.status === 'chosen' || r.status === 'done') {
    if (myQuote && r.chosen_quote_id === myQuote.id) return 'sold';
    return myQuote ? 'lost' : 'closed';
  }
  if (r.status === 'cancelled') return 'closed';
  if (myQuote) return 'quoted';
  if (declined) return 'declined';
  return 'open';
}

export function shopPill(st: ShopState) {
  switch (st) {
    case 'open': return <Pill label="جديد" tone="new" />;
    case 'quoted': return <Pill label="بعت عرض" tone="wait" />;
    case 'sold': return <Pill label="اتباع" tone="good" />;
    case 'lost': return <Pill label="اختار محل تاني" />;
    case 'declined': return <Pill label="مش متوفر" />;
    default: return <Pill label="اتقفل" />;
  }
}

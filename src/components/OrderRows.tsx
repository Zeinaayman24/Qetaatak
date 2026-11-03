import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { Muted, Press, T } from '@/components/ui';
import { ORDER_LABEL, ar, elapsed, money, orderNo, type Order } from '@/lib/data';
import { useNow } from '@/lib/live';
import { colors, lift } from '@/lib/theme';

/** Which tab an order sits in. Old "out for delivery / delivered" orders count as ready. */
export type Bucket = 'preparing' | 'ready' | 'done';
export const bucketOf = (o: Pick<Order, 'status'>): Bucket =>
  o.status === 'preparing' ? 'preparing' : o.status === 'received' || o.status === 'cancelled' ? 'done' : 'ready';


/** Tabs across the top, each with its count: [ جديد ٣ ] [ بيتجهز ٢ ] [ جاهز ١ ] [ خلصت ]. */
export function StatusTabs<V extends string>({ items, value, onPick }: { items: { v: V; label: string; n?: number; hot?: boolean }[]; value: V; onPick: (v: V) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 8, paddingVertical: 2 }}>
      {items.map((it) => {
        const on = it.v === value;
        return (
          <Press key={it.v} onPress={() => onPick(it.v)} selected={on} label={it.label}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 40, paddingHorizontal: 14, borderRadius: 999,
              backgroundColor: on ? colors.ink : colors.surface, borderWidth: 1, borderColor: on ? colors.ink : colors.line }}>
            <T w={on ? 'bold' : 'medium'} size={14} color={on ? '#fff' : colors.ink}>{it.label}</T>
            {it.n ? (
              <View style={{ minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center',
                backgroundColor: it.hot ? colors.primary : on ? 'rgba(255,255,255,.18)' : colors.soft }}>
                <T w="bold" size={12} color={it.hot || on ? '#fff' : colors.ink} style={{ lineHeight: 18 }}>{ar(it.n)}</T>
              </View>
            ) : null}
          </Press>
        );
      })}
    </ScrollView>
  );
}

/** The white list that holds slim rows, with dividers between them. */
export function RowList({ children }: { children: ReactNode }) {
  return <View style={[lift, { backgroundColor: colors.surface, borderRadius: 16, overflow: 'hidden' }]}>{children}</View>;
}

/** One order as a slim row: number, parts, live timer; then total, handover and a status dot. */
export function OrderRow({ o, title, first, onPress, flag }: { o: Order; title: string; first?: boolean; onPress: () => void; flag?: { label: string; tone: 'wait' | 'bad' | 'good' } }) {
  const now = useNow(o.status === 'received' || o.status === 'cancelled' ? 60000 : 30000);
  const live = o.status !== 'received' && o.status !== 'cancelled';
  const flagColor = flag ? (flag.tone === 'bad' ? colors.bad : flag.tone === 'good' ? colors.good : colors.warn) : undefined;
  const tone = o.status === 'preparing' ? [colors.warnSoft, colors.warn] : o.status === 'received' ? [colors.soft, colors.muted] : o.status === 'cancelled' ? [colors.badSoft, colors.bad] : [colors.goodSoft, colors.good];
  return (
    <Press onPress={onPress} label={`أوردر ${orderNo(o.order_no)}`}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14, borderTopWidth: first ? 0 : 1, borderColor: '#EEF0F3' }}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <T w="semibold" size={15} numberOfLines={1}>{title}</T>
        <Muted size={13} numberOfLines={1}>
          أوردر {orderNo(o.order_no)} · {money(Number(o.items_total) + Number(o.delivery_fee))} ج.م · {live ? elapsed(o.created_at, now) : new Date(o.created_at).toLocaleDateString('ar-EG', { day: 'numeric', month: 'short' })}
        </Muted>
      </View>
      {flag ? <T size={13} w="semibold" color={flagColor}>{flag.label}</T> : null}
      <View style={{ backgroundColor: tone[0], borderRadius: 10, paddingHorizontal: 10, paddingVertical: 3 }}>
        <T size={13} w="semibold" color={tone[1]} style={{ lineHeight: 19 }}>{ORDER_LABEL[o.status].short}</T>
      </View>
    </Press>
  );
}

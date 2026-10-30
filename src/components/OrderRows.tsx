import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { Icon, Muted, Press, Row, T } from '@/components/ui';
import { ORDER_LABEL, ar, elapsed, money, orderNo, type Order } from '@/lib/data';
import { useNow } from '@/lib/live';
import { colors, lift } from '@/lib/theme';

/** Which tab an order sits in. Old "out for delivery / delivered" orders count as ready. */
export type Bucket = 'preparing' | 'ready' | 'done';
export const bucketOf = (o: Pick<Order, 'status'>): Bucket =>
  o.status === 'preparing' ? 'preparing' : o.status === 'received' || o.status === 'cancelled' ? 'done' : 'ready';

const DOT: Record<string, string> = { preparing: colors.primary, ready: colors.good, out_for_delivery: colors.good, delivered: colors.good, received: colors.muted, cancelled: colors.bad };

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
                backgroundColor: it.hot ? colors.lime : on ? 'rgba(255,255,255,.18)' : colors.soft }}>
                <T w="bold" size={12} color={it.hot ? colors.ink : on ? '#fff' : colors.ink} style={{ lineHeight: 18 }}>{ar(it.n)}</T>
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
  const now = useNow(o.status === 'received' || o.status === 'cancelled' ? 60000 : 1000);
  const live = o.status !== 'received' && o.status !== 'cancelled';
  const flagColor = flag ? (flag.tone === 'bad' ? colors.bad : flag.tone === 'good' ? colors.good : colors.warn) : undefined;
  return (
    <Press onPress={onPress} label={`أوردر ${orderNo(o.order_no)}`}
      style={{ paddingHorizontal: 14, paddingVertical: 13, gap: 4, borderTopWidth: first ? 0 : 1, borderColor: colors.line }}>
      <Row gap={8}>
        <T w="bold" size={13.5} color={colors.muted}>{orderNo(o.order_no)}</T>
        <T w="bold" size={15} numberOfLines={1} style={{ flex: 1 }}>{title}</T>
        {live ? <Row gap={3}><Icon name="time-outline" size={13} color={colors.muted} /><T size={12.5} w="semibold" color={colors.muted}>{elapsed(o.created_at, now)}</T></Row>
          : <Muted size={12}>{new Date(o.created_at).toLocaleDateString('ar-EG', { day: 'numeric', month: 'short' })}</Muted>}
      </Row>
      <Row gap={8}>
        <Muted size={12.5} style={{ flex: 1 }}>{money(Number(o.items_total) + Number(o.delivery_fee))} ج.م، {o.delivery_mode === 'pickup' ? 'استلام' : 'توصيل'}</Muted>
        {flag ? <T size={12.5} w="bold" color={flagColor}>{flag.label}</T> : null}
        <Row gap={5}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: DOT[o.status] ?? colors.muted }} />
          <T size={12.5} w="semibold" color={o.status === 'cancelled' ? colors.bad : colors.ink}>{ORDER_LABEL[o.status].short}</T>
        </Row>
      </Row>
    </Press>
  );
}

import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { BottomNav } from '@/components/AppHeader';
import { Empty, Icon, Loading, Muted, Photo, Pill, Plate, Press, Row, Screen, Seg, T } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { ago, ar, groupProgress, groupRequests, partsLabel, reqNo, type Quote, type Request } from '@/lib/data';
import { must, useLive } from '@/lib/live';
import { photoUrl, supabase } from '@/lib/supabase';
import { colors, lift } from '@/lib/theme';

export default function MyRequests() {
  const { ready, session } = useAuth();
  const uid = session?.user.id;
  const [tab, setTab] = useState<'active' | 'past'>('active');
  const { data, loading } = useLive(async () => {
    if (!uid) return { reqs: [] as Request[], quotes: [] as Pick<Quote, 'id' | 'request_id'>[] };
    const reqs = must(await supabase.from('requests').select('*').eq('customer_id', uid).order('created_at', { ascending: false }).limit(150)) as Request[];
    const ids = reqs.map((r) => r.id);
    const quotes = ids.length ? (must(await supabase.from('quotes').select('id, request_id').in('request_id', ids)) as Pick<Quote, 'id' | 'request_id'>[]) : [];
    return { reqs, quotes };
  }, ['requests', 'quotes'], [uid]);

  if (ready && !session) return <Redirect href="/login" />;
  const groups = groupRequests(data?.reqs ?? [])
    .filter((g) => (tab === 'active' ? g.items.some((r) => r.status === 'open' || r.status === 'chosen') : g.items.every((r) => r.status === 'done' || r.status === 'cancelled')))
    .sort((a, b) => b.first.created_at.localeCompare(a.first.created_at));

  return (
    <Screen nav={<BottomNav role="customer" />}>
      <T w="bold" size={28} style={{ lineHeight: 40 }}>طلباتي</T>
      <Seg options={[{ v: 'active', label: 'شغالة' }, { v: 'past', label: 'خلصت' }]} value={tab} onPick={setTab} />
      {loading && !data ? <Loading /> : groups.length ? (
        <View style={{ gap: 12 }}>
          {groups.map((g) => {
            const n = data!.quotes.filter((q) => g.items.some((r) => r.id === q.request_id)).length;
            const p = groupProgress(g.items, n);
            const photo = g.items.find((r) => r.photo_path)?.photo_path;
            return (
              <Press key={g.key} onPress={() => router.push(`/customer/${g.first.id}`)}
                style={[{ backgroundColor: colors.surface, borderRadius: 22, padding: 14, gap: 12 }, lift]}>
                <Row gap={12}>
                  {photo ? <Photo uri={photoUrl(photo)} size={52} /> : <Plate top="طلب" bottom={reqNo(g.first.num).replace('#', '')} size="sm" />}
                  <View style={{ flex: 1, gap: 2 }}>
                    <T w="bold" size={15} numberOfLines={1}>{partsLabel(g.items)}</T>
                    <Muted size={12}>{g.first.car_make} {g.first.car_model} · {reqNo(g.first.num)} · {ago(g.first.created_at)}</Muted>
                  </View>
                  {g.items.length > 1 ? <Pill label={`${ar(g.items.length)} قطع`} /> : null}
                </Row>
                <Row gap={8}>
                  <Icon name={p.step === 4 ? 'checkmark-circle' : p.step === 0 ? 'close-circle' : p.step === 2 ? 'pricetags' : 'time'} size={18}
                    color={p.step === 4 ? colors.good : p.step === 2 ? colors.accentDeep : colors.muted} />
                  <T size={13} w="semibold" color={p.step === 2 ? colors.accentDeep : p.step === 4 ? colors.good : colors.muted} style={{ flex: 1 }}>{p.label}</T>
                  <Icon name="chevron-back" size={15} color={colors.faint} />
                </Row>
              </Press>
            );
          })}
        </View>
      ) : (
        <Empty icon="receipt-outline" text={tab === 'active' ? 'مفيش طلبات شغالة دلوقتي.' : 'لسه مفيش طلبات خلصت.'}
          action={tab === 'active' ? { label: 'اطلب قطعة', onPress: () => router.push('/customer/new') } : undefined} />
      )}
    </Screen>
  );
}

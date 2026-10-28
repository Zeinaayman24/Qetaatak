import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { BottomNav } from '@/components/AppHeader';
import { customerPill } from '@/components/status';
import { Btn, Empty, ListRow, Loading, Photo, Screen, Seg, T } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { ago, reqNo, type Quote, type Request } from '@/lib/data';
import { must, useLive } from '@/lib/live';
import { photoUrl, supabase } from '@/lib/supabase';

export default function MyRequests() {
  const { ready, session } = useAuth();
  const uid = session?.user.id;
  const [tab, setTab] = useState<'active' | 'past'>('active');
  const { data, loading } = useLive(async () => {
    if (!uid) return { reqs: [] as Request[], quotes: [] as Pick<Quote, 'id' | 'request_id'>[] };
    const reqs = must(await supabase.from('requests').select('*').eq('customer_id', uid).order('created_at', { ascending: false }).limit(100)) as Request[];
    const ids = reqs.map((r) => r.id);
    const quotes = ids.length ? (must(await supabase.from('quotes').select('id, request_id').in('request_id', ids)) as Pick<Quote, 'id' | 'request_id'>[]) : [];
    return { reqs, quotes };
  }, ['requests', 'quotes'], [uid]);

  if (ready && !session) return <Redirect href="/login" />;
  const list = (data?.reqs ?? []).filter((r) => (tab === 'active' ? r.status === 'open' || r.status === 'chosen' : r.status === 'done' || r.status === 'cancelled'));

  return (
    <Screen nav={<BottomNav role="customer" />}>
      <T w="bold" size={28} style={{ lineHeight: 40 }}>طلباتي</T>
      <Seg options={[{ v: 'active', label: 'شغالة' }, { v: 'past', label: 'قديمة' }]} value={tab} onPick={setTab} />
      {loading && !data ? <Loading /> : list.length ? (
        <View>
          {list.map((r, i) => (
            <ListRow key={r.id} last={i === list.length - 1} onPress={() => router.push(`/customer/${r.id}`)}
              leading={<Photo uri={photoUrl(r.photo_path)} size={52} />}
              title={r.part}
              subtitle={`${r.car_make} ${r.car_model} · ${reqNo(r.num)}`}
              meta={ago(r.created_at)}
              trailing={customerPill(r, data!.quotes.filter((q) => q.request_id === r.id).length)} />
          ))}
        </View>
      ) : (
        <View style={{ gap: 12 }}>
          <Empty icon="🧰" text={tab === 'active' ? 'مفيش طلبات شغالة دلوقتي.' : 'لسه مفيش طلبات قديمة.'} />
          {tab === 'active' ? <Btn title="اطلب قطعة" onPress={() => router.push({ pathname: '/assistant', params: { mode: 'request' } })} /> : null}
        </View>
      )}
    </Screen>
  );
}

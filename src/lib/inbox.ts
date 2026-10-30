import { useAuth } from './auth';
import { useLive } from './live';
import { supabase } from './supabase';

export type Thread = {
  request_id: string; shop_id: string; num: number; part: string; me_is_shop: boolean; other_name: string;
  last_body: string; last_photo: boolean; last_mine: boolean; last_at: string; unread: number; ordered: boolean;
};

/** Every conversation the signed-in person is in (as a customer or a shop), kept live, plus the unread total. */
export function useInbox() {
  const { session } = useAuth();
  const uid = session?.user.id;
  const { data, loading } = useLive(async () => {
    if (!uid) return [] as Thread[];
    const { data, error } = await supabase.rpc('my_inbox');
    if (error) throw error;
    return ((data ?? []) as Thread[]).map((t) => ({ ...t, unread: Number(t.unread) }));
  }, ['messages', 'chat_reads'], [uid]);
  const threads = data ?? [];
  return { threads, unread: threads.reduce((s, t) => s + t.unread, 0), loading: loading && !data };
}

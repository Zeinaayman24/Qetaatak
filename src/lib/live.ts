import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from './supabase';

let channelSeq = 0;

/**
 * Runs `fetcher`, then re-runs it whenever any of `tables` changes (Supabase Realtime).
 * Row level security still applies, so each person only receives what they may see.
 */
export function useLive<T>(fetcher: () => Promise<T>, tables: string[], deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const fetchRef = useRef(fetcher);
  fetchRef.current = fetcher;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reload = useCallback(async () => {
    try { setData(await fetchRef.current()); setError(null); }
    catch (e) { setError(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    setLoading(true);
    reload();
    const ch = supabase.channel('live-' + ++channelSeq);
    tables.forEach((t) => ch.on('postgres_changes', { event: '*', schema: 'public', table: t }, () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(reload, 300);
    }));
    ch.subscribe();
    return () => { if (timer.current) clearTimeout(timer.current); supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tables.join(','), ...deps]);

  return { data, error, loading, reload };
}

/** Throws the Supabase error so useLive can catch it. */
export function must<T>(res: { data: T | null; error: any }): T {
  if (res.error) throw res.error;
  return res.data as T;
}

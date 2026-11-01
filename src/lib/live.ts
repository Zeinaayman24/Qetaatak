import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, AppStateStatus, Platform } from 'react-native';
import { supabase } from './supabase';

let channelSeq = 0;
/** Last result per screen query, so coming back to a screen shows it instantly while it refreshes. */
const cache = new Map<string, unknown>();
export const clearLiveCache = () => cache.clear();

/**
 * Runs `fetcher`, then re-runs it whenever any of `tables` changes (Supabase Realtime).
 * Row level security still applies, so each person only receives what they may see.
 *
 * Phones drop the live connection when the screen sleeps or the app goes to the background,
 * so the data is also refreshed when the screen comes back, when the connection is restored,
 * and (when `pollMs` is given) every few seconds while the screen is visible.
 */
export function useLive<T>(fetcher: () => Promise<T>, tables: string[], deps: unknown[] = [], opts: { pollMs?: number } = {}) {
  // the cache key: the fetcher's code + its inputs (same screen, same ids)
  const key = fetcher.toString().length + ':' + fetcher.toString().slice(0, 400) + '|' + JSON.stringify(deps);
  const keyRef = useRef(key);
  keyRef.current = key;
  const [data, setData] = useState<T | null>(() => (cache.get(key) as T) ?? null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(!cache.has(key));
  const fetchRef = useRef(fetcher);
  fetchRef.current = fetcher;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reload = useCallback(async () => {
    try { const k = keyRef.current; const v = await fetchRef.current(); cache.set(k, v); if (k === keyRef.current) setData(v); setError(null); }
    catch (e) { setError(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const hit = cache.get(keyRef.current) as T | undefined;
    setData(hit ?? null);
    setLoading(hit === undefined);
    reload();
    const soon = () => { if (timer.current) clearTimeout(timer.current); timer.current = setTimeout(reload, 300); };
    const ch = supabase.channel('live-' + ++channelSeq);
    tables.forEach((t) => ch.on('postgres_changes', { event: '*', schema: 'public', table: t }, soon));
    // when the live connection (re)joins after a drop, catch up on anything missed while it was down
    let joined = false;
    ch.subscribe((status) => { if (status === 'SUBSCRIBED') { if (joined) soon(); joined = true; } });

    const visible = () => Platform.OS !== 'web' || typeof document === 'undefined' || document.visibilityState === 'visible';
    const onAppState = (st: AppStateStatus) => { if (st === 'active') soon(); };
    const appSub = AppState.addEventListener('change', onAppState);
    const onVisible = () => { if (visible()) soon(); };
    const web = Platform.OS === 'web' && typeof window !== 'undefined';
    if (web) { document.addEventListener('visibilitychange', onVisible); window.addEventListener('online', onVisible); window.addEventListener('focus', onVisible); }
    const poll = opts.pollMs ? setInterval(() => { if (visible()) reload(); }, opts.pollMs) : null;

    return () => {
      if (timer.current) clearTimeout(timer.current);
      if (poll) clearInterval(poll);
      appSub.remove();
      if (web) { document.removeEventListener('visibilitychange', onVisible); window.removeEventListener('online', onVisible); window.removeEventListener('focus', onVisible); }
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tables.join(','), opts.pollMs ?? 0, ...deps]);

  return { data, error, loading, reload };
}

/** Throws the Supabase error so useLive can catch it. */
export function must<T>(res: { data: T | null; error: any }): T {
  if (res.error) throw res.error;
  return res.data as T;
}

/** Re-renders every `ms` so stopwatches tick. */
export function useNow(ms = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { if (ms <= 0) return; const t = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(t); }, [ms]); // 0 = no ticking
  return now;
}

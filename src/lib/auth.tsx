import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { supabase } from './supabase';
import type { Profile, Shop, ShopPrivate } from './data';

type AuthState = {
  ready: boolean;
  session: Session | null;
  profile: Profile | null;
  shop: Shop | null;
  shopPrivate: ShopPrivate | null;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
};

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [shop, setShop] = useState<Shop | null>(null);
  const [shopPrivate, setShopPrivate] = useState<ShopPrivate | null>(null);

  const load = useCallback(async (s: Session | null) => {
    if (!s) { setProfile(null); setShop(null); setShopPrivate(null); return; }
    const uid = s.user.id;
    const [p, sh, sp] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', uid).maybeSingle(),
      supabase.from('shops').select('*').eq('id', uid).maybeSingle(),
      supabase.from('shop_private').select('*').eq('id', uid).maybeSingle(),
    ]);
    setProfile((p.data as Profile) ?? null);
    setShop((sh.data as Shop) ?? null);
    setShopPrivate((sp.data as ShopPrivate) ?? null);
  }, []);

  useEffect(() => {
    let alive = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!alive) return;
      setSession(data.session);
      await load(data.session);
      if (alive) setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') {
        // defer: never await Supabase calls inside this callback
        setTimeout(() => { load(s); }, 0);
      }
    });
    return () => { alive = false; sub.subscription.unsubscribe(); };
  }, [load]);

  // shop status changes (approval) arrive live
  useEffect(() => {
    const uid = session?.user.id;
    if (!uid) return;
    const ch = supabase.channel('me-' + uid)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shops', filter: 'id=eq.' + uid }, () => load(session))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [session, load]);

  const value: AuthState = {
    ready, session, profile, shop, shopPrivate,
    refresh: () => load(session),
    signOut: async () => { await supabase.auth.signOut(); },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth outside AuthProvider');
  return v;
}

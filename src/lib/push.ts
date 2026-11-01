import { Platform } from 'react-native';
import { supabase } from '@/lib/supabase';

/** Web push (Product Register A23). Native push comes with the store apps. */
export const VAPID_PUBLIC_KEY = 'BJNvEh_FMarZzG81wKnlxPPHGd3UPAO_QV_ZvLznWBCkPWtYRXFOx0y06AJOL6C9zSozNFo7H0bTwr9c5S1eX_Y';

const b64ToBytes = (b64: string) => {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

export type PushState = 'unsupported' | 'denied' | 'off' | 'on';

export async function pushState(): Promise<PushState> {
  if (Platform.OS !== 'web' || typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  return sub && Notification.permission === 'granted' ? 'on' : 'off';
}

/** Asks the browser for permission (must run from a tap) and saves this device. */
export async function enablePush(): Promise<PushState> {
  if ((await pushState()) === 'unsupported') return 'unsupported';
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return perm === 'denied' ? 'denied' : 'off';
  const reg = (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.ready);
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(VAPID_PUBLIC_KEY) }));
  const j = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return 'off';
  await supabase.from('push_subscriptions').upsert({ user_id: u.user.id, endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth, user_agent: navigator.userAgent.slice(0, 200) }, { onConflict: 'endpoint' });
  return 'on';
}

/** Re-saves the subscription on app start (keys rotate; a new login on the same phone). */
export async function syncPush() {
  try { if ((await pushState()) === 'on') await enablePush(); } catch { /* ignore */ }
}

const ASKED = 'daghta-push-asked';
export const pushAsked = () => { try { return localStorage.getItem(ASKED) === '1'; } catch { return false; } };
export const markPushAsked = () => { try { localStorage.setItem(ASKED, '1'); } catch { /* ignore */ } };

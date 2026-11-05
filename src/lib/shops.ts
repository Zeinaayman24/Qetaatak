import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { WEEKDAYS, ar, type ShopHours } from './data';
import { isEn, t } from './i18n';
import { supabase } from './supabase';

/** One row of shops_near(): everything the directory and a shop's public page show. */
export type NearShop = {
  id: string; name: string; area: string; governorate: string; address: string; phone: string; phone2: string;
  lat: number | null; lng: number | null; km: number | null; photo_path: string | null; photos: string[]; about: string;
  hours: ShopHours | null; sells: boolean; installs: boolean; offers_delivery: boolean; brands: string[]; specialties: string[];
  shop_type: 'used' | 'new' | 'both'; rating: number | null; ratings: number; sales: number; featured: boolean; services: string[]; since: string;
  /** false for a hidden shop (change 1.35): alias instead of the name, no phone, photos or exact place */
  visible?: boolean;
};

export type LatLng = { lat: number; lng: number };
/** Cairo, used to centre the map before we know where the customer is. */
export const CAIRO: LatLng = { lat: 30.0444, lng: 31.2357 };
export const inEgypt = (p: LatLng) => p.lat >= 21 && p.lat <= 32.5 && p.lng >= 24 && p.lng <= 37.5;

/** "٣٫٢ كم" — straight-line distance, so it is always called approximate. */
export function kmLabel(km: number | null | undefined) {
  if (km == null) return '';
  if (km < 1) return t('{0} متر تقريبًا', ar(Math.max(50, Math.round(km * 20) * 50)));
  const v = km < 10 ? (Math.round(km * 10) / 10).toString() : String(Math.round(km));
  return t('{0} كم تقريبًا', isEn() ? v : ar(v).replace('.', '٫'));
}

/** Open right now? Uses the device clock (the app is for Egypt, so it is Cairo time). Null when the shop gave no hours. */
export function openNow(h: ShopHours | null | undefined, now = new Date()): boolean | null {
  if (!h?.open || !h?.close) return null;
  const mins = (s: string) => { const [a, b] = s.split(':').map(Number); return a * 60 + (b || 0); };
  const o = mins(h.open), c = mins(h.close), n = now.getHours() * 60 + now.getMinutes();
  const day = now.getDay();
  if (c > o) return !(h.off ?? []).includes(day) && n >= o && n < c;
  // closes after midnight: the late part belongs to yesterday's opening
  if (n >= o) return !(h.off ?? []).includes(day);
  return n < c && !(h.off ?? []).includes((day + 6) % 7);
}

export const hourLabel = (hh: string) => {
  const n = parseInt(hh, 10);
  if (isEn()) return n === 0 || n === 24 ? '12 am' : n === 12 ? '12 pm' : n < 12 ? `${n} am` : `${n - 12} pm`;
  return n === 24 || n === 0 ? '١٢ بالليل' : n === 12 ? '١٢ الضهر' : n < 12 ? `${ar(n)} الصبح` : `${ar(n - 12)} ${n < 17 ? 'العصر' : 'بالليل'}`;
};

const EN_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
/** A weekday name (0 = Sunday). */
export const dayName = (d: number) => (isEn() ? EN_DAYS[d] : WEEKDAYS[d]);

/** What the shop does, as one short label. */
export function serviceKind(s: Pick<NearShop, 'sells' | 'installs'>) {
  if (s.sells && s.installs) return t('بيع وتركيب');
  if (s.installs) return t('تركيب بس');
  return t('بيع قطع');
}

/** Opens directions in the phone's maps app (Google Maps on the web). */
export const directionsUrl = (lat: number, lng: number) =>
  Platform.OS === 'ios' ? `http://maps.apple.com/?daddr=${lat},${lng}` : `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;

export type InstallService = { id: string; name_ar: string; name_en: string; category: string; sort: number; active: boolean };
export const serviceName = (s: Pick<InstallService, 'name_ar' | 'name_en'> | undefined | null) => (!s ? '' : isEn() && s.name_en ? s.name_en : s.name_ar);

let svcCache: InstallService[] | null = null;
/** The installation services catalogue (managed by the admin). */
export function useInstallServices(all = false) {
  const [list, setList] = useState<InstallService[]>(svcCache ?? []);
  useEffect(() => {
    let live = true;
    supabase.from('install_services').select('*').order('sort').then(({ data }) => {
      if (!live || !data) return;
      svcCache = data as InstallService[];
      setList(svcCache);
    });
    return () => { live = false; };
  }, []);
  return all ? list : list.filter((s) => s.active);
}

/**
 * Finds a place in Egypt by name with OpenStreetMap's free search (Nominatim).
 * Their rules: at most one search a second and no search-as-you-type, so we only search when the person presses search.
 */
export async function searchPlace(q: string): Promise<{ label: string; lat: number; lng: number }[]> {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=6&countrycodes=eg&accept-language=${isEn() ? 'en' : 'ar'}&q=${encodeURIComponent(q.trim())}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error('search failed');
  const rows = (await res.json()) as { display_name: string; lat: string; lon: string }[];
  return rows.map((r) => ({ label: r.display_name.split(',').slice(0, 3).join('،'), lat: Number(r.lat), lng: Number(r.lon) }));
}

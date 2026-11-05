import type { LatLng } from '@/lib/shops';

export type Pin = { id: string; lat: number; lng: number; title: string };

/**
 * Phone builds don't carry a map library yet, so the directory shows the list only there
 * (each shop still has a «الاتجاهات» button that opens the phone's maps app). The web app shows the OpenStreetMap map.
 */
export function ShopMap(_: {
  center: LatLng; zoom?: number; me?: LatLng | null; pins?: Pin[]; selected?: string | null;
  onPin?: (id: string) => void; onTap?: (p: LatLng) => void; height?: number; fit?: boolean;
}) {
  return null;
}

export const MAP_AVAILABLE = false;

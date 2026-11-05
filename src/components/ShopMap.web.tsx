import L from 'leaflet';
// @ts-ignore: a stylesheet, bundled by Metro on the web
import 'leaflet/dist/leaflet.css';
import { useEffect, useRef } from 'react';
import { t } from '@/lib/i18n';
import type { LatLng } from '@/lib/shops';
import { colors } from '@/lib/theme';

export type Pin = { id: string; lat: number; lng: number; title: string };

const pinIcon = (on: boolean) => L.divIcon({
  className: '',
  iconSize: on ? [40, 40] : [30, 30],
  iconAnchor: on ? [20, 40] : [15, 30],
  html: `<div style="width:100%;height:100%;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:${on ? colors.ink : colors.primary};
    border:3px solid #fff;box-shadow:0 2px 6px rgba(4,29,63,.35);display:flex;align-items:center;justify-content:center">
    <div style="width:${on ? 12 : 9}px;height:${on ? 12 : 9}px;border-radius:50%;background:#fff"></div></div>`,
});
const meIcon = L.divIcon({
  className: '', iconSize: [20, 20], iconAnchor: [10, 10],
  html: `<div style="width:20px;height:20px;border-radius:50%;background:${colors.sky};border:3px solid #fff;box-shadow:0 0 0 6px rgba(10,171,254,.25)"></div>`,
});

/**
 * An OpenStreetMap map (Leaflet) with the shops as pins and the customer as a blue dot.
 * `onTap` lets the person pick a spot by tapping the map (used to set "my location" or a shop's pin).
 */
export function ShopMap({ center, zoom = 13, me, pins = [], selected, onPin, onTap, height = 360, fit }: {
  center: LatLng; zoom?: number; me?: LatLng | null; pins?: Pin[]; selected?: string | null;
  onPin?: (id: string) => void; onTap?: (p: LatLng) => void; height?: number; fit?: boolean;
}) {
  const box = useRef<HTMLDivElement | null>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const tapRef = useRef(onTap); tapRef.current = onTap;
  const pinRef = useRef(onPin); pinRef.current = onPin;

  useEffect(() => {
    if (!box.current || map.current) return;
    const m = L.map(box.current, { center: [center.lat, center.lng], zoom, zoomControl: true, attributionControl: true });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
    }).addTo(m);
    m.on('click', (e: L.LeafletMouseEvent) => tapRef.current?.({ lat: e.latlng.lat, lng: e.latlng.lng }));
    m.attributionControl.setPrefix('<a href="https://leafletjs.com" target="_blank" rel="noopener">Leaflet</a>');
    layer.current = L.layerGroup().addTo(m);
    map.current = m;
    // the map box can get its real size after the first paint
    setTimeout(() => m.invalidateSize(), 50);
    return () => { m.remove(); map.current = null; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { map.current?.setView([center.lat, center.lng], map.current.getZoom() < zoom ? zoom : map.current.getZoom()); }, [center.lat, center.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const m = map.current, g = layer.current;
    if (!m || !g) return;
    g.clearLayers();
    if (me) L.marker([me.lat, me.lng], { icon: meIcon, keyboard: false, title: t('مكانك') }).addTo(g);
    pins.forEach((p) => {
      const mk = L.marker([p.lat, p.lng], { icon: pinIcon(p.id === selected), title: p.title, zIndexOffset: p.id === selected ? 1000 : 0 });
      mk.on('click', () => pinRef.current?.(p.id));
      mk.addTo(g);
    });
    if (fit && pins.length) {
      const pts: [number, number][] = pins.map((p) => [p.lat, p.lng]);
      if (me) pts.push([me.lat, me.lng]);
      m.fitBounds(L.latLngBounds(pts), { padding: [36, 36], maxZoom: 15 });
    }
  }, [pins, me?.lat, me?.lng, selected, fit]); // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={box} style={{ height, width: '100%', borderRadius: 16, overflow: 'hidden', border: `1px solid ${colors.line}`, zIndex: 0, position: 'relative' }} />;
}

export const MAP_AVAILABLE = true;

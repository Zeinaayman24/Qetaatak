import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import { isEn, t } from '@/lib/i18n';

/** Car catalogue: makes and models managed from the management app (migration 42). */
export type Powertrain = 'petrol' | 'diesel' | 'hev' | 'phev' | 'erev' | 'ev';
export type Make = {
  id: string; name_ar: string; name_en: string; country: string; logo_url: string;
  home_rank: number | null; powertrains: Powertrain[]; active: boolean;
};
export type Model = {
  id: string; make_id: string; name_ar: string; name_en: string;
  year_from: number | null; year_to: number | null; powertrains: Powertrain[]; sort: number; active: boolean;
};

export const POWERTRAINS: { v: Powertrain; label: string; short: string }[] = [
  { v: 'petrol', label: t('بنزين'), short: t('بنزين') },
  { v: 'diesel', label: t('ديزل'), short: t('ديزل') },
  { v: 'hev', label: t('هايبرد'), short: t('هايبرد') },
  { v: 'phev', label: t('هايبرد بالشحن (Plug-in)'), short: 'Plug-in' },
  { v: 'erev', label: t('كهربا بمدى ممتد (EREV)'), short: 'EREV' },
  { v: 'ev', label: t('كهربا بالكامل'), short: t('كهربا') },
];
export const ptLabel = (p?: string | null) => POWERTRAINS.find((x) => x.v === p)?.label ?? '';
export const ptShort = (p?: string | null) => POWERTRAINS.find((x) => x.v === p)?.short ?? '';
/** Electric or partly electric: these cars get the EV part groups. */
export const isElectrified = (p?: string | null) => p === 'ev' || p === 'phev' || p === 'erev' || p === 'hev';

// one fetch per app session; the catalogue changes rarely
let makesCache: Make[] | null = null;
let makesWait: Promise<Make[]> | null = null;
const modelsCache = new Map<string, Model[]>();

export function loadMakes(): Promise<Make[]> {
  if (makesCache) return Promise.resolve(makesCache);
  makesWait ??= (async () => {
    const { data, error } = await supabase.from('car_makes').select('*').eq('active', true).order('name_ar');
    makesWait = null;
    if (error) throw error;
    makesCache = (data ?? []) as Make[];
    return makesCache;
  })();
  return makesWait;
}

export async function loadModels(makeId: string): Promise<Model[]> {
  const hit = modelsCache.get(makeId);
  if (hit) return hit;
  const { data, error } = await supabase.from('car_models').select('*').eq('make_id', makeId).eq('active', true).order('sort').order('name_ar');
  if (error) throw error;
  const list = (data ?? []) as Model[];
  modelsCache.set(makeId, list);
  return list;
}

export function useMakes() {
  const [makes, setMakes] = useState<Make[] | null>(makesCache);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    loadMakes().then((m) => live && setMakes(m)).catch(() => live && setFailed(true));
    return () => { live = false; };
  }, []);
  return { makes, failed };
}

/** The makes shown on the home screen, in the order set by the management app. */
export const homeMakes = (makes: Make[]) =>
  makes.filter((m) => m.home_rank != null).sort((a, b) => (a.home_rank ?? 99) - (b.home_rank ?? 99));

export const makeByName = (makes: Make[] | null, name?: string | null) =>
  (makes ?? []).find((m) => m.name_ar === name || m.name_en.toLowerCase() === (name ?? '').toLowerCase()) ?? null;

/** Arabic search that ignores hamza/ta-marbuta/ya differences and case. */
export const norm = (s: string) =>
  s.toLowerCase().replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/[ـ\s\-]+/g, '')
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
export const matches = (q: string, ...names: string[]) => {
  const n = norm(q);
  return !n || names.some((x) => norm(x).includes(n));
};

/** Years a model was made, newest first; with no range set, every year back to 1980. */
export function modelYears(m?: Model | null): number[] {
  const now = new Date().getFullYear() + 1;
  const to = Math.min(m?.year_to ?? now, now);
  const from = Math.max(m?.year_from ?? 1980, 1960);
  const out: number[] = [];
  for (let y = to; y >= from; y--) out.push(y);
  return out;
}

/** A make or model name in the reader's language (English names from the catalogue). */
export const makeName = (m: Pick<Make, 'name_ar' | 'name_en'>) => (isEn() && m.name_en ? m.name_en : m.name_ar);
export const modelName = (m: Pick<Model, 'name_ar' | 'name_en'>) => (isEn() && m.name_en ? m.name_en : m.name_ar);
/** "هيونداي فيرنا ٢٠١٤" or "Hyundai Verna 2014" from the Arabic names stored on a car or request. */
export function carLabel(make?: string | null, model?: string | null, year?: string | number | null) {
  const yr = year ? (isEn() ? String(year) : String(year).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[Number(d)])) : '';
  if (!isEn()) return [make, model, yr].filter(Boolean).join(' ');
  const mk = (makesCache ?? []).find((m) => m.name_ar === make);
  const md = mk ? (modelsCache.get(mk.id) ?? []).find((m) => m.name_ar === model) : undefined;
  return [mk?.name_en ?? make, md?.name_en || model, yr].filter(Boolean).join(' ');
}

/** Load the models of these makes (by Arabic name) so carLabel can show English model names. */
export function usePreloadModels(makeNames: (string | null | undefined)[]) {
  const { makes } = useMakes();
  const [, bump] = useState(0);
  const key = makeNames.filter(Boolean).join('|');
  useEffect(() => {
    if (!isEn() || !makes) return;
    const ids = [...new Set(makeNames.map((n) => makes.find((m) => m.name_ar === n)?.id).filter(Boolean) as string[])].filter((id) => !modelsCache.has(id));
    if (ids.length) Promise.all(ids.map((id) => loadModels(id).catch(() => []))).then(() => bump((x) => x + 1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, makes]);
}

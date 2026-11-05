import * as Location from 'expo-location';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Image, Linking, Platform, View } from 'react-native';
import { MAP_AVAILABLE, ShopMap } from '@/components/ShopMap';
import { ShopCard } from '@/components/ShopCard';
import { BackBar, Btn, Chips, Empty, Field, Icon, Loading, Muted, Pill, Press, Row, Screen, Seg, Select, Sheet, T, toast } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { ar } from '@/lib/data';
import { t } from '@/lib/i18n';
import { must, useLive } from '@/lib/live';
import {
  CAIRO, directionsUrl, inEgypt, kmLabel, openNow, searchPlace, serviceKind, serviceName, useInstallServices,
  type LatLng, type NearShop,
} from '@/lib/shops';
import { photoUrl, supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';

const LOC_KEY = 'daghta-near-loc';
const DISTANCES: { v: number; label: string }[] = [
  { v: 5, label: t('٥ كم') }, { v: 10, label: t('١٠ كم') }, { v: 20, label: t('٢٠ كم') }, { v: 50, label: t('٥٠ كم') }, { v: 0, label: t('الكل') },
];
type Kind = 'all' | 'sell' | 'both' | 'install';
type Sort = 'near' | 'rating';

/** Remembered "my location" (web only), so coming back to the directory doesn't ask again. */
function savedLoc(): (LatLng & { label: string }) | null {
  try {
    if (Platform.OS !== 'web') return null;
    const v = JSON.parse(localStorage.getItem(LOC_KEY) || 'null');
    return v && typeof v.lat === 'number' && typeof v.lng === 'number' ? v : null;
  } catch { return null; }
}
function saveLoc(v: LatLng & { label: string }) {
  try { if (Platform.OS === 'web') localStorage.setItem(LOC_KEY, JSON.stringify(v)); } catch { /* storage blocked */ }
}

/** «محلات قريبة منك»: every approved shop on a map and in a list, nearest first, with filters. */
export default function ShopsNear() {
  const { ready, session } = useAuth();
  const params = useLocalSearchParams<{ install?: string; service?: string }>();
  const services = useInstallServices();
  const [loc, setLoc] = useState<(LatLng & { label: string }) | null>(savedLoc);
  const [view, setView] = useState<'list' | 'map'>(MAP_AVAILABLE ? 'map' : 'list');
  const [km, setKm] = useState(loc ? 20 : 0);
  const [kind, setKind] = useState<Kind>(params.install ? 'install' : 'all');
  const [sort, setSort] = useState<Sort>('near');
  const [openOnly, setOpenOnly] = useState(false);
  const [delivery, setDelivery] = useState(false);
  const [brand, setBrand] = useState('');
  const [service, setService] = useState(params.service ?? '');
  const [selected, setSelected] = useState<string | null>(null);
  const [locSheet, setLocSheet] = useState(false);
  const [picking, setPicking] = useState(false);
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<{ label: string; lat: number; lng: number }[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const { data, loading } = useLive(async () =>
    must(await supabase.rpc('shops_near', { p_lat: loc?.lat ?? null, p_lng: loc?.lng ?? null })) as NearShop[],
  ['shops'], [loc?.lat, loc?.lng]);

  const all = data ?? [];
  const brands = useMemo(() => [...new Set(all.flatMap((s) => s.brands))].sort((a, b) => a.localeCompare(b, 'ar')), [all]);
  const list = useMemo(() => {
    const now = new Date();
    const out = all.filter((s) => {
      if (loc && km && (s.km == null || s.km > km)) return false;
      if (kind === 'sell' && !(s.sells && !s.installs)) return false;
      if (kind === 'both' && !(s.sells && s.installs)) return false;
      if (kind === 'install' && !s.installs) return false;
      if (openOnly && openNow(s.hours, now) !== true) return false;
      if (delivery && !s.offers_delivery) return false;
      if (brand && !s.brands.includes(brand)) return false;
      if (service && !(s.installs && (s.services.length === 0 || s.services.includes(service) || s.services.includes('other')))) return false;
      return true;
    });
    if (sort === 'rating') out.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0) || b.ratings - a.ratings);
    return out;
  }, [all, loc, km, kind, openOnly, delivery, brand, service, sort]);

  if (ready && !session) return <Redirect href="/login" />;
  const back = () => (router.canGoBack() ? router.back() : router.replace('/customer'));

  function use(p: LatLng, label: string) {
    if (!inEgypt(p)) { toast(t('المكان ده بره مصر.')); return; }
    const v = { ...p, label };
    setLoc(v); saveLoc(v); setLocSheet(false); setPicking(false); setHits(null); setQ('');
    if (!km) setKm(20);
  }

  async function here() {
    setBusy('here');
    try {
      const p = await Location.requestForegroundPermissionsAsync();
      if (p.status !== 'granted') { toast(t('اسمح للتطبيق يعرف مكانك، أو اكتب منطقتك.')); setBusy(null); return; }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      use({ lat: pos.coords.latitude, lng: pos.coords.longitude }, t('مكاني الحالي'));
    } catch { toast(t('ماقدرناش نعرف مكانك. اكتب منطقتك بدل كده.')); }
    setBusy(null);
  }

  async function find() {
    if (q.trim().length < 2) return;
    setBusy('find');
    try {
      const r = await searchPlace(q);
      setHits(r);
    } catch { toast(t('البحث مش شغال دلوقتي. جرّب تاني بعد شوية.')); }
    setBusy(null);
  }

  const pins = list.filter((s) => s.lat != null && s.lng != null).map((s) => ({ id: s.id, lat: s.lat!, lng: s.lng!, title: s.name }));
  const noPin = list.length - pins.length;
  const sel = list.find((s) => s.id === selected) ?? null;

  return (
    <Screen>
      <BackBar title={t('محلات قريبة منك')} onBack={back} />

      {/* where the customer is */}
      <Press onPress={() => setLocSheet(true)} label={t('غيّر مكانك')}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line }}>
        <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="location" size={20} color={colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Muted size={12}>{t('بندوّر حوالين')}</Muted>
          <T w="semibold" size={15} numberOfLines={1}>{loc ? loc.label : t('حدّد مكانك عشان نرتّب المحلات بالأقرب')}</T>
        </View>
        <T size={14} w="medium" color={colors.primary}>{loc ? t('غيّر') : t('حدّد')}</T>
      </Press>

      {loc ? (
        <View style={{ gap: 6 }}>
          <Chips options={DISTANCES} selected={[km]} onPick={setKm} />
          <Muted size={12}>{t('المسافة خط مستقيم، والطريق الفعلي ممكن يبقى أطول.')}</Muted>
        </View>
      ) : null}

      <Seg<Kind> value={kind} onPick={setKind} options={[
        { v: 'all', label: t('الكل') }, { v: 'sell', label: t('بيع بس') }, { v: 'both', label: t('بيع وتركيب') }, { v: 'install', label: t('تركيب') },
      ]} />
      <Chips<string> selected={[openOnly ? 'open' : '', delivery ? 'delivery' : '', sort === 'rating' ? 'rating' : ''].filter(Boolean)}
        onPick={(v) => { if (v === 'open') setOpenOnly(!openOnly); if (v === 'delivery') setDelivery(!delivery); if (v === 'rating') setSort(sort === 'rating' ? 'near' : 'rating'); }}
        options={[
          { v: 'open', label: t('مفتوح دلوقتي'), icon: 'time-outline' },
          { v: 'rating', label: t('الأعلى تقييم'), icon: 'star-outline' },
          { v: 'delivery', label: t('بيوصّل'), icon: 'bicycle-outline' },
        ]} />
      <Row gap={10}>
        <Select label={t('الماركة')} value={brand} onPick={setBrand} options={[{ v: '', label: t('كل الماركات') }, ...brands.map((b) => ({ v: b, label: b }))]} />
        {kind === 'install' || kind === 'both' || service ? (
          <Select label={t('خدمة التركيب')} value={service} onPick={setService}
            options={[{ v: '', label: t('أي خدمة') }, ...services.map((s) => ({ v: s.id, label: serviceName(s) }))]} />
        ) : null}
      </Row>

      <Row style={{ justifyContent: 'space-between' }}>
        <T w="bold" size={16}>{loading && !data ? t('بندوّر…') : list.length ? t('{0} محل', ar(list.length)) : t('مفيش محلات')}</T>
        {MAP_AVAILABLE ? (
          <View style={{ width: 170 }}>
            <Seg value={view} onPick={setView} options={[{ v: 'map', label: t('خريطة') }, { v: 'list', label: t('قائمة') }]} />
          </View>
        ) : null}
      </Row>

      {loading && !data ? <Loading /> : null}

      {view === 'map' && MAP_AVAILABLE && data ? (
        <View style={{ gap: 10 }}>
          <ShopMap center={loc ?? CAIRO} zoom={loc ? 13 : 11} me={loc} pins={pins} selected={selected} onPin={setSelected} fit={!selected} height={380} />
          {noPin > 0 ? <Muted size={12}>{t('{0} محل لسه ماحددش مكانه على الخريطة، هتلاقيه في القائمة.', ar(noPin))}</Muted> : null}
          {sel ? <ShopCard s={sel} services={services} /> : pins.length ? <Muted size={13} center>{t('دوس على أي محل على الخريطة عشان تشوف تفاصيله.')}</Muted> : null}
        </View>
      ) : null}

      {view === 'list' && data ? (
        list.length ? <View style={{ gap: 12 }}>{list.map((s) => <ShopCard key={s.id} s={s} services={services} />)}</View>
          : <Empty icon="storefront-outline" text={loc && km ? t('مفيش محلات في المسافة دي. جرّب مسافة أكبر أو شيل فلتر.') : t('مفيش محلات بالفلاتر دي.')}
            action={loc && km && km < 50 ? { label: t('وسّع المسافة'), onPress: () => setKm(km < 10 ? 10 : km < 20 ? 20 : 50) } : undefined} />
      ) : null}
      {view === 'map' && data && !list.length ? <Empty icon="storefront-outline" text={t('مفيش محلات بالفلاتر دي.')} /> : null}

      <Sheet open={locSheet} onClose={() => { setLocSheet(false); setPicking(false); }} title={t('مكانك فين؟')}>
        <View style={{ gap: 12 }}>
          <Btn icon="locate" title={t('استخدم مكاني الحالي')} loading={busy === 'here'} onPress={here} />
          <Row gap={8} style={{ alignItems: 'flex-end' }}>
            <View style={{ flex: 1 }}><Field value={q} onChangeText={setQ} placeholder={t('اكتب المنطقة، مثلاً مدينة نصر')} icon="search" /></View>
            <Btn kind="secondary" title={t('دوّر')} loading={busy === 'find'} disabled={q.trim().length < 2} onPress={find} style={{ minWidth: 80 }} />
          </Row>
          {hits ? (hits.length ? hits.map((h, i) => (
            <Press key={i} onPress={() => use(h, h.label)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderColor: colors.line }}>
              <Icon name="location-outline" size={18} color={colors.muted} /><T size={14} style={{ flex: 1 }} numberOfLines={2}>{h.label}</T>
            </Press>
          )) : <Muted>{t('مالقيناش المكان ده. جرّب اسم منطقة أو شارع مشهور.')}</Muted>) : null}
          {MAP_AVAILABLE ? (picking ? (
            <View style={{ gap: 6 }}>
              <Muted size={13}>{t('دوس على مكانك على الخريطة.')}</Muted>
              <ShopMap center={loc ?? CAIRO} zoom={loc ? 14 : 11} me={loc} height={280} onTap={(p) => use(p, t('مكان على الخريطة'))} />
            </View>
          ) : <Btn kind="link" title={t('حدّد على الخريطة')} onPress={() => setPicking(true)} />) : null}
          <Muted size={12}>{t('بحث الأماكن والخرايط من OpenStreetMap.')}</Muted>
        </View>
      </Sheet>
    </Screen>
  );
}

import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, I18nManager, Image, Linking, Platform, View } from 'react-native';
import { Icon, Press, T } from '@/components/ui';
import { must, useLive } from '@/lib/live';
import { photoUrl, supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';
import { t } from '@/lib/i18n';

export type Ad = {
  id: string; title: string; subtitle: string; image_path: string | null; link: string; advertiser: string;
  active: boolean; starts_at: string; ends_at: string | null; sort: number; views: number; clicks: number;
};

const EVERY_MS = 5000;     // time each ad stays on screen
const PAUSE_MS = 9000;     // after the customer swipes or taps a dot, wait longer before moving on
const PEEK = 18;           // how much of the next and previous card shows at the sides
const GAP = 10;            // space between cards
const RATIO = 500 / 1200;  // ad pictures are uploaded at 1200×500

// each ad is counted once per app session, however often the home screen re-renders
const seen = new Set<string>();

// The app reads right to left, so the next card sits to the left (dir = -1), like turning a page in an Arabic book.
const rtl = Platform.OS === 'web' ? (typeof document !== 'undefined' && document.documentElement.dir !== 'ltr') : I18nManager.isRTL;
const DIR = rtl ? -1 : 1;

/**
 * Paid ads on the customer home (car-care centres, oil brands, tyre shops…), managed from the management system.
 * Large picture cards that slide on their own every few seconds; the customer can drag them or tap the dots.
 * Each card keeps a small «إعلان» label so an ad is never mistaken for the customer's own orders.
 */
export function AdBanner() {
  const { data } = useLive(async () => must(await supabase.from('ads').select('*').order('sort').order('created_at', { ascending: false }).limit(8)) as Ad[], ['ads']);
  return <AdCarousel ads={data ?? []} />;
}

/** The cards themselves, given the ads to show. */
export function AdCarousel({ ads }: { ads: Ad[] }) {
  const n = ads.length;
  const [width, setWidth] = useState(0);
  const [at, setAt] = useState(0);              // grows without limit; the ad shown is at % n
  const pos = useRef(new Animated.Value(0)).current;
  const pausedUntil = useRef(0);
  const touchX = useRef<number | null>(null);
  const moved = useRef(false);
  const i = n ? ((at % n) + n) % n : 0;

  const cardW = n > 1 ? Math.max(0, width - 2 * (PEEK + GAP)) : width;
  const step = cardW + GAP;
  const left0 = n > 1 ? PEEK + GAP : 0;
  const imgH = Math.round(cardW * RATIO);

  // count a view the first time each ad is actually shown
  useEffect(() => {
    const a = ads[i];
    if (a && !seen.has(a.id)) { seen.add(a.id); supabase.rpc('ad_event', { p_ad: a.id, p_click: false }).then(() => {}); }
  }, [i, ads.map((a) => a.id).join()]);

  const go = (next: number, byHand = false) => {
    if (n < 2) return;
    if (byHand) pausedUntil.current = Date.now() + PAUSE_MS;
    setAt(next);
    Animated.timing(pos, { toValue: next, duration: 380, easing: Easing.out(Easing.cubic), useNativeDriver: Platform.OS !== 'web' }).start();
  };

  useEffect(() => {
    if (n < 2) return;
    const timer = setInterval(() => { if (Date.now() >= pausedUntil.current) go(at + 1); }, EVERY_MS);
    return () => clearInterval(timer);
  }, [n, at]);

  if (!n) return null;

  const open = (a: Ad) => {
    if (moved.current) return; // that touch was a drag, not a tap
    supabase.rpc('ad_event', { p_ad: a.id, p_click: true }).then(() => {});
    if (!a.link) return;
    if (a.link.startsWith('/')) router.push(a.link as never); else Linking.openURL(a.link);
  };

  // place each ad at the copy nearest to the one in front, so the carousel loops without rewinding
  const slot = (j: number) => (n < 2 ? 0 : j + n * Math.round((at - j) / n));

  return (
    <View style={{ gap: 12 }}>
      <View
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        onTouchStart={(e) => { touchX.current = e.nativeEvent.pageX; moved.current = false; }}
        onTouchMove={(e) => {
          if (touchX.current == null || n < 2) return;
          const dx = e.nativeEvent.pageX - touchX.current;
          if (Math.abs(dx) > 10) moved.current = true;
          if (moved.current) pos.setValue(at - (DIR * dx) / step);   // the card follows the finger
        }}
        onTouchEnd={(e) => {
          const from = touchX.current; touchX.current = null;
          if (from == null || n < 2) return;
          const dx = e.nativeEvent.pageX - from;
          if (Math.abs(dx) > 40) go(at + (DIR * dx < 0 ? 1 : -1), true);
          else go(at, true);   // not far enough: settle back
        }}
        style={{ height: width ? imgH + 92 : 0, overflow: 'hidden', direction: 'ltr' } as never}>
        {width ? ads.map((a, j) => {
          const s = slot(j);
          const x = pos.interpolate({ inputRange: [s - 1, s, s + 1], outputRange: [left0 + DIR * step, left0, left0 - DIR * step], extrapolate: 'extend' });
          const img = photoUrl(a.image_path);
          return (
            <Animated.View key={a.id} style={{ position: 'absolute', top: 0, left: 0, width: cardW, transform: [{ translateX: x }] }}>
              <Press onPress={() => open(a)} label={a.title || t('إعلان')}
                style={{ backgroundColor: colors.surface, borderRadius: 20, borderWidth: 1, borderColor: colors.line, padding: 6, direction: rtl ? 'rtl' : 'ltr' } as never}>
                <View style={{ height: imgH, borderRadius: 15, overflow: 'hidden', backgroundColor: colors.primarySoft }}>
                  {img
                    ? <Image source={{ uri: img }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                    : <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><Icon name="megaphone-outline" size={34} color={colors.primary} /></View>}
                  {/* always labelled, so an ad is never mistaken for an offer */}
                  <View style={{ position: 'absolute', top: 8, end: 8, backgroundColor: 'rgba(255,255,255,0.92)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 1 }}>
                    <T size={11.5} w="semibold" color={colors.muted}>{t('إعلان')}</T>
                  </View>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 10, paddingTop: 10, paddingBottom: 8, minHeight: 74 }}>
                  <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
                    <T w="bold" size={18} color={colors.primary} numberOfLines={1}>{a.title || a.advertiser}</T>
                    {a.subtitle ? <T w="medium" size={14.5} numberOfLines={1}>{a.subtitle}</T>
                      : a.title && a.advertiser ? <T size={13.5} color={colors.muted} numberOfLines={1}>{a.advertiser}</T> : null}
                  </View>
                  {a.link ? (
                    <View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
                      <Icon name={rtl ? 'chevron-back' : 'chevron-forward'} size={22} color={colors.primary} />
                    </View>
                  ) : null}
                </View>
              </Press>
            </Animated.View>
          );
        }) : null}
      </View>

      {n > 1 ? (
        <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6 }}>
          {ads.map((a, j) => (
            <Press key={a.id} onPress={() => go(at + shortest(j - i, n), true)}
              label={`${t('إعلان')} ${j + 1}`} hitSlop={8} dim={false}
              style={{ width: j === i ? 28 : 16, height: 4, borderRadius: 2, backgroundColor: j === i ? colors.ink : '#D5DAE1' }}>
              <View />
            </Press>
          ))}
        </View>
      ) : null}
    </View>
  );
}

// the shortest way round the loop from one ad to another (so tapping a dot never spins past every ad)
const shortest = (d: number, n: number) => { const m = ((d % n) + n) % n; return m > n / 2 ? m - n : m; };

/** Featured shops (paid visibility): show a badge until featured_until. */
export const isFeatured = (s?: { featured_until?: string | null } | null) => !!s?.featured_until && new Date(s.featured_until) > new Date();

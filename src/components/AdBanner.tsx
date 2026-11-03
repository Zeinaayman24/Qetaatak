import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Animated, Image, Linking, View } from 'react-native';
import { Icon, Press, Row, T } from '@/components/ui';
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

// each ad is counted once per app session, however often the home screen re-renders
const seen = new Set<string>();

/**
 * Paid banners on the customer home (car-care centres, oil brands, tyre shops…), managed from the management system.
 * One ad at a time: it moves to the next one on its own every few seconds, and the customer can swipe or tap the dots.
 */
export function AdBanner() {
  const { data } = useLive(async () => must(await supabase.from('ads').select('*').order('sort').order('created_at', { ascending: false }).limit(8)) as Ad[], ['ads']);
  const ads = data ?? [];
  const [at, setAt] = useState(0);
  const fade = useRef(new Animated.Value(1)).current;
  const pausedUntil = useRef(0);
  const touchX = useRef<number | null>(null);
  const moved = useRef(false);
  const n = ads.length;
  const i = n ? at % n : 0;

  // count a view the first time each ad is actually shown
  useEffect(() => {
    const a = ads[i];
    if (a && !seen.has(a.id)) { seen.add(a.id); supabase.rpc('ad_event', { p_ad: a.id, p_click: false }).then(() => {}); }
  }, [i, ads.map((a) => a.id).join()]);

  const go = (next: number, byHand = false) => {
    if (n < 2) return;
    if (byHand) pausedUntil.current = Date.now() + PAUSE_MS;
    Animated.timing(fade, { toValue: 0, duration: 160, useNativeDriver: true }).start(() => {
      setAt(((next % n) + n) % n);
      Animated.timing(fade, { toValue: 1, duration: 260, useNativeDriver: true }).start();
    });
  };

  useEffect(() => {
    if (n < 2) return;
    const t = setInterval(() => { if (Date.now() >= pausedUntil.current) go(i + 1); }, EVERY_MS);
    return () => clearInterval(t);
  }, [n, i]);

  if (!n) return null;
  const a = ads[i];
  const img = photoUrl(a.image_path);
  const open = () => {
    if (moved.current) return; // that touch was a swipe, not a tap
    supabase.rpc('ad_event', { p_ad: a.id, p_click: true }).then(() => {});
    if (!a.link) return;
    if (a.link.startsWith('/')) router.push(a.link as never); else Linking.openURL(a.link);
  };

  return (
    <View
      onTouchStart={(e) => { touchX.current = e.nativeEvent.pageX; moved.current = false; }}
      onTouchMove={(e) => { if (touchX.current != null && Math.abs(e.nativeEvent.pageX - touchX.current) > 10) moved.current = true; }}
      onTouchEnd={(e) => {
        const from = touchX.current; touchX.current = null;
        if (from == null) return;
        const dx = e.nativeEvent.pageX - from;
        // right-to-left app: swiping right brings the next ad, like turning a page
        if (Math.abs(dx) > 40) go(dx > 0 ? i + 1 : i - 1, true);
      }}
      style={{ borderRadius: 16, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, overflow: 'hidden' }}>
      <Animated.View style={{ opacity: fade }}>
        {/* one quiet row: the ad is clearly labelled and never louder than the customer's own orders */}
        <Press onPress={open} label={a.title || t('إعلان')} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, minHeight: 72 }}>
          {img ? <Image source={{ uri: img }} style={{ width: 52, height: 52, borderRadius: 12, backgroundColor: colors.soft }} resizeMode="cover" /> : null}
          <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
            <Row gap={6}>
              <View style={{ borderWidth: 1, borderColor: '#D5DAE1', borderRadius: 6, paddingHorizontal: 6 }}>
                <T size={11} w="semibold" color={colors.muted} style={{ lineHeight: 17 }}>{t('إعلان')}</T>
              </View>
              {a.advertiser ? <T size={12.5} color={colors.muted} numberOfLines={1} style={{ flexShrink: 1 }}>{a.advertiser}</T> : null}
            </Row>
            {a.title ? <T w="semibold" size={14.5} numberOfLines={1}>{a.title}</T> : null}
            {a.subtitle ? <T size={12.5} color={colors.muted} numberOfLines={1}>{a.subtitle}</T> : null}
          </View>
          {a.link ? <Icon name="chevron-back" size={16} color={colors.faint} /> : null}
        </Press>
      </Animated.View>
    </View>
  );
}

/** Featured shops (paid visibility): show a badge until featured_until. */
export const isFeatured = (s?: { featured_until?: string | null } | null) => !!s?.featured_until && new Date(s.featured_until) > new Date();

import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Animated, Image, Linking, View } from 'react-native';
import { Icon, Press, Row, T } from '@/components/ui';
import { must, useLive } from '@/lib/live';
import { photoUrl, supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';

export type Ad = {
  id: string; title: string; subtitle: string; image_path: string | null; link: string; advertiser: string;
  active: boolean; starts_at: string; ends_at: string | null; sort: number; views: number; clicks: number;
};

const EVERY_MS = 5000;     // time each ad stays on screen
const PAUSE_MS = 9000;     // after the customer swipes or taps a dot, wait longer before moving on
const HEIGHT = 156;

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
    <View style={{ gap: 10 }}>
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
        style={{ height: HEIGHT, borderRadius: 20, overflow: 'hidden', backgroundColor: colors.ink }}>
        <Animated.View style={{ flex: 1, opacity: fade }}>
          <Press onPress={open} label={a.title || 'إعلان'} style={{ flex: 1 }}>
            {img ? (
              <Image source={{ uri: img }} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100%' }} resizeMode="cover" />
            ) : (
              <>
                <LinearGradient colors={[colors.ink, '#0A3A75', colors.primary]} start={{ x: 1, y: 0 }} end={{ x: 0, y: 1 }}
                  style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
                <View style={{ position: 'absolute', left: -30, bottom: -40, width: 170, height: 170, borderRadius: 85, backgroundColor: 'rgba(255,255,255,.07)' }} />
                <View style={{ position: 'absolute', left: 28, top: 34, width: 76, height: 76, borderRadius: 22, backgroundColor: 'rgba(255,255,255,.12)', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="megaphone" size={34} color="#fff" />
                </View>
              </>
            )}
            {/* dark wash behind the text side (right, in Arabic) so it stays readable on any photo */}
            {img ? (
              <LinearGradient colors={['rgba(4,29,63,.92)', 'rgba(4,29,63,.70)', 'rgba(4,29,63,.05)']} locations={[0, 0.55, 1]} start={{ x: 1, y: 0.5 }} end={{ x: 0, y: 0.5 }}
                style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
            ) : null}

            <View style={{ flex: 1, paddingHorizontal: 18, paddingVertical: 14, justifyContent: 'space-between', maxWidth: '72%' }}>
              <Row gap={6}>
                <View style={{ backgroundColor: colors.lime, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 1 }}>
                  <T size={10.5} w="bold" color={colors.ink} style={{ lineHeight: 16 }}>إعلان</T>
                </View>
                {a.advertiser ? <T size={12} w="semibold" color="rgba(255,255,255,.85)" numberOfLines={1} style={{ flexShrink: 1 }}>{a.advertiser}</T> : null}
              </Row>
              <View style={{ gap: 3 }}>
                {a.title ? <T w="bold" size={19} color="#fff" numberOfLines={2} style={{ lineHeight: 27 }}>{a.title}</T> : null}
                {a.subtitle ? <T size={13} color="rgba(255,255,255,.88)" numberOfLines={2} style={{ lineHeight: 19 }}>{a.subtitle}</T> : null}
              </View>
              {a.link ? (
                <Row gap={4} style={{ alignSelf: 'flex-start', backgroundColor: '#fff', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5 }}>
                  <T size={12.5} w="bold" color={colors.ink} style={{ lineHeight: 17 }}>اعرف أكتر</T>
                  <Icon name="chevron-back" size={13} color={colors.ink} stroke={2.4} />
                </Row>
              ) : <View />}
            </View>
          </Press>
        </Animated.View>
      </View>

      {n > 1 ? (
        <Row gap={6} style={{ justifyContent: 'center' }}>
          {ads.map((x, k) => (
            <Press key={x.id} onPress={() => go(k, true)} label={`إعلان ${k + 1}`} style={{ paddingVertical: 4 }}>
              <View style={{ width: k === i ? 18 : 7, height: 7, borderRadius: 4, backgroundColor: k === i ? colors.primary : colors.line }} />
            </Press>
          ))}
        </Row>
      ) : null}
    </View>
  );
}

/** Featured shops (paid visibility): show a badge until featured_until. */
export const isFeatured = (s?: { featured_until?: string | null } | null) => !!s?.featured_until && new Date(s.featured_until) > new Date();

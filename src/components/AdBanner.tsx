import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Image, Linking, NativeScrollEvent, NativeSyntheticEvent, ScrollView, View } from 'react-native';
import { Icon, Press, Row, T } from '@/components/ui';
import { must, useLive } from '@/lib/live';
import { photoUrl, supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';

export type Ad = {
  id: string; title: string; subtitle: string; image_path: string | null; link: string; advertiser: string;
  active: boolean; starts_at: string; ends_at: string | null; sort: number; views: number; clicks: number;
};

// each ad is counted once per app session, however often the home screen re-renders
const seen = new Set<string>();

/** Paid banners on the customer home (car-care centres, oil brands, tyre shops…). Managed from the management system. */
export function AdBanner() {
  const { data } = useLive(async () => must(await supabase.from('ads').select('*').order('sort').order('created_at', { ascending: false }).limit(8)) as Ad[], ['ads']);
  const ads = data ?? [];
  const [w, setW] = useState(0);
  const [at, setAt] = useState(0);

  useEffect(() => {
    ads.forEach((a) => { if (!seen.has(a.id)) { seen.add(a.id); supabase.rpc('ad_event', { p_ad: a.id, p_click: false }).then(() => {}); } });
  }, [ads.map((a) => a.id).join()]);

  if (!ads.length) return null;
  const open = (a: Ad) => {
    supabase.rpc('ad_event', { p_ad: a.id, p_click: true }).then(() => {});
    if (!a.link) return;
    if (a.link.startsWith('/')) router.push(a.link as never); else Linking.openURL(a.link);
  };
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => { if (w) setAt(Math.round(Math.abs(e.nativeEvent.contentOffset.x) / (w + 12))); };

  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)} style={{ gap: 8 }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} snapToInterval={w + 12} decelerationRate="fast" onScroll={onScroll} scrollEventThrottle={32}
        contentContainerStyle={{ gap: 12 }}>
        {ads.map((a) => {
          const img = photoUrl(a.image_path);
          return (
            <Press key={a.id} onPress={() => open(a)} label={a.title || 'إعلان'}
              style={{ width: w || 320, height: 132, borderRadius: 18, overflow: 'hidden', backgroundColor: colors.ink }}>
              {img ? <Image source={{ uri: img }} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' } as never} resizeMode="cover" /> : null}
              <View style={{ position: 'absolute', inset: 0, backgroundColor: img ? 'rgba(4,29,63,.45)' : 'transparent' } as never} />
              <View style={{ flex: 1, padding: 16, justifyContent: 'space-between' }}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <View style={{ backgroundColor: 'rgba(255,255,255,.18)', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 }}>
                    <T size={10.5} w="semibold" color="#fff">إعلان{a.advertiser ? '، ' + a.advertiser : ''}</T>
                  </View>
                </Row>
                <View style={{ gap: 2 }}>
                  {a.title ? <T w="bold" size={18} color="#fff" numberOfLines={1}>{a.title}</T> : null}
                  {a.subtitle ? <T size={13} color="rgba(255,255,255,.85)" numberOfLines={2}>{a.subtitle}</T> : null}
                  {a.link ? <Row gap={4} style={{ marginTop: 4 }}><T size={12.5} w="semibold" color={colors.lime}>اعرف أكتر</T><Icon name="chevron-back" size={13} color={colors.lime} /></Row> : null}
                </View>
              </View>
            </Press>
          );
        })}
      </ScrollView>
      {ads.length > 1 ? (
        <Row gap={5} style={{ justifyContent: 'center' }}>
          {ads.map((a, i) => <View key={a.id} style={{ width: i === at ? 16 : 6, height: 6, borderRadius: 3, backgroundColor: i === at ? colors.primary : colors.line }} />)}
        </Row>
      ) : null}
    </View>
  );
}

/** Featured shops (paid visibility): show a badge until featured_until. */
export const isFeatured = (s?: { featured_until?: string | null } | null) => !!s?.featured_until && new Date(s.featured_until) > new Date();

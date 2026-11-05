import { router } from 'expo-router';
import { Image, Linking, View } from 'react-native';
import { Btn, Icon, Muted, Pill, Press, Row, T } from './ui';
import { ar } from '@/lib/data';
import { t } from '@/lib/i18n';
import { directionsUrl, kmLabel, openNow, serviceKind, serviceName, type NearShop } from '@/lib/shops';
import { photoUrl } from '@/lib/supabase';
import { colors } from '@/lib/theme';

/** One shop in the directory: photo, name, distance, rating, open now, what it does, and call / directions / page. */
export function ShopCard({ s, services }: { s: NearShop; services: { id: string; name_ar: string; name_en: string }[] }) {
  const open = openNow(s.hours);
  const svc = s.installs ? s.services.map((id) => services.find((x) => x.id === id)).filter(Boolean).slice(0, 3) : [];
  return (
    <View style={{ backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.line, padding: 14, gap: 12 }}>
      <Press onPress={() => router.push(`/shop-profile/${s.id}`)} label={s.name} role="link" style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
        <View style={{ width: 60, height: 60, borderRadius: 14, backgroundColor: colors.soft, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
          {s.photo_path ? <Image source={{ uri: photoUrl(s.photo_path)! }} style={{ width: 60, height: 60 }} accessibilityLabel={t('صورة المحل')} />
            : <Icon name="storefront" size={26} color={colors.muted} />}
        </View>
        <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
          <Row gap={6}>
            <T w="bold" size={16} numberOfLines={1} style={{ flexShrink: 1 }}>{s.name}</T>
            <Icon name="shield-checkmark" size={15} color={colors.good} />
          </Row>
          <Muted size={13} numberOfLines={1}>{[s.area, kmLabel(s.km)].filter(Boolean).join(' · ')}</Muted>
          <Row gap={8} style={{ flexWrap: 'wrap' }}>
            {s.rating ? <Row gap={3}><Icon name="star" size={13} color={colors.accent} /><T size={13} w="semibold">{ar(s.rating)}</T><Muted size={12}>({ar(s.ratings)})</Muted></Row>
              : <Muted size={12}>{t('لسه مفيش تقييم')}</Muted>}
            {open === true ? <T size={12.5} w="semibold" color={colors.good}>{t('مفتوح دلوقتي')}</T>
              : open === false ? <T size={12.5} w="semibold" color={colors.bad}>{t('مقفول دلوقتي')}</T> : null}
          </Row>
        </View>
      </Press>
      <Row gap={6} style={{ flexWrap: 'wrap' }}>
        <Pill label={serviceKind(s)} tone={s.installs ? 'new' : 'plain'} icon={s.installs ? 'construct-outline' : 'pricetag-outline'} />
        {s.offers_delivery ? <Pill label={t('بيوصّل')} /> : null}
        {s.featured ? <Pill label={t('محل مميز')} icon="star" tone="wait" /> : null}
        {svc.map((x) => <Pill key={x!.id} label={serviceName(x)} />)}
      </Row>
      <Row gap={8}>
        {s.phone ? <Btn kind="secondary" icon="call-outline" title={t('اتصل')} onPress={() => Linking.openURL(`tel:${s.phone}`)} style={{ flex: 1 }} /> : null}
        {s.visible !== false && s.lat != null && s.lng != null ? <Btn kind="secondary" icon="navigate-outline" title={t('الاتجاهات')} onPress={() => Linking.openURL(directionsUrl(s.lat!, s.lng!))} style={{ flex: 1 }} /> : null}
        <Btn kind="secondary" title={t('صفحة المحل')} onPress={() => router.push(`/shop-profile/${s.id}`)} style={{ flex: 1 }} />
      </Row>
    </View>
  );
}

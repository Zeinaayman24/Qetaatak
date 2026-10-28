import { Redirect, router } from 'expo-router';
import { Pressable, View } from 'react-native';
import { BottomNav } from '@/components/AppHeader';
import { Icon, Loading, Muted, Pill, Row, Screen, T } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { SHOP_TYPES, addressLine, ar } from '@/lib/data';
import { colors } from '@/lib/theme';

function Item({ icon, title, sub, onPress, danger }: { icon: string; title: string; sub?: string; onPress: () => void; danger?: boolean }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14 }, pressed && { opacity: 0.6 }]}>
      <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: danger ? '#FCEDED' : colors.card, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={icon} size={20} color={danger ? colors.bad : colors.ink} />
      </View>
      <View style={{ flex: 1 }}>
        <T w="semibold" color={danger ? colors.bad : colors.ink}>{title}</T>
        {sub ? <Muted size={12.5} numberOfLines={1}>{sub}</Muted> : null}
      </View>
      {!danger ? <Icon name="chevron-back" size={16} color={colors.faint} /> : null}
    </Pressable>
  );
}

const Line = () => <View style={{ height: 1, backgroundColor: colors.line }} />;
const Group = ({ children }: { children: React.ReactNode }) => (
  <View style={{ backgroundColor: colors.ground, borderWidth: 1, borderColor: colors.line, borderRadius: 18, paddingHorizontal: 14 }}>{children}</View>
);

export default function Account() {
  const { ready, session, profile, shop, shopPrivate, signOut } = useAuth();
  if (ready && !session) return <Redirect href="/login" />;
  if (!profile) return <Screen><Loading /></Screen>;
  const isShop = profile.is_shop;

  return (
    <Screen nav={<BottomNav role={isShop ? 'shop' : 'customer'} />}>
      <Row gap={14}>
        <View style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={isShop ? 'storefront' : 'person'} size={26} color="#fff" />
        </View>
        <View style={{ flex: 1 }}>
          <T w="bold" size={20}>{isShop ? shopPrivate?.name : profile.full_name}</T>
          <Muted size={13} style={{ writingDirection: 'ltr', textAlign: 'right' }}>{session?.user.email}</Muted>
        </View>
      </Row>

      {isShop ? (
        <Group>
          <Item icon="storefront-outline" title="بيانات المحل" sub={shop ? `${shop.area}، ${shop.governorate} · ${SHOP_TYPES[shop.shop_type]}` : ''} onPress={() => router.push('/shop-setup')} />
          {shop ? (
            <Row style={{ paddingBottom: 14 }} gap={8}>
              <Pill label={shop.status === 'approved' ? 'المحل شغال' : shop.status === 'pending' ? 'تحت المراجعة' : 'موقوف'} tone={shop.status === 'approved' ? 'good' : shop.status === 'pending' ? 'wait' : 'plain'} />
              <Pill label={shop.offers_delivery ? 'بيوصّل' : 'استلام من المحل'} />
            </Row>
          ) : null}
          {shop?.status === 'approved' ? (<><Line /><Item icon="star-outline" title="صفحة المحل والتقييمات" sub="زي ما العملاء بيشوفوها" onPress={() => router.push(`/shop-profile/${shop.id}`)} /></>) : null}
        </Group>
      ) : (
        <Group>
          <Item icon="person-outline" title="بياناتي وعنواني" sub={addressLine(profile)} onPress={() => router.push('/profile')} />
          <Line />
          <Item icon="car-sport-outline" title="عربياتي" sub={`${profile.car_make ?? ''} ${profile.car_model ?? ''} ${ar(profile.car_year ?? '')}`} onPress={() => router.push('/cars')} />
          <Line />
          <Item icon="heart-outline" title="المحلات المفضلة" onPress={() => router.push('/favorites')} />
        </Group>
      )}

      <Group>
        <Item icon="notifications-outline" title="الإشعارات" onPress={() => router.push('/notifications')} />
        <Line />
        <Item icon="chatbubbles-outline" title="المساعد" sub="اشتكي أو اسأل، وهو يوصّلك لخدمة العملاء" onPress={() => router.push('/assistant')} />
        <Line />
        <Item icon="help-circle-outline" title="شكاويّا" sub="تابع شكاويك وردود خدمة العملاء" onPress={() => router.push('/support')} />
        {profile.is_admin ? (<><Line /><Item icon="shield-checkmark-outline" title="لوحة الإدارة" sub="المحلات، الطلبات، الشكاوى" onPress={() => router.push('/admin')} /></>) : null}
      </Group>

      <Group>
        <Item icon="log-out-outline" title="تسجيل خروج" onPress={signOut} danger />
      </Group>
      <Muted center size={12}>قطعتك · نسخة تجريبية</Muted>
    </Screen>
  );
}

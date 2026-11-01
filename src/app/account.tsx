import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { ConfirmSheet } from '@/components/Confirm';
import { BottomNav } from '@/components/AppHeader';
import { Icon, Loading, Muted, Pill, Row, Screen, T, toast } from '@/components/ui';
import { InstallCard } from '@/components/InstallCard';
import { useAuth } from '@/lib/auth';
import { SHOP_TYPES, addressLine, ar, friendlyError } from '@/lib/data';
import { supabase } from '@/lib/supabase';
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

const APP_VERSION = '1.0.0';

export default function Account() {
  const { ready, session, profile, shop, shopPrivate, signOut } = useAuth();
  if (ready && !session) return <Redirect href="/login" />;
  if (!profile) return <Screen><Loading /></Screen>;
  const isShop = profile.is_shop;
  if (isShop) return <ShopAccount />;

  return (
    <Screen nav={<BottomNav role={isShop ? 'shop' : 'customer'} />}>
      <Row gap={14}>
        <View style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={isShop ? 'storefront' : 'person'} size={26} color="#fff" />
        </View>
        <View style={{ flex: 1 }}>
          <T w="bold" size={20}>{isShop ? shopPrivate?.name : profile.full_name}</T>
          <Muted size={13} style={{ writingDirection: 'ltr', textAlign: 'right' }}>{profile.phone || session?.user.email}</Muted>
        </View>
      </Row>

      {isShop ? (
        <Group>
          <Item icon="storefront-outline" title="بيانات المحل" sub={shop ? `${shop.area}، ${shop.governorate}، ${SHOP_TYPES[shop.shop_type]}` : ''} onPress={() => router.push('/shop-setup')} />
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
        {!isShop ? (<><Line /><Item icon="lock-closed-outline" title="الخصوصية" onPress={() => router.push('/privacy')} /></>) : null}
      </Group>

      <Group>
        <Item icon="chatbubbles-outline" title="المساعد" onPress={() => router.push('/assistant')} />
        <Line />
        <Item icon="help-circle-outline" title="الدعم" onPress={() => router.push('/support')} />
      </Group>

      <Group>
        <Item icon="document-text-outline" title="الشروط والأحكام" onPress={() => router.push('/legal/terms')} />
        <Line />
        <Item icon="shield-outline" title="سياسة الخصوصية" onPress={() => router.push('/legal/privacy')} />
        <Line />
        <Item icon="receipt-outline" title="سياسة الإلغاء" onPress={() => router.push('/legal/cancellation')} />
      </Group>

      <Group>
        <Item icon="log-out-outline" title="تسجيل خروج" onPress={signOut} danger />
      </Group>
      <InstallCard />
      <Muted center size={12}>ضغطة · نسخة {APP_VERSION}</Muted>
    </Screen>
  );
}

/** The shop's account page (Product Register B22). The team section comes with mobile sign-in (Phase 5). */
function ShopAccount() {
  const { session, profile, shop, shopPrivate, signOut } = useAuth();
  const [closing, setClosing] = useState<null | { blocked: boolean }>(null);
  const [busy, setBusy] = useState(false);
  if (!profile) return null;
  const setup = (step: number) => router.push({ pathname: '/shop-setup', params: { step: String(step) } });
  async function askClose() {
    const { data } = await supabase.rpc('shop_closure_blockers');
    const b = (data ?? {}) as { open_orders?: number; refunds?: number; owed?: number };
    setClosing({ blocked: !!(Number(b.open_orders) || Number(b.refunds) || Number(b.owed)) });
  }
  async function close() {
    setBusy(true);
    const { error } = await supabase.rpc('close_shop_account', { p_reason: '' });
    setBusy(false);
    if (error) return toast(friendlyError(error));
    setClosing(null); await signOut();
  }
  const status = shop?.status === 'approved' ? 'المحل شغال' : shop?.status === 'suspended' || shop?.status === 'closed' ? 'موقوف' : 'تحت المراجعة';
  return (
    <Screen nav={<BottomNav role="shop" />}>
      <Row gap={14}>
        <View style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="storefront" size={26} color="#fff" />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <T w="bold" size={20}>{shopPrivate?.name}</T>
          <Muted size={13}><T size={13} color={colors.muted} style={{ writingDirection: 'ltr' }}>{profile.phone || session?.user.email}</T> · صاحب المحل</Muted>
        </View>
      </Row>
      <Row gap={8}>
        <Pill label={status} tone={shop?.status === 'approved' ? 'good' : shop?.status === 'suspended' || shop?.status === 'closed' ? 'bad' : 'wait'} />
        {shop ? <Pill label={`${shop.area}، ${shop.governorate} · ${SHOP_TYPES[shop.shop_type]}`} /> : null}
      </Row>

      <Group>
        <Item icon="storefront-outline" title="بيانات المحل" onPress={() => setup(0)} />
        <Line />
        <Item icon="time-outline" title="مواعيد العمل" onPress={() => setup(1)} />
        <Line />
        <Item icon="bicycle-outline" title="التوصيل وأسعاره" onPress={() => setup(2)} />
        <Line />
        <Item icon="wallet-outline" title="استلام الفلوس بالتحويل" onPress={() => setup(3)} />
        {shop?.status === 'approved' ? (<><Line /><Item icon="eye-outline" title="صفحة المحل زي ما العملاء بيشوفوها" onPress={() => router.push(`/shop-profile/${shop.id}`)} /></>) : null}
      </Group>

      {shop && shop.status !== 'draft' && shop.status !== 'pending' ? (
        <Group>
          <Item icon="pulse-outline" title="أداء محلك" onPress={() => router.push('/shop/performance')} />
          <Line />
          <Item icon="receipt-outline" title="حسابك مع ضغطة" onPress={() => router.push('/shop/balance')} />
        </Group>
      ) : null}

      <Group>
        <Item icon="notifications-outline" title="الإشعارات" onPress={() => router.push('/notifications')} />
        <Line />
        <Item icon="help-circle-outline" title="الدعم" onPress={() => router.push('/support')} />
        <Line />
        <Item icon="document-text-outline" title="اتفاقية التاجر" onPress={() => router.push('/legal/merchant')} />
        <Line />
        <Item icon="document-outline" title="الشروط والأحكام" onPress={() => router.push('/legal/terms')} />
        <Line />
        <Item icon="shield-outline" title="سياسة الخصوصية" onPress={() => router.push('/legal/privacy')} />
      </Group>

      <Group>
        <Item icon="log-out-outline" title="تسجيل خروج" onPress={signOut} danger />
      </Group>
      <InstallCard />
      <Muted center size={12}>ضغطة · نسخة {APP_VERSION}</Muted>
      {shop && shop.status !== 'closed' ? (
        <Pressable onPress={askClose} accessibilityRole="button" style={{ alignSelf: 'center', padding: 8 }}>
          <T size={13} w="semibold" color={colors.bad}>قفل حساب المحل</T>
        </Pressable>
      ) : null}
      <ConfirmSheet open={!!closing} title="قفل حساب المحل" body="لازم تكمّل الأوردرات الشغالة، وترجّع أي فلوس لعملاء، وتسدّد العمولة الأول."
        yes="قفل حساب المحل" danger busy={busy} onYes={() => (closing?.blocked ? toast('لسه فيه أوردرات أو فلوس مستحقة.') : close())} onClose={() => setClosing(null)} />
    </Screen>
  );
}

import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { Image, Pressable, View } from 'react-native';
import { ConfirmSheet } from '@/components/Confirm';
import { BottomNav } from '@/components/AppHeader';
import { Icon, Loading, Muted, Pill, Row, Screen, T, toast } from '@/components/ui';
import { InstallCard } from '@/components/InstallCard';
import { useAuth } from '@/lib/auth';
import { SHOP_TYPES, addressLine, ar, friendlyError } from '@/lib/data';
import { photoUrl, supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';
import { t, dir, isEn, setLang, startAlign } from '@/lib/i18n';

function Item({ icon, title, sub, onPress, danger }: { icon: string; title: string; sub?: string; onPress: () => void; danger?: boolean }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 56, paddingVertical: 10, paddingHorizontal: 16 }, pressed && { backgroundColor: colors.soft }]}>
      <Icon name={icon} size={22} color={danger ? colors.bad : colors.ink} />
      <View style={{ flex: 1, gap: 1 }}>
        <T w="medium" size={15} color={danger ? colors.bad : colors.ink}>{title}</T>
        {sub ? <Muted size={13} numberOfLines={1}>{sub}</Muted> : null}
      </View>
      {!danger ? <Icon name="chevron-back" size={16} color={colors.faint} /> : null}
    </Pressable>
  );
}

const Line = () => <View style={{ height: 1, backgroundColor: colors.line, marginStart: 52 }} />;
const Group = ({ children }: { children: React.ReactNode }) => (
  <View style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 16, overflow: 'hidden' }}>{children}</View>
);

const APP_VERSION = '1.0.0';

export default function Account() {
  const { ready, session, profile, signOut } = useAuth();
  if (ready && !session) return <Redirect href="/login" />;
  if (!profile) return <Screen><Loading /></Screen>;
  const isShop = profile.is_shop;
  if (isShop) return <ShopAccount />;

  const first = (profile.full_name || '').trim();
  const car = [profile.car_make, profile.car_model, profile.car_year ? ar(profile.car_year) : ''].filter(Boolean).join(' ');
  return (
    <Screen nav={<BottomNav role="customer" />}>
      <Row gap={14} style={{ alignItems: 'center' }}>
        <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' }}>
          {first ? <T w="bold" size={22} color="#fff">{first.charAt(0)}</T> : <Icon name="person" size={24} color="#fff" />}
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <T w="bold" size={20}>{first || t('حسابي')}</T>
          <Muted size={14} style={{ writingDirection: 'ltr', textAlign: startAlign() }}>{profile.phone || session?.user.email}</Muted>
        </View>
        <Pressable onPress={() => router.push('/profile')} accessibilityRole="button" hitSlop={8} style={{ padding: 8 }}>
          <T w="medium" size={14} color={colors.primary}>{t('عدّل')}</T>
        </Pressable>
      </Row>

      <Group>
        <Item icon="car-sport-outline" title={t('عربياتي')} sub={car} onPress={() => router.push('/cars')} />
        <Line />
        <Item icon="location-outline" title={t('بياناتي وعنواني')} sub={addressLine(profile)} onPress={() => router.push('/profile')} />
        <Line />
        <Item icon="heart-outline" title={t('المحلات المفضلة')} onPress={() => router.push('/favorites')} />
        <Line /><Item icon="map-outline" title={t('محلات قريبة منك')} onPress={() => router.push('/shops')} />
      </Group>

      <Group>
        <Item icon="notifications-outline" title={t('الإشعارات')} onPress={() => router.push('/notifications')} />
        <Line />
        <Item icon="chatbubbles-outline" title={t('المساعد')} onPress={() => router.push('/assistant')} />
        <Line />
        <Item icon="help-circle-outline" title={t('الدعم')} onPress={() => router.push('/support')} />
      </Group>

      <Group>
        <Item icon="language-outline" title={isEn() ? 'اللغة: العربية' : 'Language: English'} sub={t('اللغة دلوقتي: العربية')} onPress={() => setLang(isEn() ? 'ar' : 'en')} />
        <Line />
        <Item icon="shield-outline" title={t('الخصوصية والشروط')} sub={t('الشروط، الخصوصية، الإلغاء، بياناتك')} onPress={() => router.push('/privacy')} />
      </Group>

      <InstallCard />
      <Pressable onPress={signOut} accessibilityRole="button" style={({ pressed }) => [{ minHeight: 52, borderRadius: 14, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }, pressed && { opacity: 0.7 }]}>
        <T w="medium" size={15} color={colors.bad}>{t('تسجيل خروج')}</T>
      </Pressable>
      <Muted center size={12}>{t('ضغطة · نسخة')}{' '}{APP_VERSION}</Muted>
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
  const status = shop?.status === 'approved' ? t('المحل شغال') : shop?.status === 'suspended' || shop?.status === 'closed' ? t('موقوف') : t('تحت المراجعة');
  return (
    <Screen nav={<BottomNav role="shop" />}>
      <Row gap={14}>
        <Pressable onPress={() => setup(0)} accessibilityRole="button" accessibilityLabel={t('صورة المحل')}
          style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
          {shop?.photo_path ? <Image source={{ uri: photoUrl(shop.photo_path)! }} style={{ width: 60, height: 60 }} /> : <Icon name="storefront" size={26} color="#fff" />}
        </Pressable>
        <View style={{ flex: 1, gap: 2 }}>
          <T w="bold" size={20}>{shopPrivate?.name}</T>
          <Muted size={13}><T size={13} color={colors.muted} style={{ writingDirection: 'ltr' }}>{profile.phone || session?.user.email}</T> {t('· صاحب المحل')}</Muted>
        </View>
      </Row>
      <Row gap={8}>
        <Pill label={status} tone={shop?.status === 'approved' ? 'good' : shop?.status === 'suspended' || shop?.status === 'closed' ? 'bad' : 'wait'} />
        {shop ? <Pill label={t('{0}، {1} · {2}', shop.area, shop.governorate, SHOP_TYPES[shop.shop_type])} /> : null}
      </Row>

      <Group>
        <Item icon="storefront-outline" title={t('بيانات المحل')} onPress={() => setup(0)} />
        <Line />
        <Item icon="time-outline" title={t('مواعيد العمل')} onPress={() => setup(1)} />
        <Line />
        <Item icon="bicycle-outline" title={t('التوصيل وأسعاره')} onPress={() => setup(2)} />
        <Line />
        <Item icon="wallet-outline" title={t('استلام الفلوس بالتحويل')} onPress={() => setup(3)} />
        {shop ? (<><Line /><Item icon="construct-outline" title={t('خدمات التركيب وأسعارها')} onPress={() => router.push('/shop/services')} /></>) : null}
        {shop?.status === 'approved' ? (<><Line /><Item icon="eye-outline" title={t('صفحة المحل زي ما العملاء بيشوفوها')} onPress={() => router.push(`/shop-profile/${shop.id}`)} /></>) : null}
      </Group>

      {shop && shop.status !== 'draft' && shop.status !== 'pending' ? (
        <Group>
          <Item icon="pulse-outline" title={t('أداء محلك')} onPress={() => router.push('/shop/performance')} />
          <Line />
          <Item icon="receipt-outline" title={t('حسابك مع ضغطة')} onPress={() => router.push('/shop/balance')} />
        </Group>
      ) : null}

      <Group>
        <Item icon="notifications-outline" title={t('الإشعارات')} onPress={() => router.push('/notifications')} />
        <Line />
        <Item icon="help-circle-outline" title={t('الدعم')} onPress={() => router.push('/support')} />
        <Line />
        <Item icon="document-text-outline" title={t('اتفاقية التاجر')} onPress={() => router.push('/legal/merchant')} />
        <Line />
        <Item icon="document-outline" title={t('الشروط والأحكام')} onPress={() => router.push('/legal/terms')} />
        <Line />
        <Item icon="shield-outline" title={t('سياسة الخصوصية')} onPress={() => router.push('/legal/privacy')} />
      </Group>

      <Group>
        <Item icon="log-out-outline" title={t('تسجيل خروج')} onPress={signOut} danger />
      </Group>
      <InstallCard />
      <Muted center size={12}>{t('ضغطة · نسخة')}{' '}{APP_VERSION}</Muted>
      {shop && shop.status !== 'closed' ? (
        <Pressable onPress={askClose} accessibilityRole="button" style={{ alignSelf: 'center', padding: 8 }}>
          <T size={13} w="semibold" color={colors.bad}>{t('قفل حساب المحل')}</T>
        </Pressable>
      ) : null}
      <ConfirmSheet open={!!closing} title={t('قفل حساب المحل')} body={t('لازم تكمّل الأوردرات الشغالة، وترجّع أي فلوس لعملاء، وتسدّد العمولة الأول.')}
        yes={t('قفل حساب المحل')} danger busy={busy} onYes={() => (closing?.blocked ? toast(t('لسه فيه أوردرات أو فلوس مستحقة.')) : close())} onClose={() => setClosing(null)} />
    </Screen>
  );
}

import { Redirect, router } from 'expo-router';
import { View } from 'react-native';
import { AppHeader } from '@/components/AppHeader';
import { Icon, Muted, Press, Row, Screen, T, Title } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { colors, lift } from '@/lib/theme';

export default function Welcome() {
  const { session, ready, signOut } = useAuth();
  if (ready && !session) return <Redirect href="/login" />;
  const option = (icon: string, title: string, sub: string, href: '/profile' | '/shop-setup', dark: boolean) => (
    <Press onPress={() => router.push(href)}
      style={[{ backgroundColor: dark ? colors.ink : colors.surface, borderRadius: 18, padding: 22, gap: 18 }, lift]}>
      <Row style={{ justifyContent: 'space-between' }}>
        <View style={{ width: 60, height: 60, borderRadius: 20, backgroundColor: dark ? colors.accent : colors.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
          <Icon set="mci" name={icon} size={30} color={colors.ink} />
        </View>
        <Icon name="arrow-back" size={22} color={dark ? '#fff' : colors.ink} />
      </Row>
      <View style={{ gap: 4 }}>
        <T w="bold" size={20} color={dark ? '#fff' : colors.ink}>{title}</T>
        <T size={14} color={dark ? 'rgba(255,255,255,.7)' : colors.muted}>{sub}</T>
      </View>
    </Press>
  );
  return (
    <Screen header={<AppHeader />}>
      <Title sub="الاختيار ده مرة واحدة لكل رقم. لو عندك عربية ومحل، استخدم رقم مختلف لكل واحد.">هتستخدم ضغطة إزاي؟</Title>
      {option('car-side', 'عندي عربية', 'اطلب أي قطعة وقارن أسعار أكتر من محل', '/profile', true)}
      {option('store', 'عندي محل', 'استقبل طلبات العملاء وابعت عروضك', '/shop-setup', false)}
      <Muted center size={12.5}>بنراجع بيانات كل محل قبل ما يبدأ يستقبل طلبات.</Muted>
      <Press onPress={signOut} label="مش رقمك؟ سجّل خروج" style={{ alignSelf: 'center', paddingVertical: 6 }}>
        <T size={13.5} w="semibold" color={colors.primary}>مش رقمك؟ سجّل خروج</T>
      </Press>
      <Muted center size={12}>اخترت غلط؟ كلّم الدعم وهنغيّرهالك.</Muted>
    </Screen>
  );
}

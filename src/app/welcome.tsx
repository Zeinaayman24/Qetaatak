import { Redirect, router } from 'expo-router';
import { View } from 'react-native';
import { AppHeader } from '@/components/AppHeader';
import { Card, Muted, Screen, T } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { colors } from '@/lib/theme';

export default function Welcome() {
  const { session, ready } = useAuth();
  if (ready && !session) return <Redirect href="/login" />;
  const option = (icon: string, title: string, sub: string, href: '/profile' | '/shop-setup') => (
    <Card onPress={() => router.push(href)} style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
      <View style={{ width: 52, height: 52, borderRadius: 14, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
        <T size={26}>{icon}</T>
      </View>
      <View style={{ flex: 1 }}><T w="bold">{title}</T><Muted>{sub}</Muted></View>
    </Card>
  );
  return (
    <Screen header={<AppHeader />}>
      <View style={{ gap: 4 }}>
        <T w="bold" size={22}>انت مين؟</T>
        <Muted size={14}>تقدر تضيف الدور التاني بعدين من فوق.</Muted>
      </View>
      {option('🚗', 'أنا صاحب عربية', 'عايز أدوّر على قطعة غيار بأحسن سعر', '/profile')}
      {option('🏪', 'أنا عندي محل قطع غيار أو تشليح', 'عايز طلبات زباين من غير إعلانات', '/shop-setup')}
    </Screen>
  );
}

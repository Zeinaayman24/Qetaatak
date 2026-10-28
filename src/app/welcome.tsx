import { Redirect, router } from 'expo-router';
import { Pressable, View } from 'react-native';
import { AppHeader } from '@/components/AppHeader';
import { Muted, Screen, T, Title } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { colors } from '@/lib/theme';

export default function Welcome() {
  const { session, ready } = useAuth();
  if (ready && !session) return <Redirect href="/login" />;
  const option = (icon: string, title: string, sub: string, href: '/profile' | '/shop-setup') => (
    <Pressable onPress={() => router.push(href)} accessibilityRole="button"
      style={({ pressed }) => [{ backgroundColor: colors.card, borderRadius: 20, padding: 20, gap: 14 }, pressed && { opacity: 0.85 }]}>
      <T size={34}>{icon}</T>
      <View style={{ gap: 2 }}>
        <T w="bold" size={18}>{title}</T>
        <Muted size={14}>{sub}</Muted>
      </View>
    </Pressable>
  );
  return (
    <Screen header={<AppHeader />}>
      <Title sub="كل حساب ليه دور واحد بس. لو عندك عربية ومحل، اعمل حساب لكل واحد بإيميل مختلف.">هتستخدم قطعتك إزاي؟</Title>
      {option('🚗', 'عندي عربية', 'عايز أدوّر على قطعة غيار بأحسن سعر', '/profile')}
      {option('🏪', 'عندي محل أو تشليح', 'عايز طلبات زباين من غير إعلانات', '/shop-setup')}
    </Screen>
  );
}

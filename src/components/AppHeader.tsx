import { router } from 'expo-router';
import { Pressable, View } from 'react-native';
import { useAuth } from '@/lib/auth';
import { colors } from '@/lib/theme';
import { T } from './ui';

export type Role = 'customer' | 'shop' | 'admin';

export function AppHeader({ role }: { role?: Role }) {
  const { profile, session, signOut } = useAuth();
  const tabs: [Role, string][] = [['customer', 'عميل'], ['shop', 'محل']];
  if (profile?.is_admin) tabs.push(['admin', 'إدارة']);
  return (
    <View style={{ height: 60, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <T w="display" size={24} style={{ lineHeight: 32 }}>
        قطع<T w="display" size={24} color={colors.accent}>تك</T>
      </T>
      <View style={{ flex: 1 }} />
      {session && profile && role ? (
        <View style={{ flexDirection: 'row', backgroundColor: colors.card, borderRadius: 999, padding: 3 }}>
          {tabs.map(([r, label]) => {
            const on = role === r;
            return (
              <Pressable key={r} onPress={() => router.replace(r === 'customer' ? '/customer' : r === 'shop' ? '/shop' : '/admin')}
                accessibilityRole="tab" accessibilityState={{ selected: on }}
                style={{ paddingHorizontal: 12, paddingVertical: 5, borderRadius: 999, backgroundColor: on ? colors.ink : 'transparent' }}>
                <T size={12.5} w="semibold" color={on ? colors.brandInk : colors.muted}>{label}</T>
              </Pressable>
            );
          })}
        </View>
      ) : null}
      {session ? (
        <Pressable onPress={signOut} accessibilityRole="button" accessibilityLabel="تسجيل خروج" hitSlop={8}>
          <T size={12.5} color={colors.muted}>خروج</T>
        </Pressable>
      ) : null}
    </View>
  );
}

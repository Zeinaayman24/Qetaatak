import { router } from 'expo-router';
import { Pressable, View } from 'react-native';
import { useAuth } from '@/lib/auth';
import { colors } from '@/lib/theme';
import { T } from './ui';

export type Role = 'customer' | 'shop' | 'admin';

const TAGLINE: Record<Role, string> = {
  customer: 'قطع غيار مستعملة وجديدة بأحسن سعر',
  shop: 'للمحلات والتشاليح',
  admin: 'لوحة الإدارة',
};

export function AppHeader({ role }: { role?: Role }) {
  const { profile, session, signOut } = useAuth();
  const tabs: [Role, string][] = [['customer', 'عميل'], ['shop', 'محل']];
  if (profile?.is_admin) tabs.push(['admin', 'الإدارة']);
  return (
    <View style={{ paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      <View style={{ flex: 1, minWidth: 150 }}>
        <T w="display" size={24} color={colors.brandInk} style={{ lineHeight: 30 }}>
          قطع<T w="display" size={24} color={colors.accent}>تك</T>
        </T>
        <T size={12} color={colors.brandInk} style={{ opacity: 0.75 }}>{TAGLINE[role ?? 'customer']}</T>
      </View>
      {session && profile && role ? (
        <View style={{ flexDirection: 'row', backgroundColor: 'rgba(255,255,255,.12)', borderRadius: 999, padding: 3, gap: 2 }}>
          {tabs.map(([r, label]) => (
            <Pressable key={r} onPress={() => router.replace(r === 'customer' ? '/customer' : r === 'shop' ? '/shop' : '/admin')}
              accessibilityRole="tab" accessibilityState={{ selected: role === r }}
              style={{ paddingHorizontal: 12, paddingVertical: 5, borderRadius: 999, backgroundColor: role === r ? colors.brandInk : 'transparent' }}>
              <T size={12.5} w="semibold" color={role === r ? colors.brand : colors.brandInk}>{label}</T>
            </Pressable>
          ))}
        </View>
      ) : null}
      {session ? (
        <Pressable onPress={signOut} accessibilityRole="button" style={{ paddingHorizontal: 6, paddingVertical: 4 }}>
          <T size={12} color={colors.brandInk} style={{ opacity: 0.8 }}>خروج</T>
        </Pressable>
      ) : null}
    </View>
  );
}

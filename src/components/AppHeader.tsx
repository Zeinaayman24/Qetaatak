import { usePathname, router } from 'expo-router';
import { Pressable, View } from 'react-native';
import { colors } from '@/lib/theme';
import { Icon, T } from './ui';

export type Role = 'customer' | 'shop' | 'admin';

/** Remembers which side (customer or shop) the person last used, for people who have both. */
let lastRole: 'customer' | 'shop' | null = null;
export const rememberRole = (r: 'customer' | 'shop') => { lastRole = r; };
export function currentRole(p: { is_customer: boolean; is_shop: boolean } | null): 'customer' | 'shop' {
  if (lastRole) return lastRole;
  return p?.is_shop && !p?.is_customer ? 'shop' : 'customer';
}

/** Small top bar used on sign-in and setup screens. */
export function AppHeader(_: { role?: Role }) {
  return (
    <View style={{ height: 56, flexDirection: 'row', alignItems: 'center' }}>
      <Logo />
    </View>
  );
}

export function Logo({ size = 24 }: { size?: number }) {
  return (
    <T w="display" size={size} style={{ lineHeight: size * 1.35 }}>
      قطع<T w="display" size={size} color={colors.accent}>تك</T>
    </T>
  );
}

type Item = { href: string; label: string; icon: string; match: (p: string) => boolean };

/** The bottom tab bar. Customers and shops each see only their own tabs. */
export function BottomNav({ role }: { role: 'customer' | 'shop' }) {
  const path = usePathname();
  const items: Item[] = role === 'customer'
    ? [
        { href: '/customer', label: 'الرئيسية', icon: 'home', match: (p) => p === '/customer' || p === '/customer/new' },
        { href: '/customer/requests', label: 'طلباتي', icon: 'receipt', match: (p) => p.startsWith('/customer/') && p !== '/customer/new' },
        { href: '/account', label: 'حسابي', icon: 'person', match: (p) => ['/account', '/profile', '/cars', '/favorites', '/support', '/notifications'].includes(p) },
      ]
    : [
        { href: '/shop', label: 'الطلبات', icon: 'file-tray-full', match: (p) => p.startsWith('/shop') && p !== '/shop-setup' },
        { href: '/account', label: 'المحل', icon: 'storefront', match: (p) => ['/account', '/shop-setup', '/support', '/notifications'].includes(p) },
      ];
  return (
    <View style={{ flexDirection: 'row', height: 62 }} accessibilityRole="tablist">
      {items.map((it) => {
        const on = it.match(path);
        return (
          <Pressable key={it.href} onPress={() => router.replace(it.href as any)} accessibilityRole="tab" accessibilityState={{ selected: on }}
            style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2 }}>
            <Icon name={on ? it.icon : it.icon + '-outline'} size={23} color={on ? colors.ink : colors.faint} />
            <T size={11.5} w={on ? 'semibold' : 'medium'} color={on ? colors.ink : colors.faint}>{it.label}</T>
          </Pressable>
        );
      })}
    </View>
  );
}

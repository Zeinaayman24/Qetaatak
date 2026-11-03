import { usePathname, router } from 'expo-router';
import { Pressable, View } from 'react-native';
import { colors, liftStrong } from '@/lib/theme';
import { useInbox } from '@/lib/inbox';
import { Icon, Press, T } from './ui';

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

import { Logo } from './Brand';
export { Logo };

type Item = { href: string; label: string; icon: string; match: (p: string) => boolean; badge?: number };

/**
 * The tab bar docked at the bottom of every main screen: four tabs each for customers and shops.
 * A new request starts from the search bar on the customer home screen (and the button on «طلباتي»).
 */
export function BottomNav({ role }: { role: 'customer' | 'shop' }) {
  const path = usePathname();
  const { unread } = useInbox();
  const items: Item[] = role === 'customer'
    ? [
        { href: '/customer', label: 'الرئيسية', icon: 'home', match: (p) => p === '/customer' },
        { href: '/customer/requests', label: 'طلباتي', icon: 'receipt', match: (p) => (p.startsWith('/customer/') && p !== '/customer/new') || p.startsWith('/order') },
        { href: '/messages', label: 'الرسائل', icon: 'chatbubbles', match: (p) => p === '/messages' || p.startsWith('/chat') || p === '/assistant', badge: unread },
        { href: '/account', label: 'حسابي', icon: 'person', match: (p) => ['/account', '/profile', '/cars', '/favorites', '/support', '/notifications'].includes(p) },
      ]
    : [
        { href: '/shop', label: 'الطلبات', icon: 'file-tray-full', match: (p) => p.startsWith('/shop') && p !== '/shop-setup' },
        { href: '/messages', label: 'الرسائل', icon: 'chatbubbles', match: (p) => p === '/messages' || p.startsWith('/chat'), badge: unread },
        { href: '/notifications', label: 'الإشعارات', icon: 'notifications', match: (p) => p === '/notifications' },
        { href: '/account', label: 'المحل', icon: 'storefront', match: (p) => ['/account', '/shop-setup', '/support'].includes(p) },
      ];
  const tab = (it: Item) => {
    const on = it.match(path);
    return (
      <Press key={it.href} onPress={() => router.replace(it.href as any)} role="tab" selected={on} label={it.label}
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3, height: 64 }}>
        <View style={{ width: 46, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? colors.primarySoft : 'transparent' }}>
          <Icon name={it.icon} size={21} color={on ? colors.primary : colors.faint} stroke={on ? 2.1 : 1.8} />
          {it.badge ? (
            <View style={{ position: 'absolute', top: -4, right: 4, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4, backgroundColor: colors.bad, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.surface }}>
              <T size={10} w="bold" color="#fff" style={{ lineHeight: 13 }}>{it.badge > 9 ? '+9' : String(it.badge)}</T>
            </View>
          ) : null}
        </View>
        <T size={11} w={on ? 'semibold' : 'medium'} color={on ? colors.primary : colors.faint} style={{ lineHeight: 15 }}>{it.label}</T>
      </Press>
    );
  };
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface }} accessibilityRole="tablist">
      {items.map(tab)}
    </View>
  );
}

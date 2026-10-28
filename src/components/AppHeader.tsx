import { usePathname, router } from 'expo-router';
import { Pressable, View } from 'react-native';
import { colors, liftStrong } from '@/lib/theme';
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

/** The wordmark. On the orange hero the tail turns white; on dark grounds the head does. */
export function Logo({ size = 24, on = 'light' }: { size?: number; on?: 'light' | 'orange' | 'dark' }) {
  const head = on === 'dark' ? '#fff' : colors.ink;
  const tail = on === 'orange' ? '#fff' : colors.accent;
  return (
    <T w="display" size={size} color={head} style={{ lineHeight: size * 1.35, letterSpacing: -0.5 }}>
      قطع<T w="display" size={size} color={tail}>تك</T>
    </T>
  );
}

type Item = { href: string; label: string; icon: string; match: (p: string) => boolean };

/**
 * The floating tab bar. Customers get a raised orange button in the middle for a new request;
 * customers and shops each see only their own tabs.
 */
export function BottomNav({ role }: { role: 'customer' | 'shop' }) {
  const path = usePathname();
  const items: Item[] = role === 'customer'
    ? [
        { href: '/customer', label: 'الرئيسية', icon: 'home', match: (p) => p === '/customer' },
        { href: '/customer/requests', label: 'طلباتي', icon: 'receipt', match: (p) => (p.startsWith('/customer/') && p !== '/customer/new') || p.startsWith('/order') },
        { href: '/assistant', label: 'المساعد', icon: 'chatbubbles', match: (p) => p === '/assistant' },
        { href: '/account', label: 'حسابي', icon: 'person', match: (p) => ['/account', '/profile', '/cars', '/favorites', '/support', '/notifications'].includes(p) },
      ]
    : [
        { href: '/shop', label: 'الطلبات', icon: 'file-tray-full', match: (p) => p.startsWith('/shop') && p !== '/shop-setup' },
        { href: '/notifications', label: 'الإشعارات', icon: 'notifications', match: (p) => p === '/notifications' },
        { href: '/account', label: 'المحل', icon: 'storefront', match: (p) => ['/account', '/shop-setup', '/support'].includes(p) },
      ];
  const tab = (it: Item) => {
    const on = it.match(path);
    return (
      <Press key={it.href} onPress={() => router.replace(it.href as any)} role="tab" selected={on} label={it.label}
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2, height: 64 }}>
        <Icon name={on ? it.icon : it.icon + '-outline'} size={22} color={on ? colors.ink : colors.faint} />
        <T size={11} w={on ? 'semibold' : 'medium'} color={on ? colors.ink : colors.faint} style={{ lineHeight: 15 }}>{it.label}</T>
        {on ? <View style={{ position: 'absolute', bottom: 6, width: 5, height: 5, borderRadius: 3, backgroundColor: colors.accent }} /> : null}
      </Press>
    );
  };
  return (
    <View style={[{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: 26, paddingHorizontal: 6 }, liftStrong]} accessibilityRole="tablist">
      {role === 'customer' ? (
        <>
          {items.slice(0, 2).map(tab)}
          <View style={{ width: 72, alignItems: 'center' }}>
            <Press onPress={() => router.push('/customer/new')} label="طلب جديد"
              style={[{ width: 60, height: 60, borderRadius: 30, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', marginTop: -30, borderWidth: 5, borderColor: colors.ground }, liftStrong]}>
              <Icon name="add" size={30} color={colors.ink} />
            </Press>
          </View>
          {items.slice(2).map(tab)}
        </>
      ) : items.map(tab)}
    </View>
  );
}

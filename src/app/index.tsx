import { Redirect } from 'expo-router';
import { Loading, Screen } from '@/components/ui';
import { useAuth } from '@/lib/auth';

/** Sends each person to the right place: sign in, set up, or their last role. */
export default function Index() {
  const { ready, session, profile, shop } = useAuth();
  if (!ready || (session && !profile)) return <Screen><Loading /></Screen>;
  if (!session) return <Redirect href="/login" />;
  if (!profile!.is_customer && !profile!.is_shop) return <Redirect href="/welcome" />;
  if (profile!.is_shop && shop && !profile!.is_customer) return <Redirect href="/shop" />;
  return <Redirect href="/customer" />;
}

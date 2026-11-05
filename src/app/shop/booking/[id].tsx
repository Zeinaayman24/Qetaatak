import { Redirect, useLocalSearchParams } from 'expo-router';
import { BookingView } from '@/components/BookingView';
import { useAuth } from '@/lib/auth';

/** The shop's view of an installation booking. */
export default function ShopBooking() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { ready, session } = useAuth();
  if (ready && !session) return <Redirect href="/login" />;
  return <BookingView id={id} side="shop" />;
}

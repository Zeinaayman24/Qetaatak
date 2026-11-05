import { Redirect, useLocalSearchParams } from 'expo-router';
import { BookingView } from '@/components/BookingView';
import { useAuth } from '@/lib/auth';

/** The customer's view of an installation booking. */
export default function CustomerBooking() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { ready, session } = useAuth();
  if (ready && !session) return <Redirect href="/login" />;
  return <BookingView id={id} side="customer" />;
}

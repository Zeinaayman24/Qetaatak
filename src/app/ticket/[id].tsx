import { Redirect, useLocalSearchParams } from 'expo-router';

/** Old ticket links open the complaint's conversation in the assistant chat. */
export default function Ticket() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <Redirect href={{ pathname: '/assistant', params: { ticket: id } }} />;
}

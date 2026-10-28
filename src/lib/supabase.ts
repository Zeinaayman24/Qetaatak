import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

// Publishable values: safe to ship in the app. Data is protected by row level security in the database.
export const SUPABASE_URL = 'https://ztnbyvfupadzhddnbdje.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_Cq6sW08mbNDB8gUzn9jvlQ_YnjzBQ9d';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    storage: Platform.OS === 'web' ? undefined : AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

export const photoUrl = (path?: string | null) =>
  path ? supabase.storage.from('photos').getPublicUrl(path).data.publicUrl : null;

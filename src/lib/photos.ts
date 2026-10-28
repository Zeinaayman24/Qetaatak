import * as ImagePicker from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { supabase } from './supabase';

/** Lets the person pick a photo, shrinks it to ~1080px JPEG, and returns a local uri. */
export async function pickPhoto(): Promise<string | null> {
  const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
  if (res.canceled || !res.assets?.length) return null;
  const a = res.assets[0];
  const width = Math.min(1080, a.width || 1080);
  const out = await manipulateAsync(a.uri, [{ resize: { width } }], { compress: 0.7, format: SaveFormat.JPEG });
  return out.uri;
}

/** Uploads a picked photo into the person's own folder and returns its storage path. */
export async function uploadPhoto(uri: string, userId: string): Promise<string> {
  const body = await (await fetch(uri)).arrayBuffer();
  const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
  const { error } = await supabase.storage.from('photos').upload(path, body, { contentType: 'image/jpeg', upsert: false });
  if (error) throw error;
  return path;
}

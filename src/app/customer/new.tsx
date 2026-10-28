import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { AppHeader } from '@/components/AppHeader';
import { BackBar, Btn, Chips, ErrorText, Field, Labeled, Loading, Muted, PhotoPicker, Screen, Seg, toast } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { COMMON_PARTS, ar, friendlyError, reqNo } from '@/lib/data';
import { pickPhoto, uploadPhoto } from '@/lib/photos';
import { supabase } from '@/lib/supabase';

export default function NewRequest() {
  const { ready, session, profile } = useAuth();
  const [part, setPart] = useState('');
  const [cond, setCond] = useState<'used' | 'new' | 'any'>('used');
  const [notes, setNotes] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (ready && !session) return <Redirect href="/login" />;
  if (!profile) return <Screen header={<AppHeader role="customer" />}><Loading /></Screen>;

  async function choosePhoto() {
    try { const uri = await pickPhoto(); if (uri) setPhoto(uri); }
    catch { toast('الصورة دي مش مدعومة. جرّب صورة تانية.'); }
  }

  async function send() {
    setErr(null);
    if (part.trim().length < 2) return setErr('اكتب اسم القطعة أو اختار من الاقتراحات.');
    setBusy(true);
    try {
      const photo_path = photo ? await uploadPhoto(photo, profile!.id) : null;
      const { data, error } = await supabase.from('requests').insert({
        customer_id: profile!.id, part: part.trim(), car_make: profile!.car_make, car_model: profile!.car_model, car_year: profile!.car_year,
        wanted_condition: cond, area: profile!.area, notes: notes.trim(), photo_path,
      }).select('id, num').single();
      if (error) throw error;
      toast('طلبك ' + reqNo(data.num) + ' اتبعت للمحلات');
      router.replace(`/customer/${data.id}`);
    } catch (x) { setErr(friendlyError(x)); }
    finally { setBusy(false); }
  }

  return (
    <Screen header={<AppHeader role="customer" />} footer={<><ErrorText text={err} /><Btn title="ابعت الطلب للمحلات" onPress={send} loading={busy} /></>}>
      <BackBar title="طلب جديد" onBack={() => router.replace('/customer')} />
      <Muted size={14}>{profile.car_make} {profile.car_model} {ar(profile.car_year ?? '')} · {profile.area}</Muted>
      <Field big value={part} onChangeText={setPart} placeholder="اسم القطعة" />
      <Chips options={COMMON_PARTS.map((p) => ({ v: p, label: p }))} selected={[part]} onPick={setPart} />
      <Labeled label="عايزها">
        <Seg options={[{ v: 'used', label: 'مستعمل' }, { v: 'new', label: 'جديد' }, { v: 'any', label: 'أي حاجة' }]} value={cond} onPick={setCond} />
      </Labeled>
      <PhotoPicker uri={photo} onPick={choosePhoto} hint="صورة القطعة القديمة بتخلي المحل يعرفها أسرع" />
      <Field label="ملاحظات (اختياري)" value={notes} onChangeText={setNotes} multiline placeholder="مثلاً: الجنب اليمين، لون فضي" />
    </Screen>
  );
}

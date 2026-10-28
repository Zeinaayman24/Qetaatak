import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { BackBar, Btn, Chips, ErrorText, Field, Icon, Labeled, Loading, PhotoPicker, Row, Screen, Seg, T, toast } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { COMMON_PARTS, SIDES, URGENCY, ar, friendlyError, reqNo, toLatin, type Car } from '@/lib/data';
import { must, useLive } from '@/lib/live';
import { pickPhoto, uploadPhoto } from '@/lib/photos';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';

type CarOpt = { key: string; make: string; model: string; year: number; vin: string };

export default function NewRequest() {
  const { ready, session, profile } = useAuth();
  const params = useLocalSearchParams<{ part?: string; cond?: string; notes?: string; side?: string }>();
  const str = (v: unknown) => (typeof v === 'string' ? v : '');
  const [part, setPart] = useState(str(params.part));
  const [cond, setCond] = useState<'used' | 'new' | 'any'>((['used', 'new', 'any'].includes(str(params.cond)) ? str(params.cond) : 'used') as any);
  const [side, setSide] = useState<string>(Object.keys(SIDES).includes(str(params.side)) ? str(params.side) : '');
  const [urgency, setUrgency] = useState<'normal' | 'today' | 'urgent'>('normal');
  const [budget, setBudget] = useState('');
  const [notes, setNotes] = useState(str(params.notes));
  const [photo, setPhoto] = useState<string | null>(null);
  const [carKey, setCarKey] = useState('main');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const uid = session?.user.id;
  const { data: extra } = useLive(async () => (uid ? (must(await supabase.from('cars').select('*').eq('owner_id', uid).order('created_at')) as Car[]) : []), ['cars'], [uid]);

  if (ready && !session) return <Redirect href="/login" />;
  if (!profile) return <Screen><Loading /></Screen>;
  const cars: CarOpt[] = [
    { key: 'main', make: profile.car_make ?? '', model: profile.car_model ?? '', year: profile.car_year ?? 0, vin: profile.car_vin ?? '' },
    ...(extra ?? []).map((c) => ({ key: c.id, make: c.make, model: c.model, year: c.year, vin: c.vin })),
  ];
  const car = cars.find((c) => c.key === carKey) ?? cars[0];

  async function choosePhoto() {
    try { const uri = await pickPhoto(); if (uri) setPhoto(uri); }
    catch { toast('الصورة دي مش مدعومة. جرّب صورة تانية.'); }
  }

  async function send() {
    setErr(null);
    if (part.trim().length < 2) return setErr('اكتب اسم القطعة أو اختار من الاقتراحات.');
    const b = budget.trim() ? parseInt(toLatin(budget), 10) : null;
    if (budget.trim() && (!b || b < 1)) return setErr('الميزانية لازم تكون رقم بالجنيه، أو سيبها فاضية.');
    setBusy(true);
    try {
      const photo_path = photo ? await uploadPhoto(photo, profile!.id) : null;
      const { data, error } = await supabase.from('requests').insert({
        customer_id: profile!.id, part: part.trim(), car_make: car.make, car_model: car.model, car_year: car.year, vin: car.vin,
        wanted_condition: cond, side, urgency, budget: b, area: profile!.area, notes: notes.trim(), photo_path,
      }).select('id, num').single();
      if (error) throw error;
      toast('طلبك ' + reqNo(data.num) + ' اتبعت للمحلات');
      router.replace(`/customer/${data.id}`);
    } catch (x) { setErr(friendlyError(x)); }
    finally { setBusy(false); }
  }

  return (
    <Screen footer={<><ErrorText text={err} /><Btn title="ابعت الطلب للمحلات" onPress={send} loading={busy} /></>}>
      <BackBar title="طلب جديد" onBack={() => (router.canGoBack() ? router.back() : router.replace('/customer'))} />

      <Labeled label="العربية">
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {cars.map((c) => {
            const on = c.key === car.key;
            return (
              <Pressable key={c.key} onPress={() => setCarKey(c.key)} accessibilityRole="button" accessibilityState={{ selected: on }}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1.5, borderColor: on ? colors.ink : colors.line }}>
                <Icon name="car-sport-outline" size={18} />
                <T size={13} w={on ? 'semibold' : 'medium'}>{c.make} {c.model} {ar(c.year)}</T>
              </Pressable>
            );
          })}
          <Pressable onPress={() => router.push('/cars')} accessibilityRole="button"
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: colors.card }}>
            <Icon name="add" size={18} /><T size={13} w="medium">عربية تانية</T>
          </Pressable>
        </ScrollView>
      </Labeled>

      <Field big value={part} onChangeText={setPart} placeholder="اسم القطعة" />
      <Chips options={COMMON_PARTS.map((p) => ({ v: p, label: p }))} selected={[part]} onPick={setPart} />
      <PhotoPicker uri={photo} onPick={choosePhoto} hint="صورة القطعة القديمة بتخلي المحل يعرفها أسرع" />

      <Labeled label="عايزها">
        <Seg options={[{ v: 'used', label: 'مستعمل' }, { v: 'new', label: 'جديد' }, { v: 'any', label: 'أي حاجة' }]} value={cond} onPick={setCond} />
      </Labeled>
      <Labeled label="الجهة">
        <Chips options={Object.entries(SIDES).map(([v, label]) => ({ v, label }))} selected={[side]} onPick={setSide} />
      </Labeled>
      <Labeled label="محتاجها إمتى؟">
        <Seg options={Object.entries(URGENCY).map(([v, label]) => ({ v: v as 'normal' | 'today' | 'urgent', label }))} value={urgency} onPick={setUrgency} />
      </Labeled>
      <Row style={{ alignItems: 'flex-start' }}>
        <View style={{ flex: 1 }}><Field label="ميزانيتك (اختياري)" value={budget} onChangeText={setBudget} keyboardType="number-pad" ltr placeholder="جنيه" /></View>
      </Row>
      <Field label="ملاحظات (اختياري)" value={notes} onChangeText={setNotes} multiline placeholder="مثلاً: لون فضي، فتيس أوتوماتيك" />
    </Screen>
  );
}

import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Image, ScrollView, View } from 'react-native';
import {
  BackBar, Btn, Chips, ErrorText, Field, Icon, Labeled, Loading, Muted, Plate, Press, Row, Screen, Seg, Sheet, T, toast,
} from '@/components/ui';
import { partIsSided } from '@/lib/assistant';
import { useAuth } from '@/lib/auth';
import { COMMON_PARTS, SIDES, URGENCY, WANTED, ar, friendlyError, newId, reqNo, toLatin, type Car } from '@/lib/data';
import { must, useLive } from '@/lib/live';
import { pickPhoto, uploadPhoto } from '@/lib/photos';
import { supabase } from '@/lib/supabase';
import { colors, lift } from '@/lib/theme';

type CarOpt = { key: string; make: string; model: string; year: number; vin: string };
type Cond = 'used' | 'new' | 'any';
type Item = { key: string; part: string; side: string; cond: Cond; qty: number; photo: string | null; notes: string; budget: string };
const blank = (): Item => ({ key: newId(), part: '', side: '', cond: 'used', qty: 1, photo: null, notes: '', budget: '' });

const PART_ICONS: Record<string, string> = {
  'فانوس أمامي': 'car-light-high', 'مراية جانبية': 'mirror', 'رديتر مياه': 'radiator', 'كمبروسر تكييف': 'air-conditioner',
  'طقم دبرياج': 'car-clutch', 'تيل فرامل': 'car-brake-alert', 'دينامو': 'car-battery', 'مارش': 'engine', 'رفرف': 'car-door', 'أكصدام': 'car-side',
};

/** A new request: one car, one or more parts (a basket), sent to every matching shop at once. */
export default function NewRequest() {
  const { ready, session, profile } = useAuth();
  const params = useLocalSearchParams<{ part?: string; cond?: string; notes?: string; side?: string }>();
  const str = (v: unknown) => (typeof v === 'string' ? v : '');
  const [items, setItems] = useState<Item[]>([]);
  const [editing, setEditing] = useState<Item | null>(null);
  const [urgency, setUrgency] = useState<'normal' | 'today' | 'urgent'>('normal');
  const [carKey, setCarKey] = useState('main');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const uid = session?.user.id;
  const { data: extra } = useLive(async () => (uid ? (must(await supabase.from('cars').select('*').eq('owner_id', uid).order('created_at')) as Car[]) : []), ['cars'], [uid]);

  // A part chosen from the home screen (or "order again") arrives ready to fill in.
  useEffect(() => {
    const p = str(params.part);
    const cond = str(params.cond);
    const it = { ...blank(), part: p, notes: str(params.notes), side: Object.keys(SIDES).includes(str(params.side)) ? str(params.side) : '', cond: (['used', 'new', 'any'].includes(cond) ? cond : 'used') as Cond };
    setEditing(it);
  }, []);

  if (ready && !session) return <Redirect href="/login" />;
  if (!profile) return <Screen><Loading /></Screen>;
  const cars: CarOpt[] = [
    { key: 'main', make: profile.car_make ?? '', model: profile.car_model ?? '', year: profile.car_year ?? 0, vin: profile.car_vin ?? '' },
    ...(extra ?? []).map((c) => ({ key: c.id, make: c.make, model: c.model, year: c.year, vin: c.vin })),
  ];
  const car = cars.find((c) => c.key === carKey) ?? cars[0];

  function saveItem(it: Item) {
    if (it.part.trim().length < 2) return toast('اكتب اسم القطعة');
    const clean = { ...it, part: it.part.trim(), side: partIsSided(it.part) ? it.side : '' };
    setItems((xs) => (xs.some((x) => x.key === it.key) ? xs.map((x) => (x.key === it.key ? clean : x)) : [...xs, clean]));
    setEditing(null);
  }

  async function send() {
    setErr(null);
    if (!items.length) return setErr('ضيف قطعة واحدة على الأقل.');
    for (const it of items) {
      if (it.budget.trim()) { const b = parseInt(toLatin(it.budget), 10); if (!b || b < 1) return setErr(`الميزانية بتاعة «${it.part}» لازم تكون رقم.`); }
    }
    setBusy(true);
    try {
      const batch = items.length > 1 ? newId() : null;
      const rows = [];
      for (const it of items) {
        const photo_path = it.photo ? await uploadPhoto(it.photo, profile!.id) : null;
        rows.push({
          customer_id: profile!.id, part: it.part, qty: it.qty, car_make: car.make, car_model: car.model, car_year: car.year, vin: car.vin,
          wanted_condition: it.cond, side: it.side, urgency, budget: it.budget.trim() ? parseInt(toLatin(it.budget), 10) : null,
          area: profile!.area, notes: it.notes.trim(), photo_path, batch_id: batch,
        });
      }
      const { data, error } = await supabase.from('requests').insert(rows).select('id, num');
      if (error) throw error;
      const firstRow = [...(data ?? [])].sort((a, b) => a.num - b.num)[0];
      toast(`طلبك ${reqNo(firstRow.num)} اتبعت للمحلات`);
      router.replace(`/customer/${firstRow.id}`);
    } catch (x) { setErr(friendlyError(x)); }
    finally { setBusy(false); }
  }

  return (
    <Screen footer={
      <>
        <ErrorText text={err} />
        <Btn kind="accent" icon="paper-plane" loading={busy} disabled={!items.length}
          title={items.length > 1 ? `ابعت ${ar(items.length)} قطع للمحلات` : 'ابعت الطلب للمحلات'} onPress={send} />
      </>
    }>
      <BackBar title="طلب جديد" onBack={() => (router.canGoBack() ? router.back() : router.replace('/customer'))}
        right={<Press onPress={() => router.push({ pathname: '/assistant', params: { mode: 'request' } })} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Icon name="sparkles" size={15} color={colors.accentDeep} /><T size={13} w="medium" color={colors.accentDeep}>بالمساعد</T>
        </Press>} />

      <Labeled label="العربية">
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, padding: 2 }}>
          {cars.map((c) => {
            const on = c.key === car.key;
            return (
              <Press key={c.key} onPress={() => setCarKey(c.key)} selected={on}
                style={[{ backgroundColor: colors.surface, borderRadius: 18, padding: 12, gap: 8, borderWidth: 2, borderColor: on ? colors.ink : 'transparent', minWidth: 150 }, lift]}>
                <Plate top={c.model || '—'} bottom={ar(c.year)} size="sm" />
                <T size={13} w={on ? 'semibold' : 'medium'}>{c.make} {c.model}</T>
              </Press>
            );
          })}
          <Press onPress={() => router.push('/cars')} style={{ borderRadius: 18, padding: 12, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.faint, alignItems: 'center', justifyContent: 'center', minWidth: 110, gap: 4 }}>
            <Icon name="add" size={22} /><T size={12.5} w="medium">عربية تانية</T>
          </Press>
        </ScrollView>
      </Labeled>

      <View style={{ gap: 10 }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <T w="bold" size={18}>القطع {items.length ? `(${ar(items.length)})` : ''}</T>
          {items.length ? <Muted size={12}>كل محل يسعّر اللي عنده</Muted> : null}
        </Row>
        {items.map((it) => (
          <View key={it.key} style={[{ backgroundColor: colors.surface, borderRadius: 20, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 12 }, lift]}>
            {it.photo ? <Image source={{ uri: it.photo }} style={{ width: 56, height: 56, borderRadius: 14 }} /> : (
              <View style={{ width: 56, height: 56, borderRadius: 14, backgroundColor: colors.soft, alignItems: 'center', justifyContent: 'center' }}>
                <Icon set="mci" name={PART_ICONS[it.part] ?? 'car-wrench'} size={26} />
              </View>
            )}
            <View style={{ flex: 1, gap: 2 }}>
              <T w="semibold" size={15} numberOfLines={1}>{it.part}{it.qty > 1 ? ` × ${ar(it.qty)}` : ''}</T>
              <Muted size={12} numberOfLines={1}>{[WANTED[it.cond], it.side ? SIDES[it.side] : '', it.budget ? `لحد ${it.budget} ج` : '', it.notes].filter(Boolean).join(' · ')}</Muted>
            </View>
            <Press onPress={() => setEditing(it)} label="عدّل" hitSlop={6}><Icon name="create-outline" size={20} color={colors.muted} /></Press>
            <Press onPress={() => setItems((xs) => xs.filter((x) => x.key !== it.key))} label="شيل" hitSlop={6}><Icon name="trash-outline" size={20} color={colors.bad} /></Press>
          </View>
        ))}
        <Press onPress={() => setEditing(blank())}
          style={{ borderRadius: 20, paddingVertical: 18, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.accentDeep, backgroundColor: colors.accentSoft, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 }}>
          <Icon name="add-circle" size={22} color={colors.accentDeep} />
          <T w="semibold" size={15} color={colors.accentDeep}>{items.length ? 'ضيف قطعة تانية' : 'ضيف القطعة اللي محتاجها'}</T>
        </Press>
      </View>

      <Labeled label="محتاجها إمتى؟">
        <Seg options={Object.entries(URGENCY).map(([v, label]) => ({ v: v as 'normal' | 'today' | 'urgent', label }))} value={urgency} onPick={setUrgency} />
      </Labeled>

      <ItemSheet item={editing} onClose={() => setEditing(null)} onSave={saveItem} isNew={!!editing && !items.some((x) => x.key === editing.key)} />
    </Screen>
  );
}

function ItemSheet({ item, onClose, onSave, isNew }: { item: Item | null; onClose: () => void; onSave: (i: Item) => void; isNew: boolean }) {
  const [it, setIt] = useState<Item>(item ?? blank());
  useEffect(() => { if (item) setIt(item); }, [item]);
  const set = (p: Partial<Item>) => setIt((x) => ({ ...x, ...p }));
  async function photo() {
    try { const uri = await pickPhoto(); if (uri) set({ photo: uri }); }
    catch { toast('الصورة دي مش مدعومة. جرّب صورة تانية.'); }
  }
  return (
    <Sheet open={!!item} onClose={onClose} title={isNew ? 'ضيف قطعة' : 'عدّل القطعة'}>
      <ScrollView style={{ maxHeight: 560 }} contentContainerStyle={{ gap: 16, paddingBottom: 8 }} keyboardShouldPersistTaps="handled">
        <Field big icon="search" value={it.part} onChangeText={(v) => set({ part: v })} placeholder="اسم القطعة" />
        <Chips options={COMMON_PARTS.map((p) => ({ v: p, label: p }))} selected={[it.part]} onPick={(v) => set({ part: v })} />
        {partIsSided(it.part) ? (
          <Labeled label="الجهة">
            <Chips options={Object.entries(SIDES).map(([v, label]) => ({ v, label }))} selected={[it.side]} onPick={(v) => set({ side: v })} />
          </Labeled>
        ) : null}
        <Labeled label="عايزها">
          <Seg options={[{ v: 'used', label: 'مستعمل' }, { v: 'new', label: 'جديد' }, { v: 'any', label: 'أي حاجة' }]} value={it.cond} onPick={(v) => set({ cond: v as Cond })} />
        </Labeled>
        <Row style={{ justifyContent: 'space-between' }}>
          <T w="medium" size={13} color={colors.muted}>العدد</T>
          <Row gap={14}>
            <Press onPress={() => set({ qty: Math.max(1, it.qty - 1) })} label="أقل" style={qtyBtn}><Icon name="remove" size={18} /></Press>
            <T w="bold" size={18}>{ar(it.qty)}</T>
            <Press onPress={() => set({ qty: Math.min(20, it.qty + 1) })} label="أكتر" style={qtyBtn}><Icon name="add" size={18} /></Press>
          </Row>
        </Row>
        <Press onPress={photo} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 18, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.line }}>
          {it.photo ? <Image source={{ uri: it.photo }} style={{ width: 52, height: 52, borderRadius: 12 }} /> : (
            <View style={{ width: 52, height: 52, borderRadius: 12, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' }}><Icon name="camera" size={22} color={colors.accentDeep} /></View>
          )}
          <View style={{ flex: 1 }}>
            <T w="semibold" size={14}>{it.photo ? 'الصورة اتضافت' : 'صوّر القطعة القديمة'}</T>
            <Muted size={12}>{it.photo ? 'اضغط لو عايز تغيّرها' : 'المحل يعرفها أسرع ويديك سعر مظبوط'}</Muted>
          </View>
        </Press>
        <Row gap={10} style={{ alignItems: 'flex-start' }}>
          <View style={{ flex: 1 }}><Field label="ميزانيتك (اختياري)" value={it.budget} onChangeText={(v) => set({ budget: v })} keyboardType="number-pad" ltr placeholder="جنيه" /></View>
        </Row>
        <Field label="ملاحظات (اختياري)" value={it.notes} onChangeText={(v) => set({ notes: v })} placeholder="مثلاً: لون فضي، فتيس أوتوماتيك" />
      </ScrollView>
      <Btn title={isNew ? 'ضيف للطلب' : 'احفظ'} icon={isNew ? 'add' : 'checkmark'} onPress={() => onSave(it)} style={{ marginTop: 12 }} />
    </Sheet>
  );
}

const qtyBtn = { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.soft, alignItems: 'center' as const, justifyContent: 'center' as const };

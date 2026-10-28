import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, Platform, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Btn, Chips, ErrorText, Field, Icon, IconButton, Labeled, Loading, Muted, Plate, Press, Row, Seg, T, ToastHost, toast } from '@/components/ui';
import { partIsSided } from '@/lib/assistant';
import { useAuth } from '@/lib/auth';
import { SIDES, URGENCY, WANTED, ar, friendlyError, newId, reqNo, toLatin, type Car } from '@/lib/data';
import { must, useLive } from '@/lib/live';
import { pickPhoto, uploadPhoto } from '@/lib/photos';
import { supabase } from '@/lib/supabase';
import { colors, fonts, lift } from '@/lib/theme';

type Cond = 'used' | 'new' | 'any';
type Item = { key: string; part: string; side: string; cond: Cond; qty: number; photo: string | null; notes: string; budget: string };
type CarOpt = { key: string; make: string; model: string; year: number; vin: string };
const item = (part: string): Item => ({ key: newId(), part, side: '', cond: 'used', qty: 1, photo: null, notes: '', budget: '' });

const CATALOG: { part: string; icon: string }[] = [
  { part: 'فانوس أمامي', icon: 'car-light-high' }, { part: 'فانوس خلفي', icon: 'car-light-dimmed' }, { part: 'مراية جانبية', icon: 'mirror' },
  { part: 'رديتر مياه', icon: 'radiator' }, { part: 'كمبروسر تكييف', icon: 'air-conditioner' }, { part: 'طقم دبرياج', icon: 'car-clutch' },
  { part: 'تيل فرامل', icon: 'car-brake-alert' }, { part: 'دينامو', icon: 'car-battery' }, { part: 'مارش', icon: 'engine' },
  { part: 'رفرف', icon: 'car-door' }, { part: 'أكصدام أمامي', icon: 'car-side' }, { part: 'مساعدين', icon: 'car-cog' },
];
const iconOf = (p: string) => CATALOG.find((c) => c.part === p)?.icon ?? 'car-wrench';
const STEPS = ['القطع', 'التفاصيل', 'العربية', 'المراجعة'];

/** New price request, one step per screen: parts → details → car and timing → review. */
export default function NewRequest() {
  const { ready, session, profile } = useAuth();
  const params = useLocalSearchParams<{ part?: string; cond?: string; notes?: string; side?: string }>();
  const str = (v: unknown) => (typeof v === 'string' ? v : '');
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState(0);
  const [items, setItems] = useState<Item[]>(() => {
    const p = str(params.part);
    if (!p) return [];
    const cond = str(params.cond);
    return [{ ...item(p), notes: str(params.notes), side: Object.keys(SIDES).includes(str(params.side)) ? str(params.side) : '', cond: (['used', 'new', 'any'].includes(cond) ? cond : 'used') as Cond }];
  });
  const [q, setQ] = useState('');
  const [urgency, setUrgency] = useState<'normal' | 'today' | 'urgent'>('normal');
  const [carKey, setCarKey] = useState('main');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const slide = useRef(new Animated.Value(0)).current;
  const uid = session?.user.id;
  const { data: extra } = useLive(async () => (uid ? (must(await supabase.from('cars').select('*').eq('owner_id', uid).order('created_at')) as Car[]) : []), ['cars'], [uid]);

  useEffect(() => {
    slide.setValue(1);
    Animated.timing(slide, { toValue: 0, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: Platform.OS !== 'web' }).start();
  }, [step, slide]);

  if (ready && !session) return <Redirect href="/login" />;
  if (!profile) return <View style={{ flex: 1, backgroundColor: colors.ground, padding: 20 }}><Loading /></View>;
  const cars: CarOpt[] = [
    { key: 'main', make: profile.car_make ?? '', model: profile.car_model ?? '', year: profile.car_year ?? 0, vin: profile.car_vin ?? '' },
    ...(extra ?? []).map((c) => ({ key: c.id, make: c.make, model: c.model, year: c.year, vin: c.vin })),
  ];
  const car = cars.find((c) => c.key === carKey) ?? cars[0];
  const upd = (key: string, p: Partial<Item>) => setItems((xs) => xs.map((x) => (x.key === key ? { ...x, ...p } : x)));
  const add = (part: string) => {
    const name = part.trim();
    if (name.length < 2) return;
    if (items.some((x) => x.part === name)) return toast('القطعة دي في الطلب بالفعل');
    setItems((xs) => [...xs, item(name)]); setQ('');
  };
  const leave = () => (router.canGoBack() ? router.back() : router.replace('/customer'));

  async function send() {
    setErr(null);
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
          wanted_condition: it.cond, side: partIsSided(it.part) ? it.side : '', urgency, budget: it.budget.trim() ? parseInt(toLatin(it.budget), 10) : null,
          area: profile!.area, notes: it.notes.trim(), photo_path, batch_id: batch,
        });
      }
      const { data, error } = await supabase.from('requests').insert(rows).select('id, num');
      if (error) throw error;
      const first = [...(data ?? [])].sort((a, b) => a.num - b.num)[0];
      toast(`طلبك ${reqNo(first.num)} اتبعت للمحلات`);
      router.replace(`/customer/${first.id}`);
    } catch (x) { setErr(friendlyError(x)); }
    finally { setBusy(false); }
  }

  const canNext = step === 0 ? items.length > 0 : true;
  const next = () => (step < 3 ? setStep(step + 1) : send());
  const suggestions = CATALOG.filter((c) => !items.some((x) => x.part === c.part) && (!q.trim() || c.part.includes(q.trim())));

  return (
    <View style={{ flex: 1, backgroundColor: colors.ground }}>
      {/* top: close, progress, step title */}
      <View style={{ paddingTop: insets.top + 8, backgroundColor: colors.ground }}>
        <View style={{ width: '100%', maxWidth: 560, alignSelf: 'center', paddingHorizontal: 18, gap: 14 }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <IconButton name={step ? 'chevron-forward' : 'close'} label={step ? 'رجوع' : 'اقفل'} onPress={() => (step ? setStep(step - 1) : leave())} />
            <T w="semibold" size={14} color={colors.muted}>خطوة {ar(step + 1)} من {ar(4)}</T>
            <Press onPress={() => router.push({ pathname: '/assistant', params: { mode: 'request' } })} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Icon name="sparkles" size={15} color={colors.accentDeep} /><T size={13} w="medium" color={colors.accentDeep}>بالمساعد</T>
            </Press>
          </Row>
          <Row gap={6}>
            {STEPS.map((sname, i) => (
              <View key={sname} style={{ flex: 1, gap: 6 }}>
                <View style={{ height: 5, borderRadius: 3, backgroundColor: i <= step ? colors.accent : colors.line }} />
                <T size={11.5} w={i === step ? 'semibold' : 'regular'} color={i <= step ? colors.ink : colors.faint}>{sname}</T>
              </View>
            ))}
          </Row>
        </View>
      </View>

      <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <Animated.View style={{ width: '100%', maxWidth: 560, alignSelf: 'center', paddingHorizontal: 18, paddingTop: 22, paddingBottom: 40, gap: 18,
          opacity: slide.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }), transform: [{ translateX: slide.interpolate({ inputRange: [0, 1], outputRange: [0, -40] }) }] }}>
          {step === 0 ? (
            <>
              <T w="bold" size={28} style={{ lineHeight: 38, letterSpacing: -0.4 }}>محتاج إيه؟</T>
              <Muted size={14} style={{ marginTop: -10 }}>ضيف كل القطع اللي محتاجها؛ كل محل هيسعّر اللي عنده.</Muted>
              <View style={[{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.surface, borderRadius: 18, paddingStart: 16, paddingEnd: 6, height: 58 }, lift]}>
                <Icon name="search" size={20} color={colors.faint} />
                <TextInput value={q} onChangeText={setQ} placeholder="اكتب اسم القطعة" placeholderTextColor={colors.faint} onSubmitEditing={() => add(q)} returnKeyType="done"
                  style={[{ flex: 1, fontFamily: fonts.medium, fontSize: 16, color: colors.ink, textAlign: 'right' }, { outlineStyle: 'none' } as any]} />
                {q.trim().length > 1 ? <Btn kind="small" title="ضيف" icon="add" onPress={() => add(q)} style={{ alignSelf: 'center' }} /> : null}
              </View>
              {items.length ? (
                <View style={{ gap: 8 }}>
                  {items.map((it) => (
                    <View key={it.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.ink, borderRadius: 18, padding: 12 }}>
                      <View style={{ width: 42, height: 42, borderRadius: 12, backgroundColor: 'rgba(255,255,255,.1)', alignItems: 'center', justifyContent: 'center' }}>
                        <Icon set="mci" name={iconOf(it.part)} size={22} color={colors.accent} />
                      </View>
                      <T w="semibold" size={15} color="#fff" style={{ flex: 1 }}>{it.part}</T>
                      <Press onPress={() => setItems((xs) => xs.filter((x) => x.key !== it.key))} label="شيل" hitSlop={8}><Icon name="close-circle" size={22} color="rgba(255,255,255,.6)" /></Press>
                    </View>
                  ))}
                </View>
              ) : null}
              <T w="semibold" size={14} color={colors.muted}>{q.trim() ? 'اقتراحات' : 'الأكتر طلباً'}</T>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                {suggestions.map((c) => (
                  <Press key={c.part} onPress={() => add(c.part)} label={c.part}
                    style={[{ width: '31%', flexGrow: 1, backgroundColor: colors.surface, borderRadius: 18, paddingVertical: 14, alignItems: 'center', gap: 8 }, lift]}>
                    <View style={{ width: 46, height: 46, borderRadius: 14, backgroundColor: colors.soft, alignItems: 'center', justifyContent: 'center' }}>
                      <Icon set="mci" name={c.icon} size={24} />
                    </View>
                    <T size={12.5} w="medium" center numberOfLines={1}>{c.part}</T>
                  </Press>
                ))}
              </View>
            </>
          ) : step === 1 ? (
            <>
              <T w="bold" size={28} style={{ lineHeight: 38, letterSpacing: -0.4 }}>تفاصيل القطع</T>
              <Muted size={14} style={{ marginTop: -10 }}>كل ما التفاصيل أوضح، السعر أدق. الصورة بتفرق جداً.</Muted>
              {items.map((it, i) => (
                <View key={it.key} style={[{ backgroundColor: colors.surface, borderRadius: 24, padding: 16, gap: 14 }, lift]}>
                  <Row gap={10}>
                    <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' }}><T size={12} w="bold" style={{ lineHeight: 16 }}>{ar(i + 1)}</T></View>
                    <T w="bold" size={17} style={{ flex: 1 }}>{it.part}</T>
                    <Row gap={10}>
                      <Press onPress={() => upd(it.key, { qty: Math.max(1, it.qty - 1) })} label="أقل" style={qtyBtn}><Icon name="remove" size={16} /></Press>
                      <T w="bold" size={16}>{ar(it.qty)}</T>
                      <Press onPress={() => upd(it.key, { qty: Math.min(20, it.qty + 1) })} label="أكتر" style={qtyBtn}><Icon name="add" size={16} /></Press>
                    </Row>
                  </Row>
                  {partIsSided(it.part) ? <Chips options={Object.entries(SIDES).map(([v, label]) => ({ v, label }))} selected={[it.side]} onPick={(v) => upd(it.key, { side: v })} /> : null}
                  <Seg options={[{ v: 'used', label: 'مستعمل' }, { v: 'new', label: 'جديد' }, { v: 'any', label: 'أي حاجة' }]} value={it.cond} onPick={(v) => upd(it.key, { cond: v as Cond })} />
                  <Press onPress={async () => { try { const uri = await pickPhoto(); if (uri) upd(it.key, { photo: uri }); } catch { toast('الصورة دي مش مدعومة.'); } }}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: 16, borderWidth: 1.5, borderStyle: 'dashed', borderColor: it.photo ? colors.good : colors.line }}>
                    {it.photo ? <Image source={{ uri: it.photo }} style={{ width: 44, height: 44, borderRadius: 10 }} /> : (
                      <View style={{ width: 44, height: 44, borderRadius: 10, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' }}><Icon name="camera" size={20} color={colors.accentDeep} /></View>
                    )}
                    <T size={13.5} w="medium" style={{ flex: 1 }}>{it.photo ? 'الصورة اتضافت ✓' : 'صوّر القطعة القديمة'}</T>
                  </Press>
                  <Row gap={10} style={{ alignItems: 'flex-start' }}>
                    <View style={{ flex: 1 }}><Field value={it.budget} onChangeText={(v) => upd(it.key, { budget: v })} keyboardType="number-pad" ltr placeholder="ميزانية (اختياري)" /></View>
                    <View style={{ flex: 1.4 }}><Field value={it.notes} onChangeText={(v) => upd(it.key, { notes: v })} placeholder="ملاحظة (اختياري)" /></View>
                  </Row>
                </View>
              ))}
            </>
          ) : step === 2 ? (
            <>
              <T w="bold" size={28} style={{ lineHeight: 38, letterSpacing: -0.4 }}>لأنهي عربية؟</T>
              <View style={{ gap: 10 }}>
                {cars.map((c) => {
                  const on = c.key === car.key;
                  return (
                    <Press key={c.key} onPress={() => setCarKey(c.key)} selected={on}
                      style={[{ flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: colors.surface, borderRadius: 20, padding: 14, borderWidth: 2, borderColor: on ? colors.ink : 'transparent' }, lift]}>
                      <Plate top={c.model || '—'} bottom={ar(c.year)} />
                      <View style={{ flex: 1 }}><T w="semibold" size={15}>{c.make} {c.model}</T>{c.vin ? <Muted size={12}>شاسيه {c.vin}</Muted> : null}</View>
                      <Icon name={on ? 'radio-button-on' : 'radio-button-off'} size={22} color={on ? colors.ink : colors.faint} />
                    </Press>
                  );
                })}
                <Btn kind="secondary" icon="add" title="عربية تانية" onPress={() => router.push('/cars')} />
              </View>
              <T w="bold" size={20} style={{ marginTop: 6 }}>محتاجها إمتى؟</T>
              <View style={{ gap: 10 }}>
                {([['normal', 'time-outline', 'مش مستعجل', 'المحلات ترد براحتها'], ['today', 'today-outline', 'النهارده', 'عايزها النهارده'], ['urgent', 'flash', 'مستعجل جداً', 'العربية واقفة']] as const).map(([v, icon, t, sub]) => {
                  const on = urgency === v;
                  return (
                    <Press key={v} onPress={() => setUrgency(v)} selected={on}
                      style={[{ flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: on ? colors.ink : colors.surface, borderRadius: 20, padding: 16 }, lift]}>
                      <Icon name={icon} size={24} color={on ? colors.accent : colors.ink} />
                      <View style={{ flex: 1 }}><T w="semibold" size={15} color={on ? '#fff' : colors.ink}>{t}</T><T size={12.5} color={on ? 'rgba(255,255,255,.7)' : colors.muted}>{sub}</T></View>
                    </Press>
                  );
                })}
              </View>
            </>
          ) : (
            <>
              <T w="bold" size={28} style={{ lineHeight: 38, letterSpacing: -0.4 }}>راجع طلبك</T>
              <View style={[{ backgroundColor: colors.surface, borderRadius: 24, overflow: 'hidden' }, lift]}>
                <View style={{ backgroundColor: colors.ink, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <Plate top={car.model || '—'} bottom={ar(car.year)} size="sm" />
                  <View style={{ flex: 1 }}>
                    <T w="semibold" color="#fff">{car.make} {car.model}</T>
                    <T size={12.5} color="rgba(255,255,255,.7)">{URGENCY[urgency]} · {profile.area}</T>
                  </View>
                </View>
                {items.map((it, i) => (
                  <View key={it.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderTopWidth: i ? 1 : 0, borderColor: colors.line }}>
                    {it.photo ? <Image source={{ uri: it.photo }} style={{ width: 44, height: 44, borderRadius: 12 }} /> : (
                      <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: colors.soft, alignItems: 'center', justifyContent: 'center' }}><Icon set="mci" name={iconOf(it.part)} size={22} /></View>
                    )}
                    <View style={{ flex: 1 }}>
                      <T w="semibold" size={14.5}>{it.part}{it.qty > 1 ? ` × ${ar(it.qty)}` : ''}</T>
                      <Muted size={12}>{[WANTED[it.cond], partIsSided(it.part) && it.side ? SIDES[it.side] : '', it.budget ? `لحد ${it.budget} ج` : '', it.notes].filter(Boolean).join(' · ')}</Muted>
                    </View>
                  </View>
                ))}
              </View>
              <Row gap={10} style={{ alignItems: 'flex-start', backgroundColor: colors.accentSoft, borderRadius: 18, padding: 14 }}>
                <Icon name="shield-checkmark" size={20} color={colors.accentDeep} />
                <T size={13} style={{ flex: 1 }}>بنبعت طلبك لمحلات {car.make} الموثّقة بس. رقمك وعنوانك مش بيظهروا لأي محل غير اللي هتختاره.</T>
              </Row>
              <ErrorText text={err} />
            </>
          )}
        </Animated.View>
      </ScrollView>

      <View style={[{ backgroundColor: colors.surface, paddingTop: 12, paddingBottom: insets.bottom + 12, borderTopLeftRadius: 24, borderTopRightRadius: 24 }, lift]}>
        <View style={{ width: '100%', maxWidth: 560, alignSelf: 'center', paddingHorizontal: 18 }}>
          <Btn kind={step === 3 ? 'accent' : 'primary'} icon={step === 3 ? 'paper-plane' : 'arrow-back'} loading={busy} disabled={!canNext}
            title={step === 0 ? (items.length ? `التالي · ${ar(items.length)} ${items.length > 1 ? 'قطع' : 'قطعة'}` : 'ضيف قطعة الأول') : step === 3 ? 'ابعت للمحلات' : 'التالي'}
            onPress={next} />
        </View>
      </View>
      <ToastHost bottom={100} />
    </View>
  );
}

const qtyBtn = { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.soft, alignItems: 'center' as const, justifyContent: 'center' as const };

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, Platform, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Btn, Chips, ErrorText, Field, Icon, IconButton, Labeled, Loading, Muted, Plate, Press, Row, Seg, T, ToastHost, toast } from '@/components/ui';
import { partIsSided } from '@/lib/assistant';
import { isElectrified, matches } from '@/lib/catalogue';
import { useAuth } from '@/lib/auth';
import { SIDES, WANTED, ar, friendlyError, newId, reqNo, type Car } from '@/lib/data';
import { must, useLive } from '@/lib/live';
import { pickPhoto, uploadPhoto } from '@/lib/photos';
import { supabase } from '@/lib/supabase';
import { colors, fonts, lift } from '@/lib/theme';
import { t, dir, startAlign } from '@/lib/i18n';

type Cond = 'used' | 'new' | 'any';
type Item = { key: string; part: string; side: string; cond: Cond; qty: number; photo: string | null; notes: string; pn?: string };
type CarOpt = { key: string; make: string; model: string; year: number; vin: string; powertrain: string };
const item = (part: string): Item => ({ key: newId(), part, side: '', cond: 'any', qty: 1, photo: null, notes: '', pn: '' });

const CATALOG: { part: string; icon: string }[] = [
  { part: 'فانوس أمامي', icon: 'car-light-high' }, { part: 'فانوس خلفي', icon: 'car-light-dimmed' }, { part: 'مراية جنب', icon: 'mirror' },
  { part: 'رديتر', icon: 'radiator' }, { part: 'كمبروسر تكييف', icon: 'air-conditioner' }, { part: 'طقم دبرياج', icon: 'car-clutch' },
  { part: 'تيل فرامل', icon: 'car-brake-alert' }, { part: 'دينامو', icon: 'car-battery' }, { part: 'مارش', icon: 'engine' },
  { part: 'رفرف', icon: 'car-door' }, { part: 'اكصدام أمامي', icon: 'car-side' }, { part: 'مساعدين', icon: 'car-cog' },
];
/** Category part lists (Product Register A13): tapping a category on home opens its parts. */
const CATEGORY_PARTS: Record<string, { parts: string[]; icon: string }> = {
  'فوانيس': { icon: 'car-light-high', parts: ['فانوس أمامي', 'فانوس خلفي', 'كشاف ضباب', 'إشارة'] },
  'مرايات': { icon: 'mirror', parts: ['مراية جنب', 'إزاز مراية', 'مراية جوه'] },
  'رديتر': { icon: 'radiator', parts: ['رديتر', 'مروحة رديتر', 'طرمبة مية', 'خرطوم رديتر'] },
  'تكييف': { icon: 'air-conditioner', parts: ['كمبروسر تكييف', 'رديتر تكييف', 'مروحة تكييف'] },
  'فرامل': { icon: 'car-brake-alert', parts: ['تيل فرامل', 'ديسك فرامل', 'طنابير', 'طرمبة فرامل'] },
  'دبرياج': { icon: 'car-clutch', parts: ['طقم دبرياج', 'بلية دبرياج', 'طرمبة دبرياج'] },
  'كهرباء': { icon: 'car-battery', parts: ['دينامو', 'مارش', 'بطارية', 'كويل'] },
  'صاج': { icon: 'car-door', parts: ['رفرف', 'اكصدام أمامي', 'اكصدام خلفي', 'كبوت', 'باب'] },
  'كهربا وهايبرد': { icon: 'car-electric', parts: ['بطارية الجهد العالي', 'موتور كهربا', 'إنفرتر', 'شاحن العربية', 'مخرج الشحن', 'نظام إدارة البطارية BMS', 'تبريد البطارية', 'كمبيوتر العربية', 'حساسات'] },
};
/** EV and hybrid parts, shown first for electrified cars. */
const EV_PARTS: { part: string; icon: string }[] = [
  { part: 'بطارية الجهد العالي', icon: 'battery-high' }, { part: 'موتور كهربا', icon: 'engine' }, { part: 'إنفرتر', icon: 'flash' },
  { part: 'شاحن العربية', icon: 'ev-station' }, { part: 'مخرج الشحن', icon: 'ev-plug-type2' }, { part: 'نظام إدارة البطارية BMS', icon: 'chip' },
];
/** Names people type in English or other words for the same part. */
const ALIASES: Record<string, string> = {
  headlight: t('فانوس أمامي'), 'head light': t('فانوس أمامي'), taillight: t('فانوس خلفي'), mirror: t('مراية جنب'), radiator: t('رديتر'), 'ac compressor': t('كمبروسر تكييف'),
  compressor: t('كمبروسر تكييف'), clutch: t('طقم دبرياج'), brake: t('تيل فرامل'), 'brake pads': t('تيل فرامل'), alternator: t('دينامو'), starter: t('مارش'), battery: t('بطارية'),
  fender: t('رفرف'), bumper: t('اكصدام أمامي'), shock: t('مساعدين'), 'shock absorber': t('مساعدين'), hood: t('كبوت'), door: t('باب'), inverter: t('إنفرتر'), charger: t('شاحن العربية'),
  'دينمو': t('دينامو'), 'رادياتير': t('رديتر'), 'ردياتير': t('رديتر'), 'بطاريه': t('بطارية'), 'شكمان': t('شكمان'), 'كشاف': t('كشاف ضباب'), 'مرايه': t('مراية جنب'), 'صدام': t('اكصدام أمامي'),
};
/** Looks like a part/OEM number: letters and digits, at least 5, with digits in it. */
const looksLikePartNo = (t: string) => /^[A-Za-z0-9\-\s.]{5,}$/.test(t.trim()) && /\d{3,}/.test(t);
const iconOf = (p: string) => CATALOG.find((c) => c.part === p)?.icon ?? Object.values(CATEGORY_PARTS).find((c) => c.parts.includes(p))?.icon ?? 'car-wrench';
const DRAFT = 'daghta-request-draft';
const DAY = 86400000;
/** Side choices for parts that come in pairs. */
const SIDE_OPTS = [{ v: 'right', label: t('يمين') }, { v: 'left', label: t('شمال') }, { v: 'both', label: t('الاتنين') }];

/** New price request, one step per screen: parts → details → car and timing → review. */
export default function NewRequest() {
  const { ready, session, profile } = useAuth();
  const params = useLocalSearchParams<{ part?: string; cond?: string; notes?: string; side?: string; cat?: string }>();
  const str = (v: unknown) => (typeof v === 'string' ? v : '');
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState(0);
  const [items, setItems] = useState<Item[]>(() => {
    const p = str(params.part);
    if (!p) return [];
    const cond = str(params.cond);
    return [{ ...item(p), notes: str(params.notes), side: Object.keys(SIDES).includes(str(params.side)) ? str(params.side) : '', cond: (['used', 'new', 'any'].includes(cond) ? cond : 'any') as Cond }];
  });
  const cat = CATEGORY_PARTS[str(params.cat)] ? str(params.cat) : '';
  const [q, setQ] = useState('');
  const urgency = 'normal'; // every request is treated as fast; no "when do you need it" question
  const [carKey, setCarKey] = useState('main');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ items: Item[]; carKey: string } | null>(null);
  const slide = useRef(new Animated.Value(0)).current;
  const uid = session?.user.id;
  const { data: extra } = useLive(async () => (uid ? (must(await supabase.from('cars').select('*').eq('owner_id', uid).order('created_at')) as Car[]) : []), ['cars'], [uid]);

  // an unfinished request is kept for 24 hours (photos are not kept)
  useEffect(() => {
    if (str(params.part) || cat) return;
    AsyncStorage.getItem(DRAFT).then((raw) => {
      if (!raw) return;
      const d = JSON.parse(raw) as { at: number; uid: string; items: Item[]; carKey: string };
      if (d.uid === uid && Date.now() - d.at < DAY && d.items?.length) setDraft(d);
      else AsyncStorage.removeItem(DRAFT);
    }).catch(() => {});
  }, [uid]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!uid || draft || !items.length) return;
    AsyncStorage.setItem(DRAFT, JSON.stringify({ at: Date.now(), uid, carKey, items: items.map((x) => ({ ...x, photo: null })) })).catch(() => {});
  }, [items, carKey, uid, draft]);

  useEffect(() => {
    slide.setValue(1);
    Animated.timing(slide, { toValue: 0, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: Platform.OS !== 'web' }).start();
  }, [step, slide]);

  if (ready && !session) return <Redirect href="/login" />;
  if (!profile) return <View style={{ flex: 1, backgroundColor: colors.ground, padding: 20 }}><Loading /></View>;
  const cars: CarOpt[] = [
    { key: 'main', make: profile.car_make ?? '', model: profile.car_model ?? '', year: profile.car_year ?? 0, vin: profile.car_vin ?? '', powertrain: profile.car_powertrain ?? '' },
    ...(extra ?? []).map((c) => ({ key: c.id, make: c.make, model: c.model, year: c.year, vin: c.vin, powertrain: c.powertrain ?? '' })),
  ];
  const car = cars.find((c) => c.key === carKey) ?? cars[0];
  // with one car there is nothing to choose: the car step is skipped (A13)
  const STEPS = cars.length > 1 ? [t('القطع'), t('التفاصيل'), t('العربية'), t('المراجعة')] : [t('القطع'), t('التفاصيل'), t('المراجعة')];
  const last = STEPS.length - 1;
  const kind = step === last ? 'review' : step === 0 ? 'parts' : step === 1 ? 'details' : 'car';
  const upd = (key: string, p: Partial<Item>) => setItems((xs) => xs.map((x) => (x.key === key ? { ...x, ...p } : x)));
  const add = (part: string) => {
    let name = part.trim();
    if (name.length < 2) return;
    // a part number typed in the search becomes a part with that number attached
    if (looksLikePartNo(name)) {
      const pn = name.toUpperCase();
      if (items.some((x) => x.pn === pn)) return toast(t('رقم القطعة ده موجود في الطلب.'));
      setItems((xs) => [...xs, { ...item(t('قطعة رقم {0}', pn)), pn }]); setQ(''); return;
    }
    name = ALIASES[name.toLowerCase()] ?? name;
    if (items.some((x) => x.part === name)) return toast(t('القطعة دي موجودة في الطلب.'));
    setItems((xs) => [...xs, item(name)]); setQ('');
  };
  const leave = () => (router.canGoBack() ? router.back() : router.replace('/customer'));

  async function send() {
    setErr(null);
    setBusy(true);
    try {
      const batch = items.length > 1 ? newId() : null;
      const rows = [];
      for (const it of items) {
        let photo_path: string | null = null;
        if (it.photo) {
          try { photo_path = await uploadPhoto(it.photo, profile!.id); }
          catch { setBusy(false); upd(it.key, { photo: null }); return setErr(t('الصورة مااترفعتش. جرّب تاني أو ابعت من غير صورة.')); }
        }
        rows.push({
          customer_id: profile!.id, part: it.part, qty: it.qty, car_make: car.make, car_model: car.model, car_year: car.year, vin: car.vin, powertrain: car.powertrain, part_number: (it.pn ?? '').trim().toUpperCase(),
          wanted_condition: it.cond, side: partIsSided(it.part) ? it.side : '', urgency, budget: null,
          area: profile!.area, notes: it.notes.trim(), photo_path, batch_id: batch,
        });
      }
      const { data, error } = await supabase.from('requests').insert(rows).select('id, num');
      if (error) throw error;
      const first = [...(data ?? [])].sort((a, b) => a.num - b.num)[0];
      AsyncStorage.removeItem(DRAFT).catch(() => {});
      toast(t('طلب {0} اتبعت للمحلات', reqNo(first.num)));
      router.replace(`/customer/${first.id}`);
    } catch (x) {
      const m = friendlyError(x);
      setErr(m === t('حصلت مشكلة. جرّب تاني.') ? t('الطلب مااتبعتش. اتأكد من النت وجرّب تاني.') : m);
    }
    finally { setBusy(false); }
  }

  const canNext = step === 0 ? items.length > 0 : true;
  const next = () => (step < last ? setStep(step + 1) : send());
  const electric = isElectrified(car.powertrain);
  const all = [...(electric ? EV_PARTS : []), ...CATALOG, ...Object.values(CATEGORY_PARTS).flatMap((c) => c.parts.map((part) => ({ part, icon: c.icon })))]
    .filter((c, i, xs) => xs.findIndex((y) => y.part === c.part) === i);
  const pool = cat && !q.trim() ? CATEGORY_PARTS[cat].parts.map((part) => ({ part, icon: iconOf(part) })) : all;
  const typed = q.trim().toLowerCase();
  const alias = Object.entries(ALIASES).filter(([k]) => typed.length > 2 && k.startsWith(typed)).map(([, v]) => v);
  const suggestions = pool.filter((c) => !items.some((x) => x.part === c.part) && (!typed || matches(typed, c.part) || alias.includes(c.part))).slice(0, 12);

  if (draft) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.ground, padding: 24, paddingTop: insets.top + 60, alignItems: 'center', gap: 16 }}>
        <Icon name="document-text" size={44} color={colors.accentDeep} />
        <T w="bold" size={20} center>{t('عندك طلب ماكملتهوش. نكمّله؟')}</T>
        <Muted center>{draft.items.map((x) => x.part).join(t('، '))}</Muted>
        <View style={{ width: '100%', maxWidth: 400, gap: 10 }}>
          <Btn title={t('كمّل')} onPress={() => { setItems(draft.items); setCarKey(draft.carKey); setDraft(null); }} />
          <Btn kind="secondary" title={t('ابدأ جديد')} onPress={() => { AsyncStorage.removeItem(DRAFT).catch(() => {}); setDraft(null); }} />
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.ground }}>
      {/* top: close, progress, step title */}
      <View style={{ paddingTop: insets.top + 8, backgroundColor: colors.ground }}>
        <View style={{ width: '100%', maxWidth: 560, alignSelf: 'center', paddingHorizontal: 18, gap: 14 }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <IconButton name={step ? 'chevron-forward' : 'close'} label={step ? t('رجوع') : t('اقفل')} onPress={() => (step ? setStep(step - 1) : leave())} />
            <T w="semibold" size={14} color={colors.muted}>{t('خطوة')}{' '}{ar(step + 1)} {t('من')}{' '}{ar(STEPS.length)}</T>
            <Press onPress={() => router.push({ pathname: '/assistant', params: { mode: 'request' } })} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Icon name="sparkles" size={15} color={colors.accentDeep} /><T size={13} w="medium" color={colors.accentDeep}>{t('بالمساعد')}</T>
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
          {kind === 'parts' ? (
            <>
              <T w="bold" size={28} style={{ lineHeight: 38, letterSpacing: -0.4 }}>{t('ناقصك إيه؟')}</T>
              <Muted size={14} style={{ marginTop: -10 }}>{t('ممكن تضيف أكتر من قطعة في نفس الطلب، وكل محل بيبعت عرض على اللي عنده.')}</Muted>
              <View style={[{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.surface, borderRadius: 18, paddingStart: 16, paddingEnd: 6, height: 58 }, lift]}>
                <Icon name="search" size={20} color={colors.faint} />
                <TextInput value={q} onChangeText={setQ} placeholder={t('اسم القطعة')} placeholderTextColor={colors.faint} onSubmitEditing={() => add(q)} returnKeyType="done"
                  style={[{ flex: 1, fontFamily: fonts.medium, fontSize: 16, color: colors.ink, textAlign: startAlign() }, { outlineStyle: 'none' } as any]} />
                {q.trim().length > 1 ? <Btn kind="small" title={t('ضيف')} icon="add" onPress={() => add(q)} style={{ alignSelf: 'center' }} /> : null}
              </View>
              {items.length ? (
                <View style={{ gap: 8 }}>
                  {items.map((it) => (
                    <View key={it.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.ink, borderRadius: 18, padding: 12 }}>
                      <View style={{ width: 42, height: 42, borderRadius: 12, backgroundColor: 'rgba(255,255,255,.1)', alignItems: 'center', justifyContent: 'center' }}>
                        <Icon set="mci" name={iconOf(it.part)} size={22} color={colors.accent} />
                      </View>
                      <T w="semibold" size={15} color="#fff" style={{ flex: 1 }}>{t(it.part)}</T>
                      <Press onPress={() => setItems((xs) => xs.filter((x) => x.key !== it.key))} label={t('شيل القطعة')} hitSlop={8}><Icon name="close-circle" size={22} color="rgba(255,255,255,.6)" /></Press>
                    </View>
                  ))}
                </View>
              ) : null}
              <T w="semibold" size={14} color={colors.muted}>{q.trim() ? t('اقتراحات') : cat ? t('قطع {0}', t(cat)) : t('الأكتر طلباً')}</T>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                {suggestions.map((c) => (
                  <Press key={c.part} onPress={() => add(c.part)} label={c.part}
                    style={[{ width: '31%', flexGrow: 1, backgroundColor: colors.surface, borderRadius: 18, paddingVertical: 14, alignItems: 'center', gap: 8 }, lift]}>
                    <View style={{ width: 46, height: 46, borderRadius: 14, backgroundColor: colors.soft, alignItems: 'center', justifyContent: 'center' }}>
                      <Icon set="mci" name={c.icon} size={24} />
                    </View>
                    <T size={12.5} w="medium" center numberOfLines={1}>{t(c.part)}</T>
                  </Press>
                ))}
              </View>
            </>
          ) : kind === 'details' ? (
            <>
              <T w="bold" size={28} style={{ lineHeight: 38, letterSpacing: -0.4 }}>{t('تفاصيل القطع')}</T>
              <Muted size={14} style={{ marginTop: -10 }}>{t('التفاصيل الأوضح بتجيب سعر أدق، والصورة بتفرق جداً.')}</Muted>
              {items.map((it, i) => (
                <View key={it.key} style={[{ backgroundColor: colors.surface, borderRadius: 18, padding: 16, gap: 14 }, lift]}>
                  <Row gap={10}>
                    <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' }}><T size={12} w="bold" style={{ lineHeight: 16 }}>{ar(i + 1)}</T></View>
                    <T w="bold" size={17} style={{ flex: 1 }}>{t(it.part)}</T>
                    <Row gap={10}>
                      <Press onPress={() => upd(it.key, { qty: Math.max(1, it.qty - 1) })} label={t('أقل')} style={qtyBtn}><Icon name="remove" size={16} /></Press>
                      <T w="bold" size={16}>{ar(it.qty)}</T>
                      <Press onPress={() => upd(it.key, { qty: Math.min(20, it.qty + 1) })} label={t('أكتر')} style={qtyBtn}><Icon name="add" size={16} /></Press>
                    </Row>
                  </Row>
                  {partIsSided(it.part) ? <Chips options={SIDE_OPTS} selected={[it.side]} onPick={(v) => upd(it.key, { side: it.side === v ? '' : v })} /> : null}
                  <Seg options={[{ v: 'any', label: t('جديد أو مستعمل') }, { v: 'used', label: t('مستعمل بس') }, { v: 'new', label: t('جديد بس') }]} value={it.cond} onPick={(v) => upd(it.key, { cond: v as Cond })} />
                  <Press onPress={async () => { try { const uri = await pickPhoto(); if (uri) upd(it.key, { photo: uri }); } catch { toast(t('الصورة دي مش مدعومة. اختار صورة JPG أو PNG.')); } }}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: 16, borderWidth: 1.5, borderStyle: 'dashed', borderColor: it.photo ? colors.good : colors.line }}>
                    {it.photo ? <Image source={{ uri: it.photo }} style={{ width: 44, height: 44, borderRadius: 10 }} /> : (
                      <View style={{ width: 44, height: 44, borderRadius: 10, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' }}><Icon name="camera" size={20} color={colors.accentDeep} /></View>
                    )}
                    <T size={13.5} w="medium" style={{ flex: 1 }}>{it.photo ? t('الصورة اتضافت · تغيير') : t('صوّر القطعة القديمة (اختياري)')}</T>
                  </Press>
                  <Field value={it.notes} onChangeText={(v) => upd(it.key, { notes: v })} placeholder={t('ملاحظة للمحل (اختياري)')} />
                  <Field value={it.pn ?? ''} onChangeText={(v) => upd(it.key, { pn: v })} ltr placeholder={t('رقم القطعة / OEM (اختياري)')} />
                </View>
              ))}
            </>
          ) : kind === 'car' ? (
            <>
              <T w="bold" size={28} style={{ lineHeight: 38, letterSpacing: -0.4 }}>{t('لأنهي عربية؟')}</T>
              <View style={{ gap: 10 }}>
                {cars.map((c) => {
                  const on = c.key === car.key;
                  return (
                    <Press key={c.key} onPress={() => setCarKey(c.key)} selected={on}
                      style={[lift, { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: colors.surface, borderRadius: 20, padding: 14, borderWidth: 2, borderColor: on ? colors.ink : colors.line }]}>
                      <Plate top={c.model || '—'} bottom={ar(c.year)} />
                      <View style={{ flex: 1 }}><T w="semibold" size={15}>{c.make} {c.model}</T>{c.vin ? <Muted size={12}>{t('شاسيه')}{' '}{c.vin}</Muted> : null}</View>
                      <Icon name={on ? 'radio-button-on' : 'radio-button-off'} size={22} color={on ? colors.ink : colors.faint} />
                    </Press>
                  );
                })}
                <Btn kind="secondary" icon="add" title={t('أضف عربية')} onPress={() => router.push('/cars')} />
              </View>
            </>
          ) : (
            <>
              <T w="bold" size={28} style={{ lineHeight: 38, letterSpacing: -0.4 }}>{t('مراجعة الطلب')}</T>
              <View style={[{ backgroundColor: colors.surface, borderRadius: 18, overflow: 'hidden' }, lift]}>
                <View style={{ backgroundColor: colors.ink, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <Plate top={car.model || '—'} bottom={ar(car.year)} size="sm" />
                  <View style={{ flex: 1 }}>
                    <T w="semibold" color="#fff">{car.make} {car.model}</T>
                    <T size={12.5} color="rgba(255,255,255,.7)">{profile.area}</T>
                  </View>
                  {cars.length > 1 ? <Press onPress={() => setStep(2)} label={t('تغيير')}><T size={13} w="semibold" color={colors.accent}>{t('تغيير')}</T></Press> : null}
                </View>
                {items.map((it, i) => (
                  <View key={it.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderTopWidth: i ? 1 : 0, borderColor: colors.line }}>
                    {it.photo ? <Image source={{ uri: it.photo }} style={{ width: 44, height: 44, borderRadius: 12 }} /> : (
                      <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: colors.soft, alignItems: 'center', justifyContent: 'center' }}><Icon set="mci" name={iconOf(it.part)} size={22} /></View>
                    )}
                    <View style={{ flex: 1 }}>
                      <T w="semibold" size={14.5}>{t(it.part)}{it.qty > 1 ? ` × ${ar(it.qty)}` : ''}</T>
                      <Muted size={12}>{[WANTED[it.cond], partIsSided(it.part) && it.side ? SIDES[it.side] : '', it.notes].filter(Boolean).join(t('، '))}</Muted>
                    </View>
                  </View>
                ))}
              </View>
              <Row gap={10} style={{ alignItems: 'flex-start', backgroundColor: colors.accentSoft, borderRadius: 18, padding: 14 }}>
                <Icon name="shield-checkmark" size={20} color={colors.accentDeep} />
                <T size={13} style={{ flex: 1 }}>{t('طلبك بيروح لمحلات')}{' '}{car.make} {t('اللي راجعناها بس. رقمك وعنوانك مش بيظهروا غير للمحل اللي هتشتري منه.')}</T>
              </Row>
              <ErrorText text={err} />
            </>
          )}
        </Animated.View>
      </ScrollView>

      <View style={[{ backgroundColor: colors.surface, paddingTop: 12, paddingBottom: insets.bottom + 12, borderTopLeftRadius: 24, borderTopRightRadius: 24 }, lift]}>
        <View style={{ width: '100%', maxWidth: 560, alignSelf: 'center', paddingHorizontal: 18 }}>
          <Btn kind={step === last ? 'accent' : 'primary'} icon={step === last ? 'paper-plane' : 'arrow-back'} loading={busy} disabled={!canNext}
            title={step === 0 ? (items.length ? t('التالي · {0} {1}', ar(items.length), items.length > 1 ? 'قطع' : 'قطعة') : t('ضيف قطعة الأول')) : step === last ? t('ابعت للمحلات') : t('التالي')}
            onPress={next} />
        </View>
      </View>
      <ToastHost bottom={100} />
    </View>
  );
}

const qtyBtn = { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.soft, alignItems: 'center' as const, justifyContent: 'center' as const };

import * as Location from 'expo-location';
import { Redirect, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Image, Linking, Pressable, Text, View } from 'react-native';
import {
  BackBar, Btn, Chips, ErrorText, Field, Icon, Labeled, Loading, Muted, Notice, Press, Row, Screen, Seg, Select, T, toast,
} from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { GOVERNORATES, MAKES, SHOP_TYPES, SPECIALTIES, WEEKDAYS, ar, friendlyError, toLatin, validPhone, type ShopHours } from '@/lib/data';
import { MERCHANT_VERSION } from '@/lib/legal';
import { pickPhoto, uploadPhoto } from '@/lib/photos';
import { photoUrl, supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';

/** The five sign-up steps (Product Register B01, B02, B13, B14, B23). Each step is saved on «التالي». */
const STEPS = ['المحل', 'المكان والمواعيد', 'الشغل والتوصيل', 'الدفع', 'المستندات والاتفاقية'];
const HOURS = Array.from({ length: 19 }, (_, i) => `${String(i + 6).padStart(2, '0')}:00`); // 06:00 … 24:00
const hourLabel = (h: string) => { const n = parseInt(h, 10); return n === 24 || n === 0 ? '١٢ بالليل' : n === 12 ? '١٢ الضهر' : n < 12 ? `${ar(n)} الصبح` : `${ar(n - 12)} ${n < 17 ? 'العصر' : 'بالليل'}`; };
type Docs = { doc_id_front: string | null; doc_id_back: string | null; doc_register: string | null; doc_tax: string | null };
const DOCS: { k: keyof Docs; label: string; optional?: boolean }[] = [
  { k: 'doc_id_front', label: 'البطاقة الشخصية (وش)' },
  { k: 'doc_id_back', label: 'البطاقة الشخصية (ضهر)' },
  { k: 'doc_register', label: 'السجل التجاري أو رخصة المحل' },
  { k: 'doc_tax', label: 'البطاقة الضريبية (لو موجودة)', optional: true },
];
/** What submit_shop says is missing, in the approved words. */
const NEED: Record<string, [string, number]> = {
  name: ['اكتب اسم المحل.', 0], owner: ['اكتب اسم صاحب المحل بالكامل.', 0], address: ['اكتب المنطقة والشارع.', 1], map: ['حدّد المحل على الخريطة.', 1],
  specialty: ['اختار تخصص واحد على الأقل.', 2], brand: ['اختار ماركة واحدة على الأقل.', 2], fees: ['اكتب سعر التوصيل لنفس المنطقة ونفس المحافظة.', 2],
  'payout name': ['اكتب اسم صاحب حساب التحويل.', 3], documents: ['ارفع صورة البطاقة والسجل أو الرخصة.', 4], agreement: ['لازم توافق على الاتفاقية.', 4],
};

export default function ShopSetup() {
  const { ready, session, profile, shop, shopPrivate, refresh } = useAuth();
  const [step, setStep] = useState(0);
  const [f, setF] = useState({
    name: '', owner: '', phone2: '', photo: null as string | null, photoPath: null as string | null,
    governorate: 'القاهرة', area: '', street: '', building: '', landmark: '', lat: null as number | null, lng: null as number | null,
    hours: { open: '10:00', close: '22:00', off: [5] } as ShopHours,
    type: 'used' as 'used' | 'new' | 'both', specialties: [] as string[], brands: [] as string[], delivery: false, feeArea: '', feeCity: '', feeFar: '',
    instapay: '', wallet: '', payoutName: '',
    docs: { doc_id_front: null, doc_id_back: null, doc_register: null, doc_tax: null } as Docs, agreed: false,
  });
  const set = <K extends keyof typeof f>(k: K) => (v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const toggle = (k: 'brands' | 'specialties') => (v: string) => setF((x) => ({ ...x, [k]: x[k].includes(v) ? x[k].filter((y) => y !== v) : [...x[k], v] }));
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setF((x) => ({
      ...x,
      ...(profile && !shopPrivate ? { owner: profile.full_name || '' } : {}),
      ...(shopPrivate ? {
        name: shopPrivate.name, owner: shopPrivate.owner_name, phone2: shopPrivate.phone2 || '',
        street: shopPrivate.street || '', building: shopPrivate.building || '', landmark: shopPrivate.landmark || '',
        instapay: shopPrivate.instapay_address || '', wallet: shopPrivate.wallet_number || '', payoutName: shopPrivate.payout_name || '',
        docs: { doc_id_front: shopPrivate.doc_id_front ?? null, doc_id_back: shopPrivate.doc_id_back ?? null, doc_register: shopPrivate.doc_register ?? null, doc_tax: shopPrivate.doc_tax ?? null },
      } : {}),
      ...(shop ? {
        governorate: shop.governorate || 'القاهرة', area: shop.area, type: shop.shop_type || 'used', specialties: shop.specialties || [],
        brands: shop.brands, delivery: !!shop.offers_delivery, lat: shop.lat ?? null, lng: shop.lng ?? null, photoPath: shop.photo_path ?? null,
        hours: shop.hours ?? x.hours, agreed: shop.agreement_version === MERCHANT_VERSION,
        feeArea: shop.fee_area != null ? String(Number(shop.fee_area)) : '', feeCity: shop.fee_city != null ? String(Number(shop.fee_city)) : '', feeFar: shop.fee_far != null ? String(Number(shop.fee_far)) : '',
      } : {}),
    }));
  }, [shop?.id, shopPrivate?.id, profile?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (ready && !session) return <Redirect href="/login" />;
  if (!profile) return <Screen><Loading /></Screen>;
  const uid = profile.id;
  const editing = shop?.status === 'approved' || shop?.status === 'suspended';
  const last = STEPS.length - 1;

  /** Checks one step before it is saved; returns the approved error text. */
  function check(i: number): string | null {
    if (i === 0) {
      if (!f.name.trim()) return 'اكتب اسم المحل.';
      if (f.owner.trim().split(/\s+/).length < 2) return 'اكتب اسم صاحب المحل بالكامل.';
      if (f.phone2.trim() && !validPhone(toLatin(f.phone2))) return 'الرقم التاني لازم يكون ١١ رقم ويبدأ بـ٠١.';
    }
    if (i === 1) {
      if (!f.area.trim() || !f.street.trim()) return 'اكتب المنطقة والشارع.';
      if (f.lat == null) return 'حدّد المحل على الخريطة.';
    }
    if (i === 2) {
      if (!f.specialties.length) return 'اختار تخصص واحد على الأقل.';
      if (!f.brands.length) return 'اختار ماركة واحدة على الأقل.';
      if (f.delivery && (!f.feeArea.trim() || !f.feeCity.trim())) return 'اكتب سعر التوصيل لنفس المنطقة ونفس المحافظة.';
    }
    if (i === 3 && (f.instapay.trim() || f.wallet.trim()) && !f.payoutName.trim()) return 'اكتب اسم صاحب حساب التحويل.';
    if (i === 4) {
      if (!f.docs.doc_id_front || !f.docs.doc_id_back || !f.docs.doc_register) return 'ارفع صورة البطاقة والسجل أو الرخصة.';
      if (!f.agreed) return 'لازم توافق على الاتفاقية.';
    }
    return null;
  }

  /** Saves one step to the shop (a new shop is created as a draft on the first step). */
  async function save(i: number) {
    const fee = (t: string) => { const n = parseFloat(toLatin(t).trim()); return t.trim() && !isNaN(n) ? n : null; };
    if (!shop) {
      const c = await supabase.from('profiles').update({ is_shop: true, full_name: profile!.full_name || f.owner.trim() }).eq('id', uid);
      if (c.error) throw c.error;
      const a = await supabase.from('shops').insert({ id: uid, area: '', governorate: f.governorate, brands: [], specialties: [], shop_type: 'used' });
      if (a.error) throw a.error;
      const b = await supabase.from('shop_private').insert({ id: uid, name: f.name.trim(), owner_name: f.owner.trim(), phone: profile!.phone || '' });
      if (b.error) throw b.error;
    }
    let pub: Record<string, unknown> = {};
    let priv: Record<string, unknown> = {};
    if (i === 0) {
      let photo_path = f.photoPath;
      if (f.photo) { photo_path = await uploadPhoto(f.photo, uid); setF((x) => ({ ...x, photo: null, photoPath: photo_path })); }
      pub = { photo_path };
      priv = { name: f.name.trim(), owner_name: f.owner.trim(), phone: profile!.phone || '', phone2: toLatin(f.phone2).replace(/\s/g, '') };
    }
    if (i === 1) {
      pub = { governorate: f.governorate, area: f.area.trim(), lat: f.lat, lng: f.lng, hours: f.hours };
      priv = { street: f.street.trim(), building: f.building.trim(), landmark: f.landmark.trim() };
    }
    if (i === 2) {
      pub = { shop_type: f.type, specialties: f.specialties, brands: f.brands, offers_delivery: f.delivery,
        fee_area: f.delivery ? fee(f.feeArea) : null, fee_city: f.delivery ? fee(f.feeCity) : null, fee_far: f.delivery ? fee(f.feeFar) : null };
    }
    if (i === 3) priv = { instapay_address: f.instapay.trim(), wallet_number: toLatin(f.wallet).replace(/\s/g, ''), payout_name: f.payoutName.trim() };
    if (i === 4) {
      priv = { ...f.docs };
      if (f.agreed && shop?.agreement_version !== MERCHANT_VERSION) {
        const g = await supabase.rpc('accept_merchant_agreement', { p_version: MERCHANT_VERSION });
        if (g.error) throw g.error;
      }
    }
    if (Object.keys(pub).length) { const a = await supabase.from('shops').update(pub).eq('id', uid); if (a.error) throw a.error; }
    if (Object.keys(priv).length) { const b = await supabase.from('shop_private').update(priv).eq('id', uid); if (b.error) throw b.error; }
    await refresh();
  }

  async function next() {
    setErr(null);
    const bad = check(step);
    if (bad) return setErr(bad);
    setBusy('next');
    try {
      await save(step);
      if (editing) { toast('اتحفظ.'); setBusy(null); return; }
      if (step < last) { setStep(step + 1); setBusy(null); return; }
      const { error } = await supabase.rpc('submit_shop');
      if (error) {
        const need = /need: ([a-z ]+)/.exec(error.message)?.[1];
        if (need && NEED[need]) { setErr(NEED[need][0]); setStep(NEED[need][1]); setBusy(null); return; }
        throw error;
      }
      await refresh();
      toast('اتبعت للمراجعة. هنبلّغك خلال يومين عمل.');
      router.replace('/shop');
    } catch (x) { setErr(friendlyError(x)); }
    setBusy(null);
  }

  async function locate() {
    setBusy('map');
    try {
      const p = await Location.requestForegroundPermissionsAsync();
      if (p.status !== 'granted') { toast('اسمح للتطبيق يعرف مكانك، وجرّب تاني وانت في المحل.'); setBusy(null); return; }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const { latitude: lat, longitude: lng } = pos.coords;
      if (lat < 21 || lat > 32.5 || lng < 24 || lng > 37.5) toast('المكان ده بره مصر. جرّب تاني وانت في المحل.');
      else setF((x) => ({ ...x, lat, lng }));
    } catch { toast('ماقدرناش نعرف مكانك. جرّب تاني وانت في المحل.'); }
    setBusy(null);
  }

  async function addDoc(k: keyof Docs) {
    try {
      const uri = await pickPhoto();
      if (!uri) return;
      setBusy(k);
      const path = await uploadPhoto(uri, uid, 'shop-docs');
      setF((x) => ({ ...x, docs: { ...x.docs, [k]: path } }));
    } catch { toast('الصورة دي مش مدعومة. اختار صورة JPG أو PNG.'); }
    setBusy(null);
  }

  const status = shop?.status;
  const footer = (
    <>
      <ErrorText text={err} />
      <Row gap={10}>
        {step > 0 && !editing ? <Btn kind="secondary" title="رجوع" onPress={() => { setErr(null); setStep(step - 1); }} style={{ minWidth: 100 }} /> : null}
        <Btn title={editing ? 'حفظ' : step < last ? 'التالي' : status === 'pending' ? 'حفظ' : 'ابعت المحل للمراجعة'} icon={!editing && step < last ? 'arrow-back' : undefined}
          loading={busy === 'next'} onPress={next} style={{ flex: 1 }} />
      </Row>
    </>
  );

  return (
    <Screen footer={footer}>
      <BackBar title={shop && status !== 'draft' ? 'بيانات المحل' : 'سجّل محلك'} onBack={() => (step && !editing ? setStep(step - 1) : router.canGoBack() ? router.back() : router.replace('/'))} />
      {status === 'pending' ? <Notice>محلك تحت المراجعة. تقدر تعدّل البيانات لحد ما نوافق.</Notice> : null}
      {status === 'changes' ? <Notice icon="alert-circle">محتاجين تعديل قبل الموافقة: «{shop?.review_note}» · عدّل وابعت تاني</Notice> : null}
      {!shop && step === 0 ? <Muted size={14}>بنراجع كل محل قبل ما يبدأ يستقبل طلبات. التسجيل بياخد حوالي ١٠ دقايق، والمراجعة خلال يومين عمل.</Muted> : null}

      {editing ? (
        <Row gap={8} style={{ flexWrap: 'wrap' }}>
          {STEPS.map((s, i) => (
            <Press key={s} onPress={() => { setErr(null); setStep(i); }} selected={i === step}
              style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: i === step ? colors.ink : colors.soft }}>
              <T size={13} w="semibold" color={i === step ? '#fff' : colors.ink}>{s}</T>
            </Press>
          ))}
        </Row>
      ) : (
        <View style={{ gap: 8 }}>
          <T w="semibold" size={13.5} color={colors.muted}>خطوة {ar(step + 1)} من {ar(STEPS.length)} · {STEPS[step]}</T>
          <Row gap={6}>{STEPS.map((s, i) => <View key={s} style={{ flex: 1, height: 5, borderRadius: 3, backgroundColor: i <= step ? colors.primary : colors.line }} />)}</Row>
        </View>
      )}

      {step === 0 ? (
        <View style={{ gap: 14 }}>
          <Field label="اسم المحل" value={f.name} onChangeText={set('name')} placeholder="مثلاً: محل الأمانة لقطع الغيار" />
          <Field label="اسم صاحب المحل بالكامل" value={f.owner} onChangeText={set('owner')} />
          <Labeled label="رقم الموبايل (اللي سجّلت بيه)">
            <View style={{ backgroundColor: colors.soft, borderRadius: 14, padding: 14 }}><T size={15} style={{ writingDirection: 'ltr', textAlign: 'right' }}>{profile.phone || '—'}</T></View>
          </Labeled>
          <Field label="رقم تاني للمحل (اختياري)" value={f.phone2} onChangeText={set('phone2')} keyboardType="phone-pad" ltr placeholder="01xxxxxxxxx" />
          <Muted size={12.5}>رقم المحل بيظهر للعملاء في صفحة المحل.</Muted>
          <Press onPress={async () => { try { const u = await pickPhoto(); if (u) set('photo')(u); } catch { toast('الصورة دي مش مدعومة. اختار صورة JPG أو PNG.'); } }}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: 16, borderWidth: 1.5, borderStyle: 'dashed', borderColor: f.photo || f.photoPath ? colors.good : colors.line }}>
            {f.photo || f.photoPath ? <Image source={{ uri: f.photo ?? photoUrl(f.photoPath)! }} style={{ width: 52, height: 52, borderRadius: 12 }} /> : (
              <View style={{ width: 52, height: 52, borderRadius: 12, backgroundColor: colors.soft, alignItems: 'center', justifyContent: 'center' }}><Icon name="storefront" size={22} /></View>
            )}
            <T size={14} w="medium" style={{ flex: 1 }}>{f.photo || f.photoPath ? 'الصورة اتضافت · تغيير' : 'صورة واجهة المحل أو اللوجو'}</T>
          </Press>
        </View>
      ) : step === 1 ? (
        <View style={{ gap: 14 }}>
          <Select label="المحافظة" value={f.governorate} options={GOVERNORATES.map((g) => ({ v: g, label: g }))} onPick={set('governorate')} />
          <Field label="المنطقة" value={f.area} onChangeText={set('area')} placeholder="مثلاً: التوفيقية" />
          <Field label="الشارع" value={f.street} onChangeText={set('street')} />
          <Field label="رقم المحل أو العمارة" value={f.building} onChangeText={set('building')} />
          <Field label="علامة مميزة (اختياري)" value={f.landmark} onChangeText={set('landmark')} />
          <Labeled label="حدّد مكان المحل على الخريطة">
            {f.lat != null && f.lng != null ? (
              <Row gap={10} style={{ backgroundColor: colors.goodSoft, borderRadius: 14, padding: 12 }}>
                <Icon name="location" size={20} color={colors.good} />
                <Pressable onPress={() => Linking.openURL(`https://www.google.com/maps?q=${f.lat},${f.lng}`)} style={{ flex: 1 }} accessibilityRole="link">
                  <T w="semibold" size={14} color={colors.good}>العنوان على الخريطة</T>
                </Pressable>
              </Row>
            ) : null}
            <Btn kind="secondary" icon="locate" title="استخدم مكاني الحالي" loading={busy === 'map'} onPress={locate} />
          </Labeled>
          <Labeled label="مواعيد العمل">
            <Row gap={10}>
              <View style={{ flex: 1 }}><Select label="من" value={f.hours.open} options={HOURS.map((h) => ({ v: h, label: hourLabel(h) }))} onPick={(v) => set('hours')({ ...f.hours, open: v })} /></View>
              <View style={{ flex: 1 }}><Select label="لـ" value={f.hours.close} options={HOURS.map((h) => ({ v: h, label: hourLabel(h) }))} onPick={(v) => set('hours')({ ...f.hours, close: v })} /></View>
            </Row>
            <Muted size={12.5}>نفس المواعيد كل يوم</Muted>
          </Labeled>
          <Labeled label="أيام الإجازة">
            <Chips options={WEEKDAYS.map((d, i) => ({ v: i, label: d }))} selected={f.hours.off}
              onPick={(d) => set('hours')({ ...f.hours, off: f.hours.off.includes(d) ? f.hours.off.filter((x) => x !== d) : [...f.hours.off, d] })} />
          </Labeled>
          <Muted size={12.5}>الطلبات اللي بتيجي والمحل مقفول بتستنّاك لحد ما تفتح.</Muted>
        </View>
      ) : step === 2 ? (
        <View style={{ gap: 18 }}>
          <Labeled label="نوع القطع">
            <Seg options={Object.entries(SHOP_TYPES).map(([v, label]) => ({ v: v as 'used' | 'new' | 'both', label }))} value={f.type} onPick={set('type')} />
          </Labeled>
          <Labeled label="التخصص"><Chips options={SPECIALTIES.map((s) => ({ v: s, label: s }))} selected={f.specialties} onPick={toggle('specialties')} /></Labeled>
          <Labeled label="الماركات اللي بتشتغل فيها"><Chips options={MAKES.map((m) => ({ v: m, label: m }))} selected={f.brands} onPick={toggle('brands')} /></Labeled>
          <Labeled label="التوصيل">
            <Seg options={[{ v: 'yes', label: 'بنوصّل' }, { v: 'no', label: 'استلام من المحل بس' }]} value={f.delivery ? 'yes' : 'no'} onPick={(v) => set('delivery')(v === 'yes')} />
            {f.delivery ? (
              <View style={{ gap: 10, marginTop: 6 }}>
                <Row style={{ alignItems: 'flex-start' }}>
                  <View style={{ flex: 1 }}><Field label="نفس المنطقة (ج.م)" value={f.feeArea} onChangeText={set('feeArea')} keyboardType="number-pad" ltr placeholder="40" /></View>
                  <View style={{ flex: 1 }}><Field label="نفس المحافظة (ج.م)" value={f.feeCity} onChangeText={set('feeCity')} keyboardType="number-pad" ltr placeholder="70" /></View>
                </Row>
                <Field label="محافظات تانية (ج.م، سيبه فاضي لو مش بتوصّل بره المحافظة)" value={f.feeFar} onChangeText={set('feeFar')} keyboardType="number-pad" ltr />
                <Muted size={12.5}>العميل بيشوف سعر التوصيل المناسب لعنوانه تلقائي، وتقدر تغيّره لأي قطعة تقيلة وانت بتبعت العرض.</Muted>
              </View>
            ) : null}
          </Labeled>
        </View>
      ) : step === 3 ? (
        <View style={{ gap: 14 }}>
          <T w="bold" size={17}>استلام الفلوس بالتحويل (اختياري)</T>
          <Muted size={13.5}>لو حطيت بياناتك، العميل يقدر يحوّلك على InstaPay أو المحفظة مباشرة، وانت تأكّد إن الفلوس وصلت خلال ساعتين.</Muted>
          <Field label="عنوان InstaPay" value={f.instapay} onChangeText={set('instapay')} ltr placeholder="name@instapay" />
          <Field label="رقم المحفظة (فودافون كاش وغيرها)" value={f.wallet} onChangeText={set('wallet')} keyboardType="phone-pad" ltr placeholder="01xxxxxxxxx" />
          <Field label="اسم صاحب الحساب زي ما بيظهر للي بيحوّل" value={f.payoutName} onChangeText={set('payoutName')} />
          <Muted size={12.5}>البيانات دي بتظهر للعميل بس بعد ما يأكد الأوردر. لو غيّرتها بعدين، هيوصلك SMS للتأكيد.</Muted>
        </View>
      ) : (
        <View style={{ gap: 12 }}>
          {DOCS.map((d) => {
            const has = !!f.docs[d.k];
            return (
              <Press key={d.k} onPress={() => addDoc(d.k)} label={d.label}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 16, borderWidth: 1.5, borderStyle: 'dashed', borderColor: has ? colors.good : colors.line, backgroundColor: colors.surface }}>
                <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: has ? colors.goodSoft : colors.soft, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name={has ? 'checkmark-circle' : 'document-attach'} size={22} color={has ? colors.good : colors.ink} />
                </View>
                <T size={14} w="medium" style={{ flex: 1 }}>{d.label}</T>
                <T size={13} w="semibold" color={colors.primary}>{busy === d.k ? '…' : has ? 'تغيير' : 'ارفع'}</T>
              </Press>
            );
          })}
          <Muted size={12.5}>المستندات بيشوفها فريق المراجعة بس، ومش بتظهر لأي عميل.</Muted>
          <Press onPress={() => set('agreed')(!f.agreed)} selected={f.agreed} label="قريت ووافقت على اتفاقية التاجر"
            style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 8 }}>
            <Icon name={f.agreed ? 'checkbox' : 'square-outline'} size={22} color={f.agreed ? colors.primary : colors.muted} />
            <T size={14} style={{ flex: 1, lineHeight: 24 }}>
              قريت ووافقت على <Text onPress={() => router.push('/legal/merchant')} style={{ color: colors.primary, fontWeight: '600', textDecorationLine: 'underline' }}>«اتفاقية التاجر»</Text> والعمولة اللي فيها.
            </T>
          </Press>
        </View>
      )}
    </Screen>
  );
}

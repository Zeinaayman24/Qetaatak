import { Redirect, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { BackBar, Btn, Chips, ErrorText, Field, Labeled, Loading, Muted, Notice, Row, Screen, Section, Seg, Select, toast } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { GOVERNORATES, MAKES, SHOP_TYPES, SPECIALTIES, friendlyError, toLatin, validPhone, validPostal } from '@/lib/data';
import { supabase } from '@/lib/supabase';

/** Register a shop (sent for approval), or edit its details. */
export default function ShopSetup() {
  const { ready, session, profile, shop, shopPrivate, refresh } = useAuth();
  const [f, setF] = useState({
    name: '', owner: '', phone: '', phone2: '', governorate: 'القاهرة', area: '', street: '', building: '', landmark: '', postal: '',
    register: '', instapay: '', wallet: '', type: 'used' as 'used' | 'new' | 'both', specialties: [] as string[], brands: [] as string[], delivery: false, feeArea: '', feeCity: '', feeFar: '',
  });
  const set = (k: keyof typeof f) => (v: any) => setF((x) => ({ ...x, [k]: v }));
  const toggle = (k: 'brands' | 'specialties') => (v: string) => setF((x) => ({ ...x, [k]: x[k].includes(v) ? x[k].filter((y) => y !== v) : [...x[k], v] }));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setF((x) => ({
      ...x,
      ...(profile && !shopPrivate ? { owner: profile.full_name || '', phone: profile.phone || '' } : {}),
      ...(shopPrivate ? {
        name: shopPrivate.name, owner: shopPrivate.owner_name, phone: shopPrivate.phone, phone2: shopPrivate.phone2 || '',
        street: shopPrivate.street || '', building: shopPrivate.building || '', landmark: shopPrivate.landmark || '',
        postal: shopPrivate.postal_code || '', register: shopPrivate.commercial_register || '',
        instapay: shopPrivate.instapay_address || '', wallet: shopPrivate.wallet_number || '',
      } : {}),
      ...(shop ? {
        governorate: shop.governorate || 'القاهرة', area: shop.area, type: shop.shop_type || 'used', specialties: shop.specialties || [],
        brands: shop.brands, delivery: !!shop.offers_delivery,
        feeArea: shop.fee_area != null ? String(Number(shop.fee_area)) : '', feeCity: shop.fee_city != null ? String(Number(shop.fee_city)) : '', feeFar: shop.fee_far != null ? String(Number(shop.fee_far)) : '',
      } : {}),
    }));
  }, [shop?.id, shopPrivate?.id, profile?.id]);

  if (ready && !session) return <Redirect href="/login" />;
  if (!profile) return <Screen><Loading /></Screen>;

  async function save() {
    setErr(null);
    if (!f.name.trim()) return setErr('اكتب اسم المحل.');
    if (f.owner.trim().split(/\s+/).length < 2) return setErr('اكتب اسم صاحب المحل بالكامل.');
    if (!validPhone(toLatin(f.phone))) return setErr('رقم الموبايل الأساسي لازم يكون ١١ رقم ويبدأ بـ ٠١.');
    if (f.phone2.trim() && !validPhone(toLatin(f.phone2))) return setErr('الرقم التاني لازم يكون ١١ رقم ويبدأ بـ ٠١، أو سيبه فاضي.');
    if (!f.area.trim() || !f.street.trim()) return setErr('اكتب المنطقة واسم الشارع.');
    if (!validPostal(f.postal)) return setErr('الرقم البريدي لازم يكون ٥ أرقام.');
    if (!f.specialties.length) return setErr('اختار تخصص واحد على الأقل.');
    if (!f.brands.length) return setErr('اختار ماركة واحدة على الأقل.');
    if (f.delivery && (!f.feeArea.trim() || !f.feeCity.trim())) return setErr('اكتب سعر التوصيل لنفس المنطقة ولنفس المحافظة.');
    setBusy(true);
    try {
      const uid = profile!.id;
      const fee = (t: string) => { const n = parseFloat(toLatin(t).trim()); return t.trim() && !isNaN(n) ? n : null; };
      const pub = { area: f.area.trim(), governorate: f.governorate, shop_type: f.type, specialties: f.specialties, brands: f.brands, offers_delivery: f.delivery,
        fee_area: f.delivery ? fee(f.feeArea) : null, fee_city: f.delivery ? fee(f.feeCity) : null, fee_far: f.delivery ? fee(f.feeFar) : null };
      const priv = {
        name: f.name.trim(), owner_name: f.owner.trim(), phone: toLatin(f.phone).replace(/\s/g, ''), phone2: toLatin(f.phone2).replace(/\s/g, ''),
        street: f.street.trim(), building: f.building.trim(), landmark: f.landmark.trim(), postal_code: toLatin(f.postal.trim()), commercial_register: f.register.trim(),
        instapay_address: f.instapay.trim(), wallet_number: toLatin(f.wallet).replace(/\s/g, ''),
      };
      const c = await supabase.from('profiles').update({
        is_shop: true, email: session?.user.email ?? '', full_name: profile!.full_name || priv.owner_name, phone: profile!.phone || priv.phone,
      }).eq('id', uid);
      if (c.error) throw c.error;
      if (shop) {
        const a = await supabase.from('shops').update(pub).eq('id', uid); if (a.error) throw a.error;
        const b = await supabase.from('shop_private').update(priv).eq('id', uid); if (b.error) throw b.error;
      } else {
        const a = await supabase.from('shops').insert({ id: uid, ...pub }); if (a.error) throw a.error;
        const b = await supabase.from('shop_private').insert({ id: uid, ...priv }); if (b.error) throw b.error;
      }
      await refresh();
      toast(shop ? 'اتحفظت بيانات المحل' : 'اتبعت للمراجعة. هنبلغك أول ما نوافق.');
      router.replace('/shop');
    } catch (x) { setErr(friendlyError(x)); }
    finally { setBusy(false); }
  }

  return (
    <Screen footer={<><ErrorText text={err} /><Btn title={shop ? 'حفظ' : 'ابعت المحل للمراجعة'} onPress={save} loading={busy} /></>}>
      <BackBar title={shop ? 'بيانات المحل' : 'سجّل محلك'} onBack={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
      {shop?.status === 'pending' ? <Notice>محلك تحت المراجعة. تقدر تعدّل البيانات لحد ما نوافق.</Notice>
        : !shop ? <Muted size={14}>بنراجع كل محل قبل ما يبدأ يستقبل طلبات. اسم المحل بيظهر للعميل مع عروضك. أرقامك وعنوانك بالتفصيل بيظهروا بس بعد ما العميل يأكد الأوردر، وبيانات العميل كمان بتظهرلك بعد التأكيد.</Muted> : null}

      <Section title="المحل">
        <View style={{ gap: 14, marginTop: 8 }}>
          <Field label="اسم المحل" value={f.name} onChangeText={set('name')} placeholder="مثلاً: تشليح الأمانة" />
          <Field label="اسم صاحب المحل بالكامل" value={f.owner} onChangeText={set('owner')} placeholder="مثلاً: سيد محمود حسن" />
          <Field label="رقم الموبايل (واتساب)" value={f.phone} onChangeText={set('phone')} keyboardType="phone-pad" ltr placeholder="01xxxxxxxxx" />
          <Field label="رقم تاني (اختياري)" value={f.phone2} onChangeText={set('phone2')} keyboardType="phone-pad" ltr placeholder="01xxxxxxxxx" />
          <Field label="رقم السجل التجاري (اختياري)" value={f.register} onChangeText={set('register')} ltr hint="بيسرّع الموافقة على المحل." />
        </View>
      </Section>

      <Section title="عنوان المحل">
        <View style={{ gap: 14, marginTop: 8 }}>
          <Select label="المحافظة" value={f.governorate} options={GOVERNORATES.map((g) => ({ v: g, label: g }))} onPick={set('governorate')} />
          <Field label="المنطقة" value={f.area} onChangeText={set('area')} placeholder="مثلاً: التوفيقية" />
          <Field label="الشارع" value={f.street} onChangeText={set('street')} placeholder="مثلاً: شارع التوفيقية" />
          <Row style={{ alignItems: 'flex-start' }}>
            <View style={{ flex: 1 }}><Field label="رقم المحل / العمارة" value={f.building} onChangeText={set('building')} /></View>
            <View style={{ flex: 1 }}><Field label="الرقم البريدي" value={f.postal} onChangeText={set('postal')} keyboardType="number-pad" ltr placeholder="11511" /></View>
          </Row>
          <Field label="علامة مميزة (اختياري)" value={f.landmark} onChangeText={set('landmark')} placeholder="مثلاً: قصاد بنزينة …" />
        </View>
      </Section>

      <Section title="استلام الفلوس بالتحويل">
        <View style={{ gap: 14, marginTop: 8 }}>
          <Muted size={13}>لو حطيت بياناتك، العميل يقدر يحوّلك تمن الأوردر على InstaPay أو المحفظة ويرفع الإيصال، وانت تأكّد إن الفلوس وصلت. البيانات دي بتظهر للعميل بعد ما يأكد الأوردر بس.</Muted>
          <Field label="عنوان InstaPay (اختياري)" value={f.instapay} onChangeText={set('instapay')} ltr placeholder="name@instapay" icon="phone" />
          <Field label="رقم المحفظة (فودافون كاش وغيرها، اختياري)" value={f.wallet} onChangeText={set('wallet')} keyboardType="phone-pad" ltr placeholder="01xxxxxxxxx" icon="wallet" />
        </View>
      </Section>

      <Section title="شغل المحل">
        <View style={{ gap: 18, marginTop: 8 }}>
          <Labeled label="نوع القطع">
            <Seg options={Object.entries(SHOP_TYPES).map(([v, label]) => ({ v: v as 'used' | 'new' | 'both', label }))} value={f.type} onPick={set('type')} />
          </Labeled>
          <Labeled label="التخصص">
            <Chips options={SPECIALTIES.map((s) => ({ v: s, label: s }))} selected={f.specialties} onPick={toggle('specialties')} />
          </Labeled>
          <Labeled label="الماركات اللي بتشتغل فيها">
            <Chips options={MAKES.map((m) => ({ v: m, label: m }))} selected={f.brands} onPick={toggle('brands')} />
          </Labeled>
          <Labeled label="التوصيل">
            <Seg options={[{ v: 'yes', label: 'بنوصّل' }, { v: 'no', label: 'استلام من المحل بس' }]} value={f.delivery ? 'yes' : 'no'} onPick={(v) => set('delivery')(v === 'yes')} />
            {f.delivery ? (
              <View style={{ gap: 10, marginTop: 6 }}>
                <Muted size={12.5}>سعر التوصيل حسب المسافة. العميل بيشوف السعر المناسب لعنوانه تلقائي، وتقدر تغيّره لأي قطعة تقيلة وانت بتبعت العرض.</Muted>
                <Row style={{ alignItems: 'flex-start' }}>
                  <View style={{ flex: 1 }}><Field label="نفس المنطقة (ج.م)" value={f.feeArea} onChangeText={set('feeArea')} keyboardType="number-pad" ltr placeholder="40" /></View>
                  <View style={{ flex: 1 }}><Field label="نفس المحافظة (ج.م)" value={f.feeCity} onChangeText={set('feeCity')} keyboardType="number-pad" ltr placeholder="70" /></View>
                </Row>
                <Field label="محافظات تانية (ج.م، سيبه فاضي لو مش بتوصّل بره المحافظة)" value={f.feeFar} onChangeText={set('feeFar')} keyboardType="number-pad" ltr placeholder="مثلاً 150" />
              </View>
            ) : null}
          </Labeled>
        </View>
      </Section>
    </Screen>
  );
}

import { Redirect, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { AppHeader } from '@/components/AppHeader';
import { BackBar, Btn, Chips, ErrorText, Field, Labeled, Loading, Muted, Screen, Select, toast } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { AREAS, MAKES, friendlyError, validPhone } from '@/lib/data';
import { supabase } from '@/lib/supabase';

/** Register a shop, or edit its details. */
export default function ShopSetup() {
  const { ready, session, profile, shop, shopPrivate, refresh } = useAuth();
  const [shopName, setShopName] = useState('');
  const [owner, setOwner] = useState('');
  const [phone, setPhone] = useState('');
  const [area, setArea] = useState('السبتية');
  const [brands, setBrands] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (shopPrivate) { setShopName(shopPrivate.name); setOwner(shopPrivate.owner_name); setPhone(shopPrivate.phone); }
    else if (profile) { setOwner(profile.full_name || ''); setPhone(profile.phone || ''); }
    if (shop) { setArea(shop.area); setBrands(shop.brands); }
  }, [shop?.id, shopPrivate?.id, profile?.id]);

  if (ready && !session) return <Redirect href="/login" />;
  if (!profile) return <Screen header={<AppHeader role="shop" />}><Loading /></Screen>;

  async function save() {
    setErr(null);
    if (!shopName.trim()) return setErr('اكتب اسم المحل.');
    if (!owner.trim()) return setErr('اكتب اسم صاحب المحل.');
    if (!validPhone(phone)) return setErr('اكتب رقم موبايل مصري صحيح من ١١ رقم يبدأ بـ ٠١.');
    if (!brands.length) return setErr('اختار ماركة واحدة على الأقل.');
    setBusy(true);
    try {
      const uid = profile!.id;
      const p = phone.replace(/\s/g, '');
      if (shop) {
        const a = await supabase.from('shops').update({ area, brands }).eq('id', uid); if (a.error) throw a.error;
        const b = await supabase.from('shop_private').update({ name: shopName.trim(), owner_name: owner.trim(), phone: p }).eq('id', uid); if (b.error) throw b.error;
      } else {
        const a = await supabase.from('shops').insert({ id: uid, area, brands }); if (a.error) throw a.error;
        const b = await supabase.from('shop_private').insert({ id: uid, name: shopName.trim(), owner_name: owner.trim(), phone: p }); if (b.error) throw b.error;
      }
      const c = await supabase.from('profiles').update({ is_shop: true, full_name: profile!.full_name || owner.trim(), phone: profile!.phone || p }).eq('id', uid);
      if (c.error) throw c.error;
      await refresh();
      toast(shop ? 'اتحفظت بيانات المحل' : 'اتسجّل المحل. هنراجعه ونبلغك.');
      router.replace('/shop');
    } catch (x) { setErr(friendlyError(x)); }
    finally { setBusy(false); }
  }

  const toggle = (m: string) => setBrands((b) => (b.includes(m) ? b.filter((x) => x !== m) : [...b, m]));

  return (
    <Screen header={<AppHeader role="shop" />} footer={<Btn title={shop ? 'حفظ' : 'سجّل المحل'} onPress={save} loading={busy} />}>
      <BackBar title={shop ? 'بيانات المحل' : 'سجّل محلك'} onBack={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
      <Field label="اسم المحل" value={shopName} onChangeText={setShopName} placeholder="مثلاً: تشليح الأمانة" />
      <Field label="اسم صاحب المحل" value={owner} onChangeText={setOwner} />
      <Field label="رقم الموبايل (واتساب)" value={phone} onChangeText={setPhone} keyboardType="phone-pad" ltr placeholder="01xxxxxxxxx" hint="الرقم واسم المحل بيظهروا للعميل بس بعد ما يختار عرضك." />
      <Select label="منطقة المحل" value={area} options={AREAS.map((a) => ({ v: a, label: a }))} onPick={setArea} />
      <Labeled label="الماركات اللي بتشتغل فيها">
        <Chips options={MAKES.map((m) => ({ v: m, label: m }))} selected={brands} onPick={toggle} />
      </Labeled>
      <ErrorText text={err} />
      <Muted>بنراجع كل محل قبل ما يبدأ يستقبل طلبات، عشان نحافظ على ثقة العملاء.</Muted>
    </Screen>
  );
}

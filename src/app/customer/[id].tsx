import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { AppHeader } from '@/components/AppHeader';
import { BackBar, Btn, Card, CopyBox, Empty, Labeled, Lines, ListRow, Loading, Muted, Photo, Row, Screen, Section, Seg, T, toast } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { CONDITIONS, DELIVERY_FEE, WANTED, ago, ar, friendlyError, money, reqNo, type Quote, type Request, type Shop, type ShopPrivate } from '@/lib/data';
import { must, useLive } from '@/lib/live';
import { photoUrl, supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';

type Data = { req: Request | null; quotes: Quote[]; shops: Record<string, Shop>; chosenShop: ShopPrivate | null; shopCount: number };

export default function CustomerRequest() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { ready, session } = useAuth();
  const [picked, setPicked] = useState<Quote | null>(null);
  const [mode, setMode] = useState<'delivery' | 'pickup'>('delivery');
  const [busy, setBusy] = useState(false);

  const { data, loading } = useLive<Data>(async () => {
    const req = must(await supabase.from('requests').select('*').eq('id', id).maybeSingle()) as Request | null;
    if (!req) return { req: null, quotes: [], shops: {}, chosenShop: null, shopCount: 0 };
    const quotes = must(await supabase.from('quotes').select('*').eq('request_id', id).order('price')) as Quote[];
    const shopRows = must(await supabase.from('shops').select('*')) as Shop[];
    const shops = Object.fromEntries(shopRows.map((s) => [s.id, s]));
    let chosenShop: ShopPrivate | null = null;
    const chosen = quotes.find((q) => q.id === req.chosen_quote_id);
    if (chosen) chosenShop = must(await supabase.from('shop_private').select('*').eq('id', chosen.shop_id).maybeSingle()) as ShopPrivate | null;
    return { req, quotes, shops, chosenShop, shopCount: shopRows.filter((s) => s.status === 'approved').length };
  }, ['requests', 'quotes'], [id]);

  if (ready && !session) return <Redirect href="/login" />;
  const back = () => (picked ? setPicked(null) : router.replace('/customer'));
  const header = <AppHeader role="customer" />;
  if (loading && !data) return <Screen header={header}><Loading /></Screen>;
  const r = data?.req;
  if (!r) return <Screen header={header}><BackBar title="الطلب" onBack={back} /><Empty text="الطلب ده مش موجود." /></Screen>;
  const quotes = data!.quotes;

  async function rpc(fn: string, args: Record<string, unknown>, ok: string) {
    setBusy(true);
    const { error } = await supabase.rpc(fn, args);
    setBusy(false);
    if (error) { toast(friendlyError(error)); return false; }
    toast(ok); return true;
  }

  const summary = (
    <View style={{ gap: 16 }}>
      <Row style={{ alignItems: 'flex-start' }} gap={14}>
        <Photo uri={photoUrl(r.photo_path)} size={64} />
        <View style={{ flex: 1 }}>
          <T w="bold" size={18}>{r.part}</T>
          <Muted>{r.car_make} {r.car_model} {ar(r.car_year)} · {WANTED[r.wanted_condition]}</Muted>
          {r.notes ? <Muted>«{r.notes}»</Muted> : null}
        </View>
      </Row>
      <Track r={r} n={quotes.length} />
    </View>
  );

  /* ---- confirm a chosen quote ---- */
  if (picked && r.status === 'open') {
    const shop = data!.shops[picked.shop_id];
    const total = picked.price + (mode === 'delivery' ? DELIVERY_FEE : 0);
    return (
      <Screen header={header} footer={
        <Btn title={'أكّد الطلب · ' + money(total) + ' ج.م'} loading={busy} onPress={async () => {
          if (await rpc('choose_quote', { p_request: r.id, p_quote: picked.id, p_mode: mode }, 'تمام! طلبك اتأكد')) setPicked(null);
        }} />
      }>
        <BackBar title="تأكيد الطلب" onBack={back} />
        <Row gap={14}>
          <Photo uri={photoUrl(picked.photo_path)} size={64} />
          <View style={{ flex: 1 }}>
            <T w="bold" size={18}>{r.part}</T>
            <Muted>{CONDITIONS[picked.condition]} · ضمان {ar(picked.warranty_days)} يوم · {shop?.area ?? ''}</Muted>
          </View>
        </Row>
        <Labeled label="هتستلمها إزاي؟">
          <Seg options={[{ v: 'delivery', label: 'توصيل للبيت' }, { v: 'pickup', label: 'من المحل' }]} value={mode} onPick={setMode} />
        </Labeled>
        <Card>
          <Lines rows={[['سعر القطعة', money(picked.price) + ' ج.م'], ['التوصيل', mode === 'delivery' ? money(DELIVERY_FEE) + ' ج.م (تقريبي)' : 'مجاناً']]} total={['الإجمالي', money(total) + ' ج.م']} />
        </Card>
        <Muted center>الدفع كاش أو إنستاباي عند الاستلام.</Muted>
      </Screen>
    );
  }

  /* ---- chosen / done ---- */
  if (r.status === 'chosen' || r.status === 'done') {
    const q = quotes.find((x) => x.id === r.chosen_quote_id);
    const sp = data!.chosenShop;
    const shop = q ? data!.shops[q.shop_id] : undefined;
    const footer = r.status === 'chosen'
      ? <Btn title="استلمت القطعة" loading={busy} onPress={() => rpc('mark_received', { p_request: r.id }, 'تمام! قيّم المحل لو سمحت')} />
      : undefined;
    return (
      <Screen header={header} footer={footer}>
        <BackBar title={'طلب ' + reqNo(r.num)} onBack={back} />
        {summary}
        <View style={{ alignItems: 'center', gap: 6, paddingVertical: 8 }}>
          <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: colors.good, alignItems: 'center', justifyContent: 'center' }}><T color="#fff" size={26} w="bold">✓</T></View>
          <T w="bold" size={20}>{r.status === 'done' ? 'الطلب اتسلّم' : 'طلبك اتأكد'}</T>
          <Muted center size={14}>{r.delivery_mode === 'delivery' ? 'المحل هيكلمك ويبعتها مع مندوب. الدفع عند الاستلام.' : 'روح المحل وقول رقم الطلب ' + reqNo(r.num) + '.'}</Muted>
        </View>
        {q && sp ? (
          <Card>
            <Row style={{ justifyContent: 'space-between' }}>
              <View><Muted size={12}>المحل</Muted><T w="bold" size={17}>{sp.name}</T></View>
              <Muted>{shop?.area}</Muted>
            </Row>
            <CopyBox text={sp.phone} />
            <Lines rows={[[CONDITIONS[q.condition], money(q.price) + ' ج.م'], ...(r.delivery_mode === 'delivery' ? [['التوصيل (تقريبي)', money(DELIVERY_FEE) + ' ج.م'] as [string, string]] : [])]}
              total={['الإجمالي', money(q.price + (r.delivery_mode === 'delivery' ? DELIVERY_FEE : 0)) + ' ج.م']} />
            <Muted>ضمان {ar(q.warranty_days)} يوم: لو القطعة مركبتش، المحل يبدّلها.</Muted>
          </Card>
        ) : null}
        {r.status === 'done' ? (
          <View style={{ alignItems: 'center', gap: 6 }}>
            <T w="semibold">القطعة ركبت تمام؟ قيّم المحل</T>
            <Row gap={6}>
              {[1, 2, 3, 4, 5].map((n) => (
                <Pressable key={n} onPress={() => rpc('rate_request', { p_request: r.id, p_rating: n }, 'شكراً على التقييم')} accessibilityLabel={ar(n) + ' نجوم'} hitSlop={4}>
                  <T size={34} color={(r.rating ?? 0) >= n ? colors.accent : colors.line}>★</T>
                </Pressable>
              ))}
            </Row>
          </View>
        ) : null}
      </Screen>
    );
  }

  /* ---- open / cancelled ---- */
  return (
    <Screen header={header}>
      <BackBar title={'طلب ' + reqNo(r.num)} onBack={back} />
      {summary}
      {r.status === 'cancelled' ? <Empty text="الطلب ده اتلغى." /> : (
        <>
          {quotes.length === 0 ? (
            <View style={{ alignItems: 'center', gap: 10, paddingVertical: 28 }}>
              <ActivityIndicator color={colors.ink} />
              <T w="semibold" size={16}>بندوّر عند {ar(data!.shopCount)} محل</T>
              <Muted center>هنبلغك أول ما يوصل عرض. ممكن تقفل الصفحة.</Muted>
            </View>
          ) : (
            <Section title={'العروض (' + ar(quotes.length) + ')'} note="الأرخص الأول">
              {quotes.map((q, i) => (
                <ListRow key={q.id} last={i === quotes.length - 1}
                  leading={<Photo uri={photoUrl(q.photo_path)} size={56} />}
                  title={<T w="bold" size={22} style={{ lineHeight: 30 }}>{money(q.price)} <T size={13} color={colors.muted}>ج.م</T></T>}
                  subtitle={CONDITIONS[q.condition] + ' · ضمان ' + ar(q.warranty_days) + ' يوم'}
                  meta={'محل في ' + (data!.shops[q.shop_id]?.area ?? '—') + ' · ' + ago(q.created_at)}
                  trailing={<Btn kind="small" title="اختار" onPress={() => { setMode('delivery'); setPicked(q); }} />} />
              ))}
              <Muted center size={12}>اسم المحل ورقمه بيظهروا بعد ما تختار.</Muted>
            </Section>
          )}
          <Btn kind="link" title="إلغاء الطلب" loading={busy} onPress={() => rpc('cancel_request', { p_request: r.id }, 'الطلب اتلغى')} style={{ alignSelf: 'center' }} />
        </>
      )}
    </Screen>
  );
}

function Track({ r, n }: { r: Request; n: number }) {
  const chosen = r.status === 'chosen' || r.status === 'done';
  const steps: [boolean, string][] = [[true, 'اتبعت'], [n > 0, 'وصلت عروض'], [chosen, 'اخترت'], [r.status === 'done', 'استلمت']];
  return (
    <View style={{ gap: 6 }}>
      <Row gap={4}>{steps.map(([on], i) => <View key={i} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: on ? colors.ink : colors.line }} />)}</Row>
      <Row gap={4}>{steps.map(([on, label], i) => <T key={i} size={11.5} color={on ? colors.ink : colors.faint} w={on ? 'semibold' : 'regular'} style={{ flex: 1 }}>{label}</T>)}</Row>
    </View>
  );
}

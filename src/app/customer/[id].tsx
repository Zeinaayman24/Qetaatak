import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { AppHeader } from '@/components/AppHeader';
import { BackBar, Btn, Card, Empty, Labeled, Lines, Loading, Muted, Notice, Photo, Row, Screen, Seg, T, toast } from '@/components/ui';
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
    if (chosen) chosenShop = (must(await supabase.from('shop_private').select('*').eq('id', chosen.shop_id).maybeSingle()) as ShopPrivate | null);
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
    <Card>
      <Row style={{ alignItems: 'flex-start' }}>
        <Photo uri={photoUrl(r.photo_path)} />
        <View style={{ flex: 1 }}>
          <T w="bold">{r.part}</T>
          <Muted>{r.car_make} {r.car_model} {ar(r.car_year)}</Muted>
          <Muted>عايزها: {WANTED[r.wanted_condition]} · {r.area}</Muted>
        </View>
      </Row>
      {r.notes ? <View style={{ backgroundColor: colors.soft, borderRadius: 10, padding: 10 }}><T size={13}>{r.notes}</T></View> : null}
      <Track r={r} n={quotes.length} />
    </Card>
  );

  /* ---- choosing a quote ---- */
  if (picked && r.status === 'open') {
    const shop = data!.shops[picked.shop_id];
    const total = picked.price + (mode === 'delivery' ? DELIVERY_FEE : 0);
    return (
      <Screen header={header}>
        <BackBar title="تأكيد الطلب" onBack={back} />
        <Card>
          <Row style={{ alignItems: 'flex-start' }}>
            <Photo uri={photoUrl(picked.photo_path)} />
            <View style={{ flex: 1, gap: 4 }}>
              <T w="bold">{r.part}</T>
              <Muted>{CONDITIONS[picked.condition]} · ضمان {ar(picked.warranty_days)} يوم</Muted>
              <Muted>محل في {shop?.area ?? '—'}</Muted>
            </View>
          </Row>
        </Card>
        <Labeled label="هتستلمها إزاي؟">
          <Seg options={[{ v: 'delivery', label: 'توصيل لحد البيت' }, { v: 'pickup', label: 'من المحل' }]} value={mode} onPick={setMode} />
        </Labeled>
        <Card>
          <Lines rows={[['سعر القطعة', money(picked.price) + ' ج.م'], ['التوصيل', mode === 'delivery' ? money(DELIVERY_FEE) + ' ج.م (تقريبي)' : 'مجاناً']]} total={['الإجمالي', money(total) + ' ج.م']} />
          <Muted>الدفع كاش أو إنستاباي عند الاستلام. الدفع أونلاين جاي قريب.</Muted>
        </Card>
        <Btn title="أكّد الطلب" loading={busy} onPress={async () => {
          if (await rpc('choose_quote', { p_request: r.id, p_quote: picked.id, p_mode: mode }, 'تمام! طلبك اتأكد')) setPicked(null);
        }} />
      </Screen>
    );
  }

  /* ---- chosen / done ---- */
  if (r.status === 'chosen' || r.status === 'done') {
    const q = quotes.find((x) => x.id === r.chosen_quote_id);
    const sp = data!.chosenShop;
    const shop = q ? data!.shops[q.shop_id] : undefined;
    return (
      <Screen header={header}>
        <BackBar title={'طلب ' + reqNo(r.num)} onBack={back} />
        {summary}
        <View style={{ alignItems: 'center', gap: 4 }}>
          <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: colors.good, alignItems: 'center', justifyContent: 'center' }}><T color="#fff" size={30} w="bold">✓</T></View>
          <T w="bold" size={19}>{r.status === 'done' ? 'الطلب اتسلّم' : 'طلبك اتأكد'}</T>
          <Muted center>{r.delivery_mode === 'delivery' ? 'المحل هيكلمك ويبعتها مع مندوب. الدفع عند الاستلام.' : 'روح المحل وقول رقم الطلب ' + reqNo(r.num) + '. الدفع في المحل.'}</Muted>
        </View>
        {q && sp ? (
          <Card>
            <Muted>المحل</Muted>
            <Row style={{ justifyContent: 'space-between' }}><T w="bold">{sp.name}</T><Muted>{shop?.area}</Muted></Row>
            <View style={{ backgroundColor: colors.soft, borderRadius: 10, padding: 10 }}><T selectable style={{ writingDirection: 'ltr', textAlign: 'right' }}>{sp.phone}</T></View>
            <Lines rows={[[r.part + ' · ' + CONDITIONS[q.condition], money(q.price) + ' ج.م'], ...(r.delivery_mode === 'delivery' ? [['التوصيل (تقريبي)', money(DELIVERY_FEE) + ' ج.م'] as [string, string]] : [])]}
              total={['الإجمالي', money(q.price + (r.delivery_mode === 'delivery' ? DELIVERY_FEE : 0)) + ' ج.م']} />
            <Muted>ضمان {ar(q.warranty_days)} يوم: لو القطعة مركبتش، المحل يبدّلها.</Muted>
          </Card>
        ) : null}
        {r.status === 'chosen' ? (
          <Btn title="استلمت القطعة" loading={busy} onPress={() => rpc('mark_received', { p_request: r.id }, 'تمام! قيّم المحل لو سمحت')} />
        ) : (
          <Card style={{ alignItems: 'center' }}>
            <T w="bold">القطعة ركبت تمام؟ قيّم المحل</T>
            <Row gap={6}>
              {[1, 2, 3, 4, 5].map((n) => (
                <Pressable key={n} onPress={() => rpc('rate_request', { p_request: r.id, p_rating: n }, 'شكراً على التقييم')} accessibilityLabel={ar(n) + ' نجوم'}>
                  <T size={30} color={(r.rating ?? 0) >= n ? colors.accent : colors.line}>★</T>
                </Pressable>
              ))}
            </Row>
            {r.rating ? <Muted>شكراً! تقييمك بيساعد غيرك يختار صح.</Muted> : null}
          </Card>
        )}
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
            <Notice>بعتنا طلبك لـ {ar(data!.shopCount)} محل. هنبلغك أول ما يوصل عرض.</Notice>
          ) : (
            <Row style={{ justifyContent: 'space-between' }}><T w="bold">العروض ({ar(quotes.length)})</T><Muted>الأرخص الأول</Muted></Row>
          )}
          {quotes.map((q) => (
            <Card key={q.id}>
              <Row style={{ alignItems: 'flex-start' }}>
                <Photo uri={photoUrl(q.photo_path)} />
                <View style={{ flex: 1, gap: 4 }}>
                  <T w="bold" size={24}>{money(q.price)} <T size={13} color={colors.muted}>ج.م</T></T>
                  <Muted>{CONDITIONS[q.condition]} · ضمان {ar(q.warranty_days)} يوم</Muted>
                  <Muted size={12}>محل في {data!.shops[q.shop_id]?.area ?? '—'} · {ago(q.created_at)}</Muted>
                </View>
              </Row>
              <Btn kind="dark" title="اختار العرض ده" onPress={() => { setMode('delivery'); setPicked(q); }} />
            </Card>
          ))}
          {quotes.length ? <Muted center>اسم المحل ورقمه بيظهروا بعد ما تختار العرض.</Muted> : null}
          <Btn kind="secondary" title="إلغاء الطلب" loading={busy} onPress={() => rpc('cancel_request', { p_request: r.id }, 'الطلب اتلغى')} />
        </>
      )}
    </Screen>
  );
}

function Track({ r, n }: { r: Request; n: number }) {
  const chosen = r.status === 'chosen' || r.status === 'done';
  const steps: [boolean, string][] = [[true, 'اتبعت للمحلات'], [n > 0, n ? 'وصلت عروض' : 'المحلات بترد'], [chosen, 'اخترت عرض'], [r.status === 'done', 'استلمت']];
  return (
    <Row gap={4} style={{ alignItems: 'flex-start' }}>
      {steps.map(([on, label], i) => (
        <View key={i} style={{ flex: 1, alignItems: 'center', gap: 4 }}>
          <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: on ? colors.good : colors.line, backgroundColor: on ? colors.good : colors.card, alignItems: 'center', justifyContent: 'center' }}>
            {on ? <T size={11} color="#fff" w="bold">✓</T> : null}
          </View>
          <T size={11} center color={on ? colors.ink : colors.muted} w={on ? 'semibold' : 'regular'}>{label}</T>
        </View>
      ))}
    </Row>
  );
}

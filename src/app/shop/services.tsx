import { Redirect, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { BackBar, Btn, ErrorText, Field, Icon, Loading, Muted, Notice, Press, Row, Screen, T, toast } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { friendlyError, toLatin } from '@/lib/data';
import { t } from '@/lib/i18n';
import { serviceName, useInstallServices } from '@/lib/shops';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';

type Row_ = { on: boolean; from: string; to: string; inspect: boolean; minutes: string; note: string };
const blank: Row_ = { on: false, from: '', to: '', inspect: false, minutes: '', note: '' };
const num = (s: string) => { const n = parseFloat(toLatin(s).trim()); return s.trim() && !isNaN(n) ? n : null; };

/** The shop picks which installations it does, with a starting price (or "after inspection") and how long each takes. */
export default function ShopServices() {
  const { ready, session, shop, refresh } = useAuth();
  const services = useInstallServices();
  const [rows, setRows] = useState<Record<string, Row_> | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!shop?.id) return;
    supabase.from('shop_install_services').select('*').eq('shop_id', shop.id).then(({ data }) => {
      const r: Record<string, Row_> = {};
      (data ?? []).forEach((x: any) => {
        r[x.service_id] = { on: true, from: x.price_from != null ? String(Number(x.price_from)) : '', to: x.price_to != null ? String(Number(x.price_to)) : '',
          inspect: x.needs_inspection, minutes: x.minutes != null ? String(x.minutes) : '', note: x.note ?? '' };
      });
      setRows(r);
    });
  }, [shop?.id]);

  if (ready && !session) return <Redirect href="/login" />;
  if (!shop || !rows) return <Screen><Loading /></Screen>;
  const back = () => (router.canGoBack() ? router.back() : router.replace('/shop'));
  const get = (id: string) => rows[id] ?? blank;
  const put = (id: string, patch: Partial<Row_>) => setRows((x) => ({ ...x!, [id]: { ...(x![id] ?? blank), ...patch } }));
  const chosen = Object.entries(rows).filter(([, r]) => r.on);

  async function save() {
    setErr(null);
    for (const [id, r] of chosen) {
      const a = num(r.from), b = num(r.to);
      if (r.from.trim() && a == null) return setErr(t('اكتب السعر أرقام بس.'));
      if (a == null && !r.inspect) return setErr(t('اكتب سعر يبدأ من، أو اختار «السعر بعد المعاينة» لـ {0}.', serviceName(services.find((s) => s.id === id))));
      if (a != null && b != null && b < a) return setErr(t('السعر لحد لازم يكون أكبر من السعر من.'));
      const m = num(r.minutes);
      if (r.minutes.trim() && (m == null || m < 5 || m > 2880)) return setErr(t('مدة التركيب بالدقايق، من ٥ لـ ٢٨٨٠.'));
    }
    setBusy(true);
    try {
      const del = await supabase.from('shop_install_services').delete().eq('shop_id', shop!.id).not('service_id', 'in', `(${chosen.map(([id]) => id).join(',') || 'none'})`);
      if (del.error) throw del.error;
      if (chosen.length) {
        const up = await supabase.from('shop_install_services').upsert(chosen.map(([id, r]) => ({
          shop_id: shop!.id, service_id: id, price_from: num(r.from), price_to: num(r.to), needs_inspection: r.inspect,
          minutes: num(r.minutes) != null ? Math.round(num(r.minutes)!) : null, note: r.note.trim().slice(0, 200),
        })));
        if (up.error) throw up.error;
      }
      if (!shop!.installs && chosen.length) {
        const s = await supabase.from('shops').update({ installs: true }).eq('id', shop!.id);
        if (s.error) throw s.error;
        await refresh();
      }
      toast(t('اتحفظ.'));
    } catch (e) { setErr(friendlyError(e)); }
    setBusy(false);
  }

  return (
    <Screen footer={<><ErrorText text={err} /><Btn title={t('حفظ')} loading={busy} onPress={save} /></>}>
      <BackBar title={t('خدمات التركيب')} onBack={back} />
      {!shop.installs ? <Notice>{t('محلك مش متسجّل إنه بيركّب. أول ما تحفظ خدمة هنعرض محلك في التركيب.')}</Notice> : null}
      <Muted size={13.5}>{t('اختار التركيبات اللي بتعملها. السعر هنا تقريبي بيظهر للعملاء، وانت بتأكّد السعر النهائي في كل عرض.')}</Muted>
      {!chosen.length ? <Muted size={13}>{t('لو ماختارتش أي خدمة، هيوصلك كل طلبات التركيب في محافظتك.')}</Muted> : null}

      <View style={{ backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.line, overflow: 'hidden' }}>
        {services.map((s, i) => {
          const r = get(s.id);
          const expanded = open === s.id && r.on;
          return (
            <View key={s.id} style={[i > 0 && { borderTopWidth: 1, borderColor: colors.line }]}>
              <Press onPress={() => { put(s.id, { on: !r.on }); setOpen(r.on ? null : s.id); }} selected={r.on} label={serviceName(s)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 }}>
                <Icon name={r.on ? 'checkbox' : 'square-outline'} size={22} color={r.on ? colors.primary : colors.muted} />
                <View style={{ flex: 1 }}>
                  <T w={r.on ? 'semibold' : 'regular'} size={15}>{serviceName(s)}</T>
                  {r.on && !expanded ? <Muted size={12.5}>{r.from ? t('من {0} ج.م', r.from) + (r.to ? t(' لـ {0}', r.to) : '') : r.inspect ? t('السعر بعد المعاينة') : t('حدّد السعر')}</Muted> : null}
                </View>
                {r.on ? <Press onPress={() => setOpen(expanded ? null : s.id)} label={t('تفاصيل')} hitSlop={8}><Icon name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={colors.muted} /></Press> : null}
              </Press>
              {expanded ? (
                <View style={{ paddingHorizontal: 14, paddingBottom: 14, gap: 10 }}>
                  <Row style={{ alignItems: 'flex-start' }}>
                    <View style={{ flex: 1 }}><Field label={t('السعر من (ج.م)')} value={r.from} onChangeText={(v) => put(s.id, { from: v })} keyboardType="number-pad" ltr /></View>
                    <View style={{ flex: 1 }}><Field label={t('لحد (اختياري)')} value={r.to} onChangeText={(v) => put(s.id, { to: v })} keyboardType="number-pad" ltr /></View>
                  </Row>
                  <Press onPress={() => put(s.id, { inspect: !r.inspect })} selected={r.inspect} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <Icon name={r.inspect ? 'checkbox' : 'square-outline'} size={20} color={r.inspect ? colors.primary : colors.muted} />
                    <T size={14}>{t('السعر النهائي بعد المعاينة')}</T>
                  </Press>
                  <Field label={t('بياخد قد إيه؟ (دقايق، اختياري)')} value={r.minutes} onChangeText={(v) => put(s.id, { minutes: v })} keyboardType="number-pad" ltr />
                  <Field label={t('ملاحظة (اختياري)')} value={r.note} onChangeText={(v) => put(s.id, { note: v })} placeholder={t('مثلاً: السعر شامل ضبط الزوايا')} />
                </View>
              ) : null}
            </View>
          );
        })}
      </View>
    </Screen>
  );
}

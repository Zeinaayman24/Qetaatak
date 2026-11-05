import { useState } from 'react';
import { View } from 'react-native';
import { whenLabel } from './Appointment';
import { Btn, Icon, Muted, Pill, Row, Steps, T, toast } from './ui';
import { friendlyError, money, type Order } from '@/lib/data';
import { t } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';

export const INSTALL_STEPS: Record<string, string> = {
  requested: t('مستني المحل يأكّد المعاد'), confirmed: t('المعاد متأكّد'), in_progress: t('التركيب شغّال'), done: t('التركيب خلص'),
};
const ORDER = ['requested', 'confirmed', 'in_progress', 'done'];
const NEXT: Record<string, { to: string; label: string }> = {
  requested: { to: 'confirmed', label: t('أكّد معاد التركيب') },
  confirmed: { to: 'in_progress', label: t('بدأت التركيب') },
  in_progress: { to: 'done', label: t('التركيب خلص') },
};

/** Installation that came with a bought part: when, how much (paid at the shop), and where it stands. The shop moves it forward. */
export function InstallBox({ o, shop, onChange }: { o: Order; shop?: boolean; onChange?: () => void }) {
  const [busy, setBusy] = useState(false);
  if (!o.install_status) return null;
  const step = ORDER.indexOf(o.install_status);
  const next = NEXT[o.install_status];
  async function move() {
    setBusy(true);
    const { error } = await supabase.rpc('set_order_install', { p_order: o.id, p_status: next.to });
    setBusy(false);
    if (error) toast(friendlyError(error)); else { toast(t('اتحدّث.')); onChange?.(); }
  }
  return (
    <View style={{ backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.line, padding: 16, gap: 12 }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Row gap={8}><Icon name="construct-outline" size={20} color={colors.primary} /><T w="bold" size={16}>{t('التركيب في المحل')}</T></Row>
        <Pill label={INSTALL_STEPS[o.install_status]} tone={o.install_status === 'done' ? 'good' : 'new'} />
      </Row>
      {o.install_at ? <T size={14}>{t('المعاد: {0}', whenLabel(o.install_at))}</T> : null}
      <Muted size={13}>{Number(o.install_fee) ? t('سعر التركيب {0} ج.م، بيتدفع في المحل.', money(Number(o.install_fee))) : t('سعر التركيب بيتحدد في المحل بعد المعاينة.')}</Muted>
      <Steps items={[t('طلب'), t('متأكّد'), t('شغّال'), t('خلص')]} current={step} />
      {shop && next && o.status !== 'cancelled' ? <Btn title={next.label} loading={busy} onPress={move} /> : null}
      {!shop && o.install_status === 'requested' ? <Muted size={12.5}>{t('المحل هيأكّد المعاد، ولو محتاج يغيّره هيكلّمك في الرسائل.')}</Muted> : null}
    </View>
  );
}

import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Btn, Icon, Muted, Row, T, toast } from '@/components/ui';
import { enablePush, markPushAsked, pushAsked, pushState, type PushState } from '@/lib/push';
import { colors } from '@/lib/theme';

/**
 * Asks to turn on phone notifications (A23, B19).
 * kind 'ask': the one-time question after the first request; hidden once answered.
 * kind 'banner': shown whenever notifications are off (notifications page, shop home).
 */
export function PushPrompt({ kind, shop }: { kind: 'ask' | 'banner'; shop?: boolean }) {
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { pushState().then(setState).catch(() => setState('unsupported')); }, []);
  if (state !== 'off' || (kind === 'ask' && pushAsked())) return null;

  async function on() {
    setBusy(true);
    const s = await enablePush().catch(() => 'off' as PushState);
    setBusy(false); markPushAsked(); setState(s);
    if (s === 'denied') toast('الإشعارات مقفولة من المتصفح. تقدر تفتحها من إعدادات الموقع.');
  }
  const text = kind === 'ask'
    ? 'عايز نبلّغك أول ما المحلات تبعت عروض؟'
    : shop ? 'شغّل الإشعارات عشان تعرف أول ما يوصلك طلب. سرعة ردّك بتظهر للعملاء.' : 'شغّل الإشعارات عشان تعرف أول ما يوصلك عرض.';
  return (
    <View style={{ backgroundColor: colors.primarySoft, borderRadius: 16, padding: 14, gap: 10 }}>
      <Row gap={10} style={{ alignItems: 'flex-start' }}>
        <Icon name="notifications" size={20} color={colors.primary} />
        <T w="semibold" size={14} style={{ flex: 1 }}>{text}</T>
      </Row>
      <Row gap={8}>
        <Btn title={kind === 'ask' ? 'أيوه' : 'شغّل'} onPress={on} loading={busy} style={{ flex: 1 }} />
        {kind === 'ask' ? <Btn kind="secondary" title="مش دلوقتي" onPress={() => { markPushAsked(); setState('on'); }} style={{ flex: 1 }} /> : null}
      </Row>
      {kind === 'ask' ? <Muted size={12}>تقدر تغيّر ده بعدين من «الإشعارات».</Muted> : null}
    </View>
  );
}

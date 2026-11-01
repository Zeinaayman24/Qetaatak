import { View } from 'react-native';
import { colors } from '@/lib/theme';
import { Btn, Icon, Muted, Row, Sheet, T } from './ui';

/** A yes/no question before something that can't be undone (cancel a request, cancel an order, mark received). */
export function ConfirmSheet({ open, title, body, yes, no = 'لأ', danger, busy, onYes, onClose }: {
  open: boolean; title: string; body?: string; yes: string; no?: string; danger?: boolean; busy?: boolean; onYes: () => void; onClose: () => void;
}) {
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <View style={{ gap: 16 }}>
        {body ? <Muted size={14}>{body}</Muted> : null}
        <Row gap={10}>
          <Btn kind={danger ? 'danger' : 'primary'} title={yes} loading={busy} onPress={onYes} style={{ flex: 1 }} />
          <Btn kind="secondary" title={no} onPress={onClose} style={{ flex: 1 }} />
        </Row>
      </View>
    </Sheet>
  );
}

/** «ضمان ضغطة»: what the customer gets when the order is confirmed in the app (Product Register A17, term 27). */
export function GuaranteeSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const lines: [string, string][] = [
    ['pricetag', 'السعر ثابت، مفيش زيادة عند الاستلام'],
    ['search', 'افحص القطعة قبل ما تستلم، ولو مش زي العرض ارفضها ومتدفعش'],
    ['document-text', 'الضمان مكتوب في إيصالك'],
    ['headset', 'فريق الدعم معاك لو حصلت مشكلة'],
  ];
  return (
    <Sheet open={open} onClose={onClose} title="ضمان ضغطة">
      <View style={{ gap: 14 }}>
        {lines.map(([icon, text]) => (
          <Row key={text} gap={12} style={{ alignItems: 'flex-start' }}>
            <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: colors.goodSoft, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name={icon} size={18} color={colors.good} />
            </View>
            <T size={14.5} style={{ flex: 1, lineHeight: 24 }}>{text}</T>
          </Row>
        ))}
        <Muted size={12.5}>الضمان ده للأوردرات اللي بتتأكد من ضغطة بس.</Muted>
      </View>
    </Sheet>
  );
}

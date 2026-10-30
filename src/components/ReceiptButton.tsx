import { useState } from 'react';
import { View } from 'react-native';
import { Icon, Muted, Press, Row, T, toast } from '@/components/ui';
import { downloadReceipt } from '@/lib/receipt';
import { colors, lift } from '@/lib/theme';

/** "حمّل الإيصال PDF": the order's receipt, for the customer and for the shop. */
export function ReceiptButton({ orderId }: { orderId: string }) {
  const [busy, setBusy] = useState(false);
  async function go() {
    setBusy(true);
    const err = await downloadReceipt(orderId);
    setBusy(false);
    toast(err ?? 'الإيصال اتحمّل');
  }
  return (
    <Press onPress={go} disabled={busy} label="حمّل الإيصال PDF"
      style={[lift, { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface, borderRadius: 16, padding: 14 }]}>
      <View style={{ width: 42, height: 42, borderRadius: 12, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="document-text" size={21} color={colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <T w="bold" size={14.5}>{busy ? 'بنجهّز الإيصال…' : 'إيصال الأوردر PDF'}</T>
        <Muted size={12}>فيه القطع والأسعار والدفع وبيانات المحل</Muted>
      </View>
      <Row gap={4}><T w="semibold" size={13} color={colors.primary}>حمّل</T><Icon name="download-outline" size={17} color={colors.primary} /></Row>
    </Press>
  );
}

import { router } from 'expo-router';
import { Muted, Press, Row, T } from '@/components/ui';
import { type LegalKey } from '@/lib/legal';
import { colors } from '@/lib/theme';
import { t } from '@/lib/i18n';

const Link = ({ k, label }: { k: LegalKey; label: string }) => (
  <Press role="link" label={label} onPress={() => router.push(`/legal/${k}`)}>
    <T size={12.5} w="semibold" color={colors.primary}>«{label}»</T>
  </Press>
);

/** «… بتوافق على «الشروط والأحكام» و«سياسة الخصوصية»» with tappable links (A04, A19). */
export function LegalLinks({ lead, withCancellation }: { lead: string; withCancellation?: boolean }) {
  return (
    <Row gap={4} style={{ flexWrap: 'wrap', justifyContent: 'center' }}>
      <Muted size={12.5}>{lead}</Muted>
      <Link k="terms" label={t('الشروط والأحكام')} />
      <Muted size={12.5}>{t('و')}</Muted>
      <Link k={withCancellation ? 'cancellation' : 'privacy'} label={withCancellation ? t('سياسة الإلغاء') : t('سياسة الخصوصية')} />
    </Row>
  );
}

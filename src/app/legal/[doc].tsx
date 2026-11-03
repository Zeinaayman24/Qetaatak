import { router, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { BackBar, Empty, Muted, Press, Row, Screen, T } from '@/components/ui';
import { LEGAL, LEGAL_LINKS, LEGAL_VERSION, type LegalKey } from '@/lib/legal';
import { colors } from '@/lib/theme';
import { t } from '@/lib/i18n';

/** Splits "a **b** c" into plain and bold runs. */
function Rich({ text, size = 14.5 }: { text: string; size?: number }) {
  const parts = text.split(/\*\*/);
  return (
    <T size={size} style={{ lineHeight: size * 1.75 }}>
      {parts.map((s, i) => (i % 2 ? <T key={i} w="bold" size={size}>{s}</T> : s))}
    </T>
  );
}

/** Terms, privacy and cancellation pages (Product Register A31). Open without signing in. */
export default function LegalPage() {
  const { doc } = useLocalSearchParams<{ doc: string }>();
  const d = LEGAL[doc as LegalKey];
  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));
  if (!d) return <Screen><BackBar title={t('الشروط')} onBack={back} /><Empty text={t('الصفحة دي مش موجودة.')} /></Screen>;
  return (
    <Screen>
      <BackBar title={d.title} onBack={back} />
      <Muted size={12.5}>{t('آخر تحديث:')}{' '}{d.updated} {t('· نسخة')}{' '}{LEGAL_VERSION}</Muted>
      <View style={{ gap: 12 }}>
        {d.blocks.map((b, i) => {
          if ('h' in b) return <T key={i} w="bold" size={17} style={{ marginTop: 8 }}>{b.h}</T>;
          if ('p' in b) return <Rich key={i} text={b.p} />;
          if ('list' in b) return (
            <View key={i} style={{ gap: 8 }}>
              {b.list.map((x, j) => (
                <Row key={j} gap={8} style={{ alignItems: 'flex-start' }}>
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.primary, marginTop: 11 }} />
                  <View style={{ flex: 1 }}><Rich text={x} /></View>
                </Row>
              ))}
            </View>
          );
          return (
            <View key={i} style={{ borderWidth: 1, borderColor: colors.line, borderRadius: 14, overflow: 'hidden' }}>
              {b.rows.body.map((r, j) => (
                <View key={j} style={{ padding: 12, gap: 3, borderTopWidth: j ? 1 : 0, borderColor: colors.line }}>
                  <T w="semibold" size={14}>{r[0]}</T>
                  <Muted size={13}>{b.rows.head[1]}: {r[1]}</Muted>
                  <Muted size={13}>{b.rows.head[2]}: {r[2]}</Muted>
                </View>
              ))}
            </View>
          );
        })}
      </View>
      <Row gap={14} style={{ justifyContent: 'center', flexWrap: 'wrap', marginTop: 8 }}>
        {LEGAL_LINKS.filter((l) => l.key !== d.key).map((l) => (
          <Press key={l.key} label={l.label} onPress={() => router.replace(`/legal/${l.key}`)}><T size={13.5} w="semibold" color={colors.primary}>{l.label}</T></Press>
        ))}
      </Row>
    </Screen>
  );
}

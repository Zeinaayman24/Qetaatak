import { router } from 'expo-router';
import { useRef, type ReactNode } from 'react';
import { ActivityIndicator, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, Muted, T, ToastHost } from '@/components/ui';
import { colors, fonts } from '@/lib/theme';

/* Shared pieces of the assistant / customer-service chat. */

export type Who = 'bot' | 'me' | 'agent' | 'system';
export type ChatLink = { label: string; href: string };
export type ChatMsg = { id: string | number; who: Who; text?: string; photo?: string; lines?: [string, string][]; links?: ChatLink[]; name?: string };
export type Chip = { label: string; fn: () => void; icon?: string; main?: boolean };

const W = { width: '100%', maxWidth: 560, alignSelf: 'center' } as const;

export function ChatFrame({ subtitle, live, onBack, right, messages, typing, chips, busy, composer, footer, avatar = 'bot' }: {
  subtitle: string; live?: boolean; onBack: () => void; right?: ReactNode; messages: ChatMsg[]; typing?: boolean;
  chips: Chip[]; busy?: boolean; avatar?: 'bot' | 'agent'; footer?: ReactNode;
  composer: { value: string; onChange: (t: string) => void; onSend: () => void; placeholder: string } | null;
}) {
  const insets = useSafeAreaInsets();
  const scroller = useRef<any>(null);
  const canSend = !!composer?.value.trim() && !busy;
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.ground }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={{ paddingTop: insets.top, borderBottomWidth: 1, borderColor: colors.line }}>
        <View style={[W, { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 10 }]}>
          <Pressable onPress={onBack} hitSlop={10} accessibilityRole="button" accessibilityLabel="رجوع"
            style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="chevron-forward" size={20} />
          </Pressable>
          <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: avatar === 'agent' ? colors.accent : colors.ink, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name={avatar === 'agent' ? 'headset' : 'sparkles'} size={19} color={avatar === 'agent' ? colors.ink : colors.accent} />
          </View>
          <View style={{ flex: 1 }}>
            <T w="bold" size={16}>{avatar === 'agent' ? 'خدمة العملاء' : 'مساعد قطعتك'}</T>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: live === false ? colors.faint : colors.good }} />
              <Muted size={12} numberOfLines={1}>{typing ? 'بيكتب…' : subtitle}</Muted>
            </View>
          </View>
          {right}
        </View>
      </View>

      <ScrollView ref={scroller} style={{ flex: 1 }} keyboardShouldPersistTaps="handled"
        onContentSizeChange={() => scroller.current?.scrollToEnd({ animated: true })}
        contentContainerStyle={[W, { padding: 16, gap: 8 }]}>
        {messages.map((m) => <Bubble key={m.id} m={m} />)}
        {typing ? (
          <View style={[bubbleStyle('bot'), { flexDirection: 'row', gap: 4, paddingVertical: 14 }]}>
            {[0, 1, 2].map((i) => <View key={i} style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: colors.faint }} />)}
          </View>
        ) : null}
      </ScrollView>

      <View style={{ borderTopWidth: 1, borderColor: colors.line, paddingBottom: insets.bottom + 10, paddingTop: 10 }}>
        <View style={[W, { paddingHorizontal: 16, gap: 10 }]}>
          {footer}
          {!typing && chips.length ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {chips.map((c, i) => (
                <Pressable key={c.label + i} onPress={c.fn} disabled={busy} accessibilityRole="button"
                  style={({ pressed }) => [{
                    flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9,
                    backgroundColor: c.main ? colors.ink : colors.ground, borderWidth: 1.5, borderColor: c.main ? colors.ink : colors.line,
                  }, pressed && { opacity: 0.7 }]}>
                  {busy && c.main ? <ActivityIndicator size="small" color="#fff" /> : c.icon ? <Icon name={c.icon} size={16} color={c.main ? '#fff' : colors.ink} /> : null}
                  <T size={13.5} w="medium" color={c.main ? '#fff' : colors.ink}>{c.label}</T>
                </Pressable>
              ))}
            </View>
          ) : null}
          {composer ? (
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
              <TextInput
                value={composer.value} onChangeText={composer.onChange} placeholder={composer.placeholder} placeholderTextColor={colors.faint}
                onSubmitEditing={() => canSend && composer.onSend()} submitBehavior="submit" returnKeyType="send"
                style={{
                  flex: 1, minHeight: 46, maxHeight: 120, borderRadius: 23, backgroundColor: colors.card, paddingHorizontal: 16, paddingVertical: 11,
                  fontFamily: fonts.regular, fontSize: 15, color: colors.ink, textAlign: 'right', writingDirection: 'rtl',
                  ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : {}),
                }}
              />
              <Pressable onPress={composer.onSend} disabled={!canSend} accessibilityRole="button" accessibilityLabel="ابعت"
                style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: canSend ? colors.ink : colors.soft, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="arrow-up" size={20} color={canSend ? '#fff' : colors.faint} />
              </Pressable>
            </View>
          ) : null}
        </View>
      </View>
      <ToastHost bottom={120} />
    </KeyboardAvoidingView>
  );
}

const bubbleStyle = (who: Who) => ({
  alignSelf: (who === 'me' ? 'flex-end' : 'flex-start') as 'flex-end' | 'flex-start',
  maxWidth: '86%' as const,
  backgroundColor: who === 'me' ? colors.ink : who === 'agent' ? colors.accentSoft : colors.card,
  borderRadius: 20,
  ...(who === 'me' ? { borderBottomLeftRadius: 6 } : { borderBottomRightRadius: 6 }),
  paddingHorizontal: 14, paddingVertical: 10,
});

export function Bubble({ m }: { m: ChatMsg }) {
  if (m.who === 'system') {
    return (
      <View style={{ alignSelf: 'center', backgroundColor: colors.soft, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5, marginVertical: 4, maxWidth: '92%' }}>
        <Muted size={12} center>{m.text}</Muted>
      </View>
    );
  }
  const mine = m.who === 'me';
  return (
    <View style={[bubbleStyle(m.who), { gap: 6 }]}>
      {m.name ? <T size={11.5} w="semibold" color={colors.muted}>{m.name}</T> : null}
      {m.photo ? <Image source={{ uri: m.photo }} style={{ width: 200, height: 150, borderRadius: 14, backgroundColor: colors.soft }} resizeMode="cover" /> : null}
      {m.text ? <T size={15} color={mine ? '#fff' : colors.ink}>{m.text}</T> : null}
      {m.lines ? (
        <View style={{ backgroundColor: colors.ground, borderRadius: 14, padding: 12, gap: 6, minWidth: 230 }}>
          {m.lines.map(([k, v]) => (
            <View key={k} style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
              <Muted size={13} style={{ width: 70 }}>{k}</Muted>
              <T size={14} w="medium" style={{ flex: 1 }}>{v}</T>
            </View>
          ))}
        </View>
      ) : null}
      {m.links?.map((l) => (
        <Pressable key={l.href} onPress={() => router.push(l.href as any)} accessibilityRole="link"
          style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.ground, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 }, pressed && { opacity: 0.7 }]}>
          <T size={14} w="semibold" style={{ flex: 1 }}>{l.label}</T>
          <Icon name="chevron-back" size={16} color={colors.muted} />
        </Pressable>
      ))}
    </View>
  );
}

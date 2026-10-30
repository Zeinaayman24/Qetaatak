import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { BottomNav, currentRole } from '@/components/AppHeader';
import { Mark } from '@/components/Brand';
import { Empty, Field, Icon, Loading, Muted, Press, Row, Screen, T } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { ago, ar, reqNo } from '@/lib/data';
import { useInbox, type Thread } from '@/lib/inbox';
import { brand, colors, radius } from '@/lib/theme';

/** The messages tab: every chat with shops (or customers, for a shop), newest first, with unread counts. */
export default function Messages() {
  const { ready, session, profile } = useAuth();
  const { threads, loading } = useInbox();
  const [q, setQ] = useState('');
  if (ready && !session) return <Redirect href="/login" />;
  const role = currentRole(profile);
  const n = q.trim();
  const shown = threads.filter((t) => (role === 'shop' ? t.me_is_shop : !t.me_is_shop))
    .filter((t) => !n || [t.part, t.other_name, String(t.num), reqNo(t.num)].join(' ').includes(n));

  return (
    <Screen nav={<BottomNav role={role} />}>
      <T w="bold" size={28} style={{ lineHeight: 40 }}>الرسائل</T>
      {threads.length > 4 ? <Field value={q} onChangeText={setQ} placeholder="دوّر بالقطعة أو رقم الطلب" icon="search" /> : null}

      {role === 'customer' ? (
        <Press onPress={() => router.push('/assistant')} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: radius.lg, backgroundColor: colors.ink }}>
          <View style={{ width: 50, height: 50, borderRadius: 25, backgroundColor: brand.navy, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,.15)' }}>
            <Mark size={40} />
          </View>
          <View style={{ flex: 1 }}>
            <T w="bold" size={15} color="#fff">مساعد ضغطة</T>
            <T size={12.5} color="rgba(255,255,255,.7)" numberOfLines={1}>اطلب قطعة بالكلام، أو قدّم شكوى</T>
          </View>
          <Icon name="chevron-back" size={18} color="rgba(255,255,255,.6)" />
        </Press>
      ) : null}

      {loading ? <Loading /> : shown.length ? (
        <View style={{ backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, overflow: 'hidden' }}>
          {shown.map((t, i) => <ThreadRow key={t.request_id + t.shop_id} t={t} last={i === shown.length - 1} />)}
        </View>
      ) : (
        <Empty icon="chatbubbles-outline" text={role === 'shop' ? 'لما عميل يسألك عن قطعة، المحادثة بتظهر هنا.' : 'لما تكلّم محل عن عرض، المحادثة بتظهر هنا.\nممكن تسأل المحل من صفحة العروض.'} />
      )}
    </Screen>
  );
}

function ThreadRow({ t, last }: { t: Thread; last: boolean }) {
  const preview = t.last_photo && !t.last_body ? '📷 صورة' : t.last_body;
  const unread = t.unread > 0;
  return (
    <Press onPress={() => router.push(`/chat/${t.request_id}/${t.shop_id}`)} label={t.other_name}
      style={[{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 13 }, !last && { borderBottomWidth: 1, borderColor: colors.line }]}>
      <View style={{ width: 50, height: 50, borderRadius: 25, backgroundColor: t.me_is_shop ? colors.soft : colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={t.me_is_shop ? 'person' : 'storefront'} size={22} color={t.me_is_shop ? colors.ink : colors.primary} />
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
        <Row style={{ justifyContent: 'space-between' }} gap={8}>
          <T w={unread ? 'bold' : 'semibold'} size={15} numberOfLines={1} style={{ flex: 1 }}>{t.other_name}</T>
          <Muted size={11.5}>{ago(t.last_at).replace('من ', '')}</Muted>
        </Row>
        <Muted size={12} numberOfLines={1}>{t.part}، طلب {reqNo(t.num)}{t.ordered ? '، أوردر مؤكد' : ''}</Muted>
        <Row gap={8}>
          <T size={13.5} w={unread ? 'semibold' : 'regular'} color={unread ? colors.ink : colors.muted} numberOfLines={1} style={{ flex: 1 }}>
            {t.last_mine ? 'انت: ' : ''}{preview}
          </T>
          {unread ? (
            <View style={{ minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}>
              <T size={11.5} w="bold" color="#fff" style={{ lineHeight: 16 }}>{ar(t.unread)}</T>
            </View>
          ) : null}
        </Row>
      </View>
    </Press>
  );
}

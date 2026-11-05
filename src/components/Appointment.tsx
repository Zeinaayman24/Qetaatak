import { ScrollView, View } from 'react-native';
import { ar, type ShopHours } from '@/lib/data';
import { isEn, t } from '@/lib/i18n';
import { dayName, hourLabel } from '@/lib/shops';
import { colors } from '@/lib/theme';
import { Muted, Press, T } from './ui';

const DAYS_AHEAD = 14;
const pad = (n: number) => String(n).padStart(2, '0');

/** The days and hours a shop can take an appointment, from its opening hours (days off skipped, at least an hour from now). */
export function slots(hours: ShopHours | null | undefined, from = new Date()) {
  const open = hours?.open ? parseInt(hours.open, 10) : 10;
  let close = hours?.close ? parseInt(hours.close, 10) : 21;
  if (close <= open) close = 24; // closes after midnight: take appointments until midnight
  const days: { key: string; date: Date; hours: number[] }[] = [];
  for (let i = 0; i < DAYS_AHEAD && days.length < 8; i++) {
    const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + i);
    if ((hours?.off ?? []).includes(d.getDay())) continue;
    const hs: number[] = [];
    for (let h = open; h < close; h++) {
      const at = new Date(d.getFullYear(), d.getMonth(), d.getDate(), h);
      if (at.getTime() - from.getTime() >= 60 * 60000) hs.push(h);
    }
    if (hs.length) days.push({ key: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, date: d, hours: hs });
  }
  return days;
}

const dayLabel = (d: Date, i: number) => {
  const today = new Date(); const tm = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  if (d.toDateString() === today.toDateString()) return t('النهارده');
  if (d.toDateString() === tm.toDateString()) return t('بكرة');
  return `${dayName(d.getDay())} ${isEn() ? d.getDate() : ar(d.getDate())}`;
};

/** Pick a day, then an hour. `value` is an ISO time (or ''). */
export function AppointmentPicker({ hours, value, onPick }: { hours: ShopHours | null | undefined; value: string; onPick: (iso: string) => void }) {
  const days = slots(hours);
  const cur = value ? new Date(value) : null;
  const curKey = cur ? `${cur.getFullYear()}-${pad(cur.getMonth() + 1)}-${pad(cur.getDate())}` : days[0]?.key;
  const day = days.find((d) => d.key === curKey) ?? days[0];
  if (!days.length) return <Muted>{t('مفيش مواعيد متاحة في الأيام الجاية. كلّم المحل.')}</Muted>;
  const chip = (on: boolean) => ({ paddingHorizontal: 14, paddingVertical: 9, borderRadius: 12, borderWidth: 1, borderColor: on ? colors.ink : colors.line, backgroundColor: on ? colors.ink : colors.surface });
  return (
    <View style={{ gap: 10 }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {days.map((d, i) => {
          const on = d.key === day.key;
          return (
            <Press key={d.key} selected={on} label={dayLabel(d.date, i)} style={chip(on)}
              onPress={() => { const h = cur && d.hours.includes(cur.getHours()) ? cur.getHours() : d.hours[0]; onPick(new Date(d.date.getFullYear(), d.date.getMonth(), d.date.getDate(), h).toISOString()); }}>
              <T size={13.5} w="semibold" color={on ? '#fff' : colors.ink}>{dayLabel(d.date, i)}</T>
            </Press>
          );
        })}
      </ScrollView>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {day.hours.map((h) => {
          const on = !!cur && cur.getHours() === h && curKey === day.key;
          return (
            <Press key={h} selected={on} label={hourLabel(pad(h))} style={chip(on)}
              onPress={() => onPick(new Date(day.date.getFullYear(), day.date.getMonth(), day.date.getDate(), h).toISOString())}>
              <T size={13.5} w={on ? 'semibold' : 'medium'} color={on ? '#fff' : colors.ink}>{hourLabel(pad(h))}</T>
            </Press>
          );
        })}
      </View>
    </View>
  );
}

/** "الخميس ١٢ · ٤ العصر" */
export function whenLabel(iso: string | null | undefined) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${dayLabel(d, 0)}${t("، ")}${hourLabel(pad(d.getHours()))}`;
}

import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { MakeLogo } from '@/components/MakeLogo';
import { BackBar, Chips, Field, Loading, Muted, Press, Screen, T } from '@/components/ui';
import { isElectrified, makeName, matches, useMakes, type Make } from '@/lib/catalogue';
import { t } from '@/lib/i18n';

type Filter = 'all' | 'electric' | 'china';
type Sort = 'popular' | 'name';

/** Every make in the catalogue: search, filter by electric/hybrid or Chinese makes, sort. Tapping one picks a car. */
export default function Brands() {
  const { makes, failed } = useMakes();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<Sort>('popular');
  const list = (makes ?? [])
    .filter((m) => matches(q, m.name_ar, m.name_en))
    .filter((m) => filter === 'all' || (filter === 'electric' ? m.powertrains.some(isElectrified) : m.country === 'الصين'))
    .sort((a: Make, b: Make) => (sort === 'name' ? makeName(a).localeCompare(makeName(b)) : (a.home_rank ?? 999) - (b.home_rank ?? 999) || a.name_ar.localeCompare(b.name_ar, 'ar')));

  return (
    <Screen>
      <BackBar title={t('كل الماركات')} onBack={() => (router.canGoBack() ? router.back() : router.replace('/customer'))} />
      <Field value={q} onChangeText={setQ} icon="search" placeholder={t('دوّر على الماركة، بالعربي أو بالإنجليزي')} />
      <Chips options={[{ v: 'all' as Filter, label: t('الكل') }, { v: 'electric' as Filter, label: t('كهربا وهايبرد'), icon: 'flash-outline' }, { v: 'china' as Filter, label: t('صيني') }]}
        selected={[filter]} onPick={setFilter} />
      <Chips options={[{ v: 'popular' as Sort, label: t('الأكثر طلبًا') }, { v: 'name' as Sort, label: t('بالاسم') }]} selected={[sort]} onPick={setSort} />
      {!makes ? (failed ? <Muted center>{t('الماركات مااتحمّلتش. اتأكد من النت.')}</Muted> : <Loading />) : list.length ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 16 }}>
          {list.map((m) => (
            <Press key={m.id} onPress={() => router.push({ pathname: '/cars', params: { make: m.id } })} label={m.name_ar} style={{ width: '25%', alignItems: 'center', gap: 6 }}>
              <MakeLogo make={m} size={60} />
              <T size={12.5} w="medium" numberOfLines={1}>{makeName(m)}</T>
            </Press>
          ))}
        </View>
      ) : <Muted center>{t('مفيش ماركة بالاسم ده.')}</Muted>}
    </Screen>
  );
}

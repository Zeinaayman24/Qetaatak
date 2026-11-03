import { useEffect, useState } from 'react';
import { Modal, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Btn, Chips, Field, Icon, IconButton, Loading, Muted, Press, Row, T } from './ui';
import { MakeLogo } from './MakeLogo';
import { POWERTRAINS, isElectrified, loadModels, matches, modelYears, useMakes, type Make, type Model, type Powertrain } from '@/lib/catalogue';
import { ar } from '@/lib/data';
import { colors } from '@/lib/theme';

export type PickedCar = { make: string; makeId: string | null; model: string; year: number; powertrain: Powertrain | '' };
type Step = 'make' | 'model' | 'year' | 'pt';
type Filter = 'all' | 'electric';

/**
 * Pick a car in three short steps: make → model → year. The powertrain is asked only when the
 * model comes in more than one (a Corolla can be petrol or hybrid; a Tesla is always electric).
 * A model that isn't in the catalogue yet can be typed by hand.
 */
export function CarPicker({ open, onClose, onDone, startMake }: {
  open: boolean; onClose: () => void; onDone: (c: PickedCar) => void; startMake?: string | null;
}) {
  const insets = useSafeAreaInsets();
  const { makes, failed } = useMakes();
  const [step, setStep] = useState<Step>('make');
  const [make, setMake] = useState<Make | null>(null);
  const [models, setModels] = useState<Model[] | null>(null);
  const [model, setModel] = useState<Model | null>(null);
  const [typed, setTyped] = useState('');
  const [year, setYear] = useState(0);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [pt, setPt] = useState<Powertrain | 'all'>('all');

  // opening from a make's logo jumps straight to its models
  useEffect(() => {
    if (!open) return;
    setQ(''); setTyped(''); setModel(null); setYear(0); setPt('all'); setFilter('all');
    const m = startMake && makes ? makes.find((x) => x.id === startMake) ?? null : null;
    if (m) pickMake(m); else { setMake(null); setStep('make'); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, startMake, makes]);

  function pickMake(m: Make) {
    setMake(m); setModels(null); setQ(''); setPt('all'); setStep('model');
    loadModels(m.id).then(setModels).catch(() => setModels([]));
  }
  function pickModel(m: Model | null, name = '') {
    setModel(m); setTyped(name); setQ(''); setStep('year');
  }
  function pickYear(y: number) {
    setYear(y);
    const pts = model?.powertrains ?? make?.powertrains ?? [];
    if (pts.length === 1) return finish(y, pts[0]);
    setStep('pt');
  }
  function finish(y: number, p: Powertrain | '') {
    if (!make) return;
    onDone({ make: make.name_ar, makeId: make.id, model: model?.name_ar ?? typed.trim(), year: y, powertrain: p });
  }
  const back = () => (step === 'pt' ? setStep('year') : step === 'year' ? setStep('model') : step === 'model' && !startMake ? setStep('make') : onClose());
  const title = step === 'make' ? 'اختار ماركة عربيتك' : step === 'model' ? `موديل ${make?.name_ar ?? ''}` : step === 'year' ? 'سنة الصنع' : 'نوع المحرك';

  const list = (makes ?? []).filter((m) => matches(q, m.name_ar, m.name_en) && (filter === 'all' || m.powertrains.some(isElectrified)));
  const modelList = (models ?? []).filter((m) => matches(q, m.name_ar, m.name_en) && (pt === 'all' || m.powertrains.includes(pt)));
  const pts = POWERTRAINS.filter((p) => (models ?? []).some((m) => m.powertrains.includes(p.v)));

  return (
    <Modal visible={open} animationType="slide" onRequestClose={back}>
      <View style={{ flex: 1, backgroundColor: colors.ground, paddingTop: insets.top }}>
        <View style={{ backgroundColor: colors.surface, borderBottomWidth: 1, borderColor: colors.line }}>
          <View style={{ width: '100%', maxWidth: 560, alignSelf: 'center', paddingHorizontal: 16, paddingVertical: 10, gap: 12 }}>
            <Row gap={10}>
              <IconButton name={step === 'make' || (step === 'model' && startMake) ? 'close' : 'chevron-forward'} label={step === 'make' ? 'اقفل' : 'رجوع'} onPress={back} size={40} />
              <View style={{ flex: 1 }}>
                <T w="bold" size={18}>{title}</T>
                {make && step !== 'make' ? <Muted size={13}>{[make.name_ar, model?.name_ar ?? typed, year ? ar(year) : ''].filter(Boolean).join(' · ')}</Muted> : null}
              </View>
              {make && step !== 'make' ? <MakeLogo make={make} size={40} /> : null}
            </Row>
            {step === 'make' || step === 'model' ? (
              <Field value={q} onChangeText={setQ} icon="search" placeholder={step === 'make' ? 'دوّر على الماركة' : 'دوّر على الموديل'} />
            ) : null}
            {step === 'make' ? (
              <Chips options={[{ v: 'all' as Filter, label: 'كل العربيات' }, { v: 'electric' as Filter, label: 'كهربا وهايبرد', icon: 'flash-outline' }]}
                selected={[filter]} onPick={setFilter} />
            ) : null}
            {step === 'model' && pts.length > 1 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                <Chips options={[{ v: 'all' as Powertrain | 'all', label: 'الكل' }, ...pts.map((p) => ({ v: p.v as Powertrain | 'all', label: p.short }))]}
                  selected={[pt]} onPick={setPt} />
              </ScrollView>
            ) : null}
          </View>
        </View>

        <ScrollView contentContainerStyle={{ width: '100%', maxWidth: 560, alignSelf: 'center', padding: 16, paddingBottom: 40 + insets.bottom, gap: 12 }} keyboardShouldPersistTaps="handled">
          {step === 'make' ? (
            !makes ? (failed ? <Muted center>الماركات مااتحمّلتش. اتأكد من النت.</Muted> : <Loading />) : list.length ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 16 }}>
                {list.map((m) => (
                  <Press key={m.id} onPress={() => pickMake(m)} label={m.name_ar} style={{ width: '25%', alignItems: 'center', gap: 6 }}>
                    <MakeLogo make={m} size={60} />
                    <T size={12.5} w="medium" center numberOfLines={1}>{m.name_ar}</T>
                  </Press>
                ))}
              </View>
            ) : <Muted center>مفيش ماركة بالاسم ده.</Muted>
          ) : null}

          {step === 'model' ? (
            !models ? <Loading /> : (
              <>
                {modelList.length ? (
                  <View style={{ backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.line, overflow: 'hidden' }}>
                    {modelList.map((m, i) => (
                      <Press key={m.id} onPress={() => pickModel(m)} label={m.name_ar}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, minHeight: 54, borderTopWidth: i ? 1 : 0, borderColor: '#EEF0F3' }}>
                        <View style={{ flex: 1 }}>
                          <T w="medium" size={15}>{m.name_ar}{m.name_en && m.name_en !== m.name_ar ? <T size={13} color={colors.muted}>{'  '}{m.name_en}</T> : null}</T>
                        </View>
                        {m.powertrains.some(isElectrified) ? (
                          <Muted size={12}>{m.powertrains.map((p) => POWERTRAINS.find((x) => x.v === p)?.short).join(' · ')}</Muted>
                        ) : null}
                        <Icon name="chevron-back" size={16} color={colors.faint} />
                      </Press>
                    ))}
                  </View>
                ) : <Muted center>{models.length ? 'مفيش موديل بالاسم ده.' : 'لسه مفيش موديلات للماركة دي.'}</Muted>}
                <View style={{ gap: 8, marginTop: 8 }}>
                  <T w="semibold" size={14}>مش لاقي عربيتك؟ اكتب الموديل</T>
                  <Field value={typed} onChangeText={setTyped} placeholder="مثلاً: سيراتو ٢" />
                  {typed.trim().length > 0 ? <Btn kind="secondary" title="كمّل" onPress={() => pickModel(null, typed.trim())} /> : null}
                </View>
              </>
            )
          ) : null}

          {step === 'year' ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {modelYears(model).map((y) => (
                <Press key={y} onPress={() => pickYear(y)} label={String(y)}
                  style={{ width: '23%', height: 48, borderRadius: 12, backgroundColor: y === year ? colors.ink : colors.surface, borderWidth: 1, borderColor: y === year ? colors.ink : colors.line, alignItems: 'center', justifyContent: 'center' }}>
                  <T w="medium" size={15} color={y === year ? '#fff' : colors.ink}>{ar(y)}</T>
                </Press>
              ))}
            </View>
          ) : null}

          {step === 'pt' ? (
            <View style={{ gap: 10 }}>
              <Muted size={14}>مكتوب في رخصة العربية. لو مش متأكد اختار «مش عارف».</Muted>
              <View style={{ backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.line, overflow: 'hidden' }}>
                {[...POWERTRAINS.filter((p) => (model?.powertrains ?? make?.powertrains ?? []).includes(p.v)), { v: '' as const, label: 'مش عارف', short: '' }].map((p, i) => (
                  <Press key={p.v || 'none'} onPress={() => finish(year, p.v)} label={p.label}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, minHeight: 54, borderTopWidth: i ? 1 : 0, borderColor: '#EEF0F3' }}>
                    <Icon name={p.v === 'ev' ? 'flash-outline' : p.v === 'hev' || p.v === 'phev' || p.v === 'erev' ? 'leaf-outline' : p.v ? 'water-outline' : 'help-circle-outline'} size={20} color={colors.ink} />
                    <T w="medium" size={15} style={{ flex: 1 }}>{p.label}</T>
                    <Icon name="chevron-back" size={16} color={colors.faint} />
                  </Press>
                ))}
              </View>
            </View>
          ) : null}
        </ScrollView>
      </View>
    </Modal>
  );
}

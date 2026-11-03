import { useState } from 'react';
import { Page, Pill, useData } from '../App';
import { date, must, supabase, useLive } from '../lib';

type PT = 'petrol' | 'diesel' | 'hev' | 'phev' | 'erev' | 'ev';
type Make = { id: string; name_ar: string; name_en: string; country: string; logo_url: string; home_rank: number | null; powertrains: PT[]; active: boolean };
type Model = { id: string; make_id: string; name_ar: string; name_en: string; year_from: number | null; year_to: number | null; powertrains: PT[]; sort: number; active: boolean };
type Miss = { make: string; model: string; requests: number; last_at: string };

const PTS: { v: PT; label: string }[] = [
  { v: 'petrol', label: 'بنزين' }, { v: 'diesel', label: 'ديزل' }, { v: 'hev', label: 'هايبرد' },
  { v: 'phev', label: 'Plug-in' }, { v: 'erev', label: 'EREV' }, { v: 'ev', label: 'كهربا' },
];
const toggle = <T,>(xs: T[], x: T) => (xs.includes(x) ? xs.filter((y) => y !== x) : [...xs, x]);
const num = (s: string) => (s.trim() === '' ? null : Number(s));

/** Car catalogue: makes (with logos and the home-screen order) and their models with powertrains. Admin only. */
export default function Cars() {
  const { role } = useData();
  const admin = role === 'admin';
  const { data, reload } = useLive(async () => {
    const makes = must(await supabase.from('car_makes').select('*').order('home_rank', { nullsFirst: false }).order('name_ar')) as Make[];
    const models = must(await supabase.from('car_models').select('*').order('sort').order('name_ar')) as Model[];
    const misses = must(await supabase.rpc('catalogue_misses')) as Miss[];
    return { makes, models, misses };
  }, ['car_makes', 'car_models']);
  const [sel, setSel] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [msg, setMsg] = useState('');
  const [newMake, setNewMake] = useState({ id: '', name_ar: '', name_en: '', country: '' });
  const [newModel, setNewModel] = useState({ name_ar: '', name_en: '', year_from: '', year_to: '', pts: ['petrol'] as PT[] });

  const makes = data?.makes ?? [];
  const models = data?.models ?? [];
  const make = makes.find((m) => m.id === sel) ?? null;
  const shown = makes.filter((m) => !q || m.name_ar.includes(q) || m.name_en.toLowerCase().includes(q.toLowerCase()));
  const run = async (f: () => Promise<unknown>, ok = '') => {
    setMsg('');
    try { await f(); if (ok) setMsg(ok); reload(); } catch (e: any) { setMsg(e?.message ?? 'حصلت مشكلة'); }
  };

  const updMake = (m: Make, p: Partial<Make>) => run(async () => must(await supabase.from('car_makes').update(p).eq('id', m.id)));
  const updModel = (m: Model, p: Partial<Model>) => run(async () => must(await supabase.from('car_models').update(p).eq('id', m.id)));

  async function uploadLogo(m: Make, file: File) {
    await run(async () => {
      const ext = (file.name.split('.').pop() || 'png').toLowerCase();
      const path = `${m.id}-${Date.now()}.${ext}`;
      must(await supabase.storage.from('brand-logos').upload(path, file, { contentType: file.type, upsert: true }));
      const url = supabase.storage.from('brand-logos').getPublicUrl(path).data.publicUrl;
      must(await supabase.from('car_makes').update({ logo_url: url }).eq('id', m.id));
    }, 'اللوجو اترفع.');
  }
  async function addMake() {
    const id = newMake.id.trim().toLowerCase();
    if (!/^[a-z0-9-]{2,40}$/.test(id)) return setMsg('الكود بالإنجليزي الصغير وشرطة بس، مثلاً great-wall.');
    if (!newMake.name_ar.trim() || !newMake.name_en.trim()) return setMsg('اكتب الاسم بالعربي والإنجليزي.');
    await run(async () => must(await supabase.from('car_makes').insert({ id, name_ar: newMake.name_ar.trim(), name_en: newMake.name_en.trim(), country: newMake.country.trim() })), 'الماركة اتضافت.');
    setNewMake({ id: '', name_ar: '', name_en: '', country: '' }); setSel(id);
  }
  async function addModel(makeId: string, name_ar: string, name_en = '', pts: PT[] = ['petrol'], yf: number | null = null, yt: number | null = null) {
    if (!name_ar.trim()) return setMsg('اكتب اسم الموديل.');
    if (!pts.length) return setMsg('اختار نوع محرك واحد على الأقل.');
    await run(async () => must(await supabase.from('car_models').insert({ make_id: makeId, name_ar: name_ar.trim(), name_en: name_en.trim(), powertrains: pts, year_from: yf, year_to: yt })), 'الموديل اتضاف.');
  }

  const noLogo = makes.filter((m) => !m.logo_url).length;
  return (
    <Page title="العربيات" sub="الماركات والموديلات اللي العميل بيختار منها. أي تغيير بيظهر في التطبيق على طول من غير تحديث.">
      <div className="kpis four">
        <div className="kpi"><span className="muted small">ماركات</span><strong>{makes.length}</strong></div>
        <div className="kpi"><span className="muted small">موديلات</span><strong>{models.length}</strong></div>
        <div className="kpi"><span className="muted small">ماركات من غير لوجو</span><strong>{noLogo}</strong><span className="muted small">بتظهر بالاسم لحد ما ترفع اللوجو</span></div>
        <div className="kpi"><span className="muted small">عربيات العملاء كتبوها بإيدهم</span><strong>{data?.misses.length ?? 0}</strong></div>
      </div>
      {!admin ? <p className="muted small">التعديل للأدمن بس.</p> : null}
      {msg ? <p className="muted small">{msg}</p> : null}

      {data?.misses.length ? (
        <section className="panel flush">
          <div className="panel-head" style={{ padding: '14px 16px 0' }}><h2>موديلات ناقصة من الكتالوج</h2></div>
          <p className="muted small" style={{ padding: '0 16px' }}>عملاء كتبوها بإيدهم. ضيفها عشان اللي بعدهم يلاقوها.</p>
          <table className="table">
            <thead><tr><th>الماركة</th><th>الموديل زي ما اتكتب</th><th>طلبات</th><th>آخر مرة</th><th></th></tr></thead>
            <tbody>
              {data.misses.map((x) => {
                const mk = makes.find((m) => m.name_ar === x.make);
                return (
                  <tr key={x.make + x.model}>
                    <td>{x.make}</td><td>{x.model}</td><td>{x.requests}</td><td className="muted small">{date(x.last_at)}</td>
                    <td>{admin && mk ? <button className="btn small ghost" onClick={() => addModel(mk.id, x.model)}>ضيفه لـ{mk.name_ar}</button> : <span className="muted small">{mk ? '' : 'الماركة مش في الكتالوج'}</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      ) : null}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.3fr)', gap: 16, alignItems: 'start' }}>
        <section className="panel flush">
          <div className="panel-head" style={{ padding: '14px 16px 0' }}><h2>الماركات</h2></div>
          <div style={{ padding: '8px 16px' }}><label className="input"><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="دوّر بالعربي أو بالإنجليزي" /></label></div>
          <table className="table">
            <thead><tr><th>اللوجو</th><th>الماركة</th><th title="الرقم = مكانها في الرئيسية، فاضي = مش في الرئيسية">في الرئيسية</th><th>موديلات</th></tr></thead>
            <tbody>
              {shown.map((m) => (
                <tr key={m.id} onClick={() => setSel(m.id)} style={{ cursor: 'pointer', background: sel === m.id ? 'var(--soft, #F2F4F7)' : undefined, opacity: m.active ? 1 : 0.5 }}>
                  <td>{m.logo_url ? <img src={m.logo_url} alt="" style={{ width: 32, height: 32, objectFit: 'contain' }} /> : <span className="muted small">—</span>}</td>
                  <td><strong>{m.name_ar}</strong><div className="small muted">{m.name_en}{m.country ? ` · ${m.country}` : ''}</div></td>
                  <td>{m.home_rank ?? ''}</td>
                  <td>{models.filter((x) => x.make_id === m.id).length}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {admin ? (
            <div style={{ padding: 16, display: 'grid', gap: 8 }}>
              <h3 style={{ margin: 0 }}>ماركة جديدة</h3>
              <label className="input"><span>الاسم بالعربي</span><input value={newMake.name_ar} onChange={(e) => setNewMake({ ...newMake, name_ar: e.target.value })} /></label>
              <label className="input"><span>الاسم بالإنجليزي</span><input dir="ltr" value={newMake.name_en} onChange={(e) => setNewMake({ ...newMake, name_en: e.target.value })} /></label>
              <label className="input"><span>الكود (إنجليزي صغير، مثلاً great-wall)</span><input dir="ltr" value={newMake.id} onChange={(e) => setNewMake({ ...newMake, id: e.target.value })} /></label>
              <label className="input"><span>البلد</span><input value={newMake.country} onChange={(e) => setNewMake({ ...newMake, country: e.target.value })} /></label>
              <button className="btn" onClick={addMake}>أضف الماركة</button>
            </div>
          ) : null}
        </section>

        <section className="panel">
          {!make ? <p className="muted">اختار ماركة من الجدول عشان تعدّلها وتشوف موديلاتها.</p> : (
            <>
              <div className="panel-head"><h2>{make.name_ar} <span className="muted small">{make.name_en}</span></h2>{!make.active ? <Pill tone="bad">مخفية</Pill> : null}</div>
              <div className="settings-grid">
                <label className="input"><span>اللوجو (PNG أو SVG بخلفية شفافة، مربع)</span>
                  <input type="file" accept="image/png,image/webp,image/svg+xml" disabled={!admin} onChange={(e) => e.target.files?.[0] && uploadLogo(make, e.target.files[0])} /></label>
                <label className="input"><span>مكانها في الرئيسية (١ = الأول، فاضي = مش ظاهرة)</span>
                  <input dir="ltr" defaultValue={make.home_rank ?? ''} key={make.id + 'r'} disabled={!admin} onBlur={(e) => updMake(make, { home_rank: num(e.target.value) })} /></label>
                <label className="input"><span>الاسم بالعربي (المحلات بتختار الماركات بالاسم ده)</span>
                  <input defaultValue={make.name_ar} key={make.id + 'a'} disabled={!admin} onBlur={(e) => e.target.value.trim() && e.target.value !== make.name_ar && updMake(make, { name_ar: e.target.value.trim() })} /></label>
                <label className="input"><span>الاسم بالإنجليزي</span>
                  <input dir="ltr" defaultValue={make.name_en} key={make.id + 'e'} disabled={!admin} onBlur={(e) => e.target.value.trim() && updMake(make, { name_en: e.target.value.trim() })} /></label>
              </div>
              <div className="row-actions">
                <span className="muted small">أنواع المحركات عند الماركة:</span>
                {PTS.map((p) => (
                  <label key={p.v} className="small" style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                    <input type="checkbox" disabled={!admin} checked={make.powertrains.includes(p.v)} onChange={() => updMake(make, { powertrains: toggle(make.powertrains, p.v) })} />{p.label}
                  </label>
                ))}
                {admin ? <button className="btn small ghost" onClick={() => updMake(make, { active: !make.active })}>{make.active ? 'اخفيها من التطبيق' : 'اظهرها في التطبيق'}</button> : null}
              </div>

              <h3>الموديلات</h3>
              <table className="table">
                <thead><tr><th>الموديل</th><th>من سنة</th><th>لسنة</th><th>المحرك</th><th></th></tr></thead>
                <tbody>
                  {models.filter((x) => x.make_id === make.id).map((m) => (
                    <tr key={m.id} style={{ opacity: m.active ? 1 : 0.5 }}>
                      <td><strong>{m.name_ar}</strong><div className="small muted">{m.name_en}</div></td>
                      <td><input dir="ltr" style={{ width: 64 }} defaultValue={m.year_from ?? ''} disabled={!admin} onBlur={(e) => updModel(m, { year_from: num(e.target.value) })} /></td>
                      <td><input dir="ltr" style={{ width: 64 }} defaultValue={m.year_to ?? ''} disabled={!admin} onBlur={(e) => updModel(m, { year_to: num(e.target.value) })} /></td>
                      <td>
                        {PTS.map((p) => (
                          <label key={p.v} className="small" style={{ display: 'inline-flex', gap: 3, marginInlineEnd: 6 }}>
                            <input type="checkbox" disabled={!admin} checked={m.powertrains.includes(p.v)}
                              onChange={() => { const next = toggle(m.powertrains, p.v); if (next.length) updModel(m, { powertrains: next }); }} />{p.label}
                          </label>
                        ))}
                      </td>
                      <td>{admin ? <button className="link" onClick={() => updModel(m, { active: !m.active })}>{m.active ? 'اخفي' : 'اظهر'}</button> : null}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {admin ? (
                <div className="settings-grid" style={{ marginTop: 12 }}>
                  <label className="input"><span>موديل جديد بالعربي</span><input value={newModel.name_ar} onChange={(e) => setNewModel({ ...newModel, name_ar: e.target.value })} /></label>
                  <label className="input"><span>بالإنجليزي</span><input dir="ltr" value={newModel.name_en} onChange={(e) => setNewModel({ ...newModel, name_en: e.target.value })} /></label>
                  <label className="input"><span>من سنة (اختياري)</span><input dir="ltr" value={newModel.year_from} onChange={(e) => setNewModel({ ...newModel, year_from: e.target.value })} /></label>
                  <label className="input"><span>لسنة (فاضي = لسه بيتعمل)</span><input dir="ltr" value={newModel.year_to} onChange={(e) => setNewModel({ ...newModel, year_to: e.target.value })} /></label>
                  <div className="row-actions">
                    {PTS.map((p) => (
                      <label key={p.v} className="small" style={{ display: 'inline-flex', gap: 4 }}>
                        <input type="checkbox" checked={newModel.pts.includes(p.v)} onChange={() => setNewModel({ ...newModel, pts: toggle(newModel.pts, p.v) })} />{p.label}
                      </label>
                    ))}
                    <button className="btn" onClick={async () => { await addModel(make.id, newModel.name_ar, newModel.name_en, newModel.pts, num(newModel.year_from), num(newModel.year_to)); setNewModel({ name_ar: '', name_en: '', year_from: '', year_to: '', pts: ['petrol'] }); }}>أضف الموديل</button>
                  </div>
                </div>
              ) : null}
            </>
          )}
        </section>
      </div>
    </Page>
  );
}

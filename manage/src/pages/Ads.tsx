import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Page, Pill, useData } from '../App';
import { date, must, photoUrl, supabase, useLive } from '../lib';

type Ad = {
  id: string; title: string; subtitle: string; image_path: string | null; link: string; advertiser: string;
  active: boolean; starts_at: string; ends_at: string | null; sort: number; views: number; clicks: number; created_at: string;
};
const blank = { title: '', subtitle: '', link: '', advertiser: '', ends: '', sort: '0' };
const live = (a: Ad) => a.active && new Date(a.starts_at) <= new Date() && (!a.ends_at || new Date(a.ends_at) > new Date());
const pct = (a: number, b: number) => (b ? ((a / b) * 100).toFixed(1) + '٪' : '—');

/** Revenue screen: home-screen ads sold to advertisers, and shops paying to be featured. */
export default function Ads() {
  const { all } = useData();
  const { data, reload } = useLive(async () => must(await supabase.from('ads').select('*').order('sort').order('created_at', { ascending: false })) as Ad[], ['ads']);
  const [form, setForm] = useState(blank);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const ads = data ?? [];
  const featured = Object.values(all.shops).filter((s) => s.featured_until && new Date(s.featured_until) > new Date());

  async function add() {
    if (!form.title.trim()) { setMsg('اكتب عنوان الإعلان.'); return; }
    setBusy(true); setMsg('');
    try {
      let image_path: string | null = null;
      if (file) {
        image_path = `ads/${crypto.randomUUID()}.${(file.name.split('.').pop() || 'jpg').toLowerCase()}`;
        must(await supabase.storage.from('photos').upload(image_path, file, { contentType: file.type }));
      }
      must(await supabase.from('ads').insert({
        title: form.title.trim(), subtitle: form.subtitle.trim(), link: form.link.trim(), advertiser: form.advertiser.trim(),
        sort: Number(form.sort) || 0, ends_at: form.ends ? new Date(form.ends + 'T23:59:59').toISOString() : null, image_path,
      }));
      setForm(blank); setFile(null); setMsg('الإعلان اتنشر.'); reload();
    } catch (e: any) { setMsg(e?.message ?? 'حصلت مشكلة'); } finally { setBusy(false); }
  }
  async function toggle(a: Ad) { must(await supabase.from('ads').update({ active: !a.active }).eq('id', a.id)); reload(); }
  async function remove(a: Ad) { if (confirm('تمسح الإعلان ده؟')) { must(await supabase.from('ads').delete().eq('id', a.id)); reload(); } }

  const views = ads.reduce((s, a) => s + a.views, 0), clicks = ads.reduce((s, a) => s + a.clicks, 0);
  return (
    <Page title="الإعلانات والمحلات المميزة" sub="مصدر الدخل الأساسي في الأول: من غير أي رسوم على المحلات.">
      <div className="kpis four">
        <div className="kpi"><span className="muted small">إعلانات شغالة</span><strong>{ads.filter(live).length}</strong></div>
        <div className="kpi"><span className="muted small">مرات الظهور</span><strong>{views.toLocaleString('ar-EG')}</strong></div>
        <div className="kpi"><span className="muted small">ضغطات</span><strong>{clicks.toLocaleString('ar-EG')}</strong><span className="muted small">نسبة الضغط {pct(clicks, views)}</span></div>
        <div className="kpi"><span className="muted small">محلات مميزة</span><strong>{featured.length}</strong></div>
      </div>

      <section className="panel">
        <div className="panel-head"><h2>إعلان جديد</h2></div>
        <p className="muted small">بيظهر للعملاء في أول الصفحة الرئيسية. مناسب لمراكز الصيانة، الزيوت، الكاوتش، التأمين، ومحلات عايزة تعلن عن نفسها.</p>
        <div className="settings-grid">
          <label className="input"><span>العنوان</span><input value={form.title} maxLength={60} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="خصم ٢٠٪ على تغيير الزيت" /></label>
          <label className="input"><span>سطر تحت العنوان</span><input value={form.subtitle} maxLength={120} onChange={(e) => setForm({ ...form, subtitle: e.target.value })} /></label>
          <label className="input"><span>المعلن</span><input value={form.advertiser} onChange={(e) => setForm({ ...form, advertiser: e.target.value })} /></label>
          <label className="input"><span>اللينك (موقع، واتساب، أو صفحة في التطبيق زي /shop-profile/…)</span><input dir="ltr" value={form.link} onChange={(e) => setForm({ ...form, link: e.target.value })} placeholder="https://" /></label>
          <label className="input"><span>آخر يوم (اختياري)</span><input type="date" value={form.ends} onChange={(e) => setForm({ ...form, ends: e.target.value })} /></label>
          <label className="input"><span>الترتيب (الأصغر الأول)</span><input dir="ltr" value={form.sort} onChange={(e) => setForm({ ...form, sort: e.target.value })} /></label>
          <label className="input"><span>صورة (عرضها أكبر من طولها، ١٢٠٠×٥٠٠ مثلاً)</span><input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></label>
        </div>
        <div className="row-actions"><button className="btn" disabled={busy} onClick={add}>{busy ? 'بننشر…' : 'انشر الإعلان'}</button>{msg ? <span className="muted small">{msg}</span> : null}</div>
      </section>

      <section className="panel flush">
        <div className="panel-head" style={{ padding: '14px 16px 0' }}><h2>كل الإعلانات</h2></div>
        {ads.length ? (
          <table className="table">
            <thead><tr><th>الإعلان</th><th>المعلن</th><th>الحالة</th><th>لحد</th><th>ظهور</th><th>ضغطات</th><th></th></tr></thead>
            <tbody>
              {ads.map((a) => (
                <tr key={a.id}>
                  <td>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                      {a.image_path ? <img src={photoUrl(a.image_path)!} alt="" style={{ width: 72, height: 32, objectFit: 'cover', borderRadius: 6 }} /> : null}
                      <div><strong>{a.title}</strong><div className="small muted">{a.subtitle}</div></div>
                    </div>
                  </td>
                  <td>{a.advertiser || '—'}</td>
                  <td><Pill tone={live(a) ? 'good' : a.active ? 'wait' : 'plain'}>{live(a) ? 'شغال' : a.active ? 'منتهي / لسه' : 'متوقف'}</Pill></td>
                  <td>{a.ends_at ? date(a.ends_at) : 'مفتوح'}</td>
                  <td className="mono">{a.views}</td>
                  <td className="mono">{a.clicks} <span className="muted small">({pct(a.clicks, a.views)})</span></td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button className="btn ghost" onClick={() => toggle(a)}>{a.active ? 'وقّف' : 'شغّل'}</button>{' '}
                    <button className="btn danger" onClick={() => remove(a)}>امسح</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p className="empty">مفيش إعلانات لسه.</p>}
      </section>

      <section className="panel">
        <div className="panel-head"><h2>المحلات المميزة</h2></div>
        <p className="muted small">المحل المميز عروضه بتظهر الأول عند العميل وعليها علامة «محل مميز». بتفعّلها من صفحة المحل (المحلات ← المحل ← «خلّيه مميز»).</p>
        {featured.length ? (
          <ul className="small" style={{ margin: 0, paddingInlineStart: 18 }}>
            {featured.map((s) => <li key={s.id}><Link to={`/shops/${s.id}`}>{all.priv[s.id]?.name ?? 'محل'}</Link>، لحد {date(s.featured_until!)}</li>)}
          </ul>
        ) : <p className="empty">مفيش محلات مميزة دلوقتي.</p>}
      </section>
    </Page>
  );
}

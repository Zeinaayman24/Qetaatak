import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Page, Pill, useData } from '../App';
import { date, must, supabase, useLive } from '../lib';

type Service = { id: string; name_ar: string; name_en: string; category: string; sort: number; active: boolean };
type Booking = {
  id: string; num: number; shop_id: string; customer_id: string; appointment_at: string; price: number | null; status: string;
  price_change: number | null; dispute_note: string; cancel_note: string; cancelled_by: string; rating: number | null; review: string; created_at: string;
};
type Req = { id: string; num: number; service_id: string; status: string; car_make: string; car_model: string; governorate: string; created_at: string };

const STATUS: Record<string, { label: string; tone: 'plain' | 'good' | 'wait' | 'bad' | 'dark' }> = {
  pending: { label: 'مستني المحل', tone: 'wait' }, confirmed: { label: 'متأكّد', tone: 'plain' }, in_progress: { label: 'شغّال', tone: 'plain' },
  ready: { label: 'خلص · مستني العميل', tone: 'wait' }, done: { label: 'تمّ', tone: 'good' }, cancelled: { label: 'اتلغى', tone: 'plain' }, disputed: { label: 'فيه مشكلة', tone: 'bad' },
};
const blank = { id: '', name_ar: '', name_en: '', category: '', sort: '50' };

/** Installation: the services catalogue shops pick from, install requests, and bookings (with disputes to settle). */
export default function Install() {
  const { id: focus } = useParams();
  const { all } = useData();
  const { data, reload } = useLive(async () => {
    const [s, b, r] = await Promise.all([
      supabase.from('install_services').select('*').order('sort'),
      supabase.from('bookings').select('*').order('created_at', { ascending: false }).limit(300),
      supabase.from('install_requests').select('id, num, service_id, status, car_make, car_model, governorate, created_at').order('created_at', { ascending: false }).limit(300),
    ]);
    return { services: must(s) as Service[], bookings: must(b) as Booking[], reqs: must(r) as Req[] };
  }, ['install_services', 'bookings', 'install_requests']);
  const [form, setForm] = useState(blank);
  const [msg, setMsg] = useState('');
  const [filter, setFilter] = useState(focus ? 'all' : 'open');
  const services = data?.services ?? [];
  const bookings = data?.bookings ?? [];
  const reqs = data?.reqs ?? [];
  const svc = (id: string) => services.find((s) => s.id === id)?.name_ar ?? id;
  const shopName = (id: string) => all.priv[id]?.name ?? 'محل';
  const custName = (id: string) => all.byId[id]?.full_name ?? 'عميل';

  async function add() {
    setMsg('');
    const id = form.id.trim().toLowerCase();
    if (!/^[a-z0-9-]{2,40}$/.test(id)) { setMsg('الكود بالإنجليزي الصغير وأرقام وشرطة بس، مثلاً wheel-alignment.'); return; }
    if (!form.name_ar.trim()) { setMsg('اكتب الاسم بالعربي.'); return; }
    const { error } = await supabase.from('install_services').insert({ id, name_ar: form.name_ar.trim(), name_en: form.name_en.trim(), category: form.category.trim(), sort: Number(form.sort) || 50 });
    if (error) { setMsg(error.message); return; }
    setForm(blank); setMsg('الخدمة اتضافت.'); reload();
  }
  async function save(s: Service, patch: Partial<Service>) {
    const { error } = await supabase.from('install_services').update(patch).eq('id', s.id);
    if (error) alert(error.message); else reload();
  }
  async function resolve(b: Booking, outcome: 'done' | 'cancelled') {
    const note = prompt(outcome === 'done' ? 'اكتب القرار (هيوصل للعميل والمحل):' : 'سبب الإلغاء (هيوصل للعميل والمحل):');
    if (!note?.trim()) return;
    const { error } = await supabase.rpc('staff_resolve_booking', { p_booking: b.id, p_outcome: outcome, p_note: note.trim() });
    if (error) alert(error.message); else reload();
  }

  const shown = bookings.filter((b) => (focus ? b.id === focus : filter === 'all' ? true : filter === 'disputed' ? b.status === 'disputed' : !['done', 'cancelled'].includes(b.status)));
  const disputed = bookings.filter((b) => b.status === 'disputed').length;
  const openReqs = reqs.filter((r) => r.status === 'open');

  return (
    <Page title="التركيب" sub="خدمات التركيب اللي المحلات بتختار منها، وطلبات التركيب والحجوزات.">
      <div className="kpis four">
        <div className="kpi"><span className="muted small">طلبات مستنية عروض</span><strong>{openReqs.length}</strong></div>
        <div className="kpi"><span className="muted small">حجوزات شغالة</span><strong>{bookings.filter((b) => !['done', 'cancelled'].includes(b.status)).length}</strong></div>
        <div className="kpi"><span className="muted small">مشاكل محتاجة قرار</span><strong>{disputed}</strong></div>
        <div className="kpi"><span className="muted small">تركيبات خلصت</span><strong>{bookings.filter((b) => b.status === 'done').length}</strong></div>
      </div>

      <section className="panel flush">
        <div className="panel-head" style={{ padding: '14px 16px 0', display: 'flex', gap: 8, alignItems: 'center' }}>
          <h2 style={{ flex: 1 }}>الحجوزات</h2>
          {focus ? <Link to="/install">كل الحجوزات</Link> : (
            <select value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="open">الشغالة</option><option value="disputed">فيها مشكلة</option><option value="all">الكل</option>
            </select>
          )}
        </div>
        {shown.length ? (
          <table className="table">
            <thead><tr><th>#</th><th>المحل</th><th>العميل</th><th>المعاد</th><th>السعر</th><th>الحالة</th><th></th></tr></thead>
            <tbody>
              {shown.map((b) => (
                <tr key={b.id}>
                  <td className="mono">{b.num}</td>
                  <td><Link to={`/shops/${b.shop_id}`}>{shopName(b.shop_id)}</Link></td>
                  <td><Link to={`/customers/${b.customer_id}`}>{custName(b.customer_id)}</Link></td>
                  <td>{new Date(b.appointment_at).toLocaleString('ar-EG', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric' })}</td>
                  <td className="mono">{b.price != null ? Number(b.price).toLocaleString('ar-EG') : 'بعد المعاينة'}{b.price_change != null ? <div className="small muted">طالب {b.price_change}</div> : null}</td>
                  <td>
                    <Pill tone={STATUS[b.status]?.tone ?? 'plain'}>{STATUS[b.status]?.label ?? b.status}</Pill>
                    {b.dispute_note ? <div className="small">«{b.dispute_note}»</div> : null}
                    {b.cancel_note ? <div className="small muted">{b.cancelled_by}: {b.cancel_note}</div> : null}
                    {b.rating ? <div className="small muted">{b.rating} ★ {b.review}</div> : null}
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {!['done', 'cancelled'].includes(b.status) ? (<>
                      <button className="btn ghost" onClick={() => resolve(b, 'done')}>اقفل كـ «تمّ»</button>{' '}
                      <button className="btn danger" onClick={() => resolve(b, 'cancelled')}>الغي</button>
                    </>) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p className="empty">مفيش حجوزات هنا.</p>}
      </section>

      <section className="panel flush">
        <div className="panel-head" style={{ padding: '14px 16px 0' }}><h2>طلبات التركيب المفتوحة</h2></div>
        {openReqs.length ? (
          <table className="table">
            <thead><tr><th>#</th><th>الخدمة</th><th>العربية</th><th>المحافظة</th><th>من</th></tr></thead>
            <tbody>{openReqs.map((r) => <tr key={r.id}><td className="mono">{r.num}</td><td>{svc(r.service_id)}</td><td>{r.car_make} {r.car_model}</td><td>{r.governorate || '—'}</td><td>{date(r.created_at)}</td></tr>)}</tbody>
          </table>
        ) : <p className="empty">مفيش طلبات مفتوحة.</p>}
      </section>

      <section className="panel">
        <div className="panel-head"><h2>خدمات التركيب</h2></div>
        <p className="muted small">المحلات بتختار منها وتحط سعرها. الخدمة الموقوفة مش بتظهر للعملاء ولا للمحلات الجديدة.</p>
        <table className="table">
          <thead><tr><th>الكود</th><th>الاسم بالعربي</th><th>بالإنجليزي</th><th>القسم</th><th>الترتيب</th><th>الحالة</th></tr></thead>
          <tbody>
            {services.map((s) => (
              <tr key={s.id}>
                <td className="mono small">{s.id}</td>
                <td><input defaultValue={s.name_ar} onBlur={(e) => e.target.value.trim() && e.target.value !== s.name_ar && save(s, { name_ar: e.target.value.trim() })} /></td>
                <td><input dir="ltr" defaultValue={s.name_en} onBlur={(e) => e.target.value !== s.name_en && save(s, { name_en: e.target.value.trim() })} /></td>
                <td><input defaultValue={s.category} onBlur={(e) => e.target.value !== s.category && save(s, { category: e.target.value.trim() })} style={{ width: 90 }} /></td>
                <td><input dir="ltr" defaultValue={String(s.sort)} onBlur={(e) => Number(e.target.value) !== s.sort && save(s, { sort: Number(e.target.value) || 0 })} style={{ width: 60 }} /></td>
                <td><button className={s.active ? 'btn ghost' : 'btn'} onClick={() => save(s, { active: !s.active })}>{s.active ? 'شغالة · وقّف' : 'موقوفة · شغّل'}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="settings-grid" style={{ marginTop: 12 }}>
          <label className="input"><span>الكود (إنجليزي)</span><input dir="ltr" value={form.id} onChange={(e) => setForm({ ...form, id: e.target.value })} placeholder="wheel-alignment" /></label>
          <label className="input"><span>الاسم بالعربي</span><input value={form.name_ar} onChange={(e) => setForm({ ...form, name_ar: e.target.value })} placeholder="ضبط زوايا" /></label>
          <label className="input"><span>الاسم بالإنجليزي</span><input dir="ltr" value={form.name_en} onChange={(e) => setForm({ ...form, name_en: e.target.value })} /></label>
          <label className="input"><span>القسم</span><input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} /></label>
          <label className="input"><span>الترتيب</span><input dir="ltr" value={form.sort} onChange={(e) => setForm({ ...form, sort: e.target.value })} /></label>
        </div>
        <div className="row-actions"><button className="btn" onClick={add}>أضف الخدمة</button>{msg ? <span className="muted small">{msg}</span> : null}</div>
      </section>
    </Page>
  );
}

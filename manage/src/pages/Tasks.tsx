import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Page, Pill, useData } from '../App';
import { money, supabase, useLive } from '../lib';

type Task = { kind: string; ref: string; title: string; details: string; link: string; due_at: string; assigned_to: string | null; assigned_name: string | null; task_id: number | null };
type Today = { requests: number; orders: number; sales: number; commission: number; with_offer_pct: number | null; shops_open: number };

/** «المهام» (C02): one queue, most urgent deadline first. */
export default function Tasks() {
  const { me } = useData();
  const nav = useNavigate();
  const [filter, setFilter] = useState<'all' | 'mine' | 'late'>('all');
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(t); }, []);
  const { data, reload } = useLive(async () => {
    const [t, d] = await Promise.all([supabase.rpc('staff_task_list'), supabase.rpc('staff_today')]);
    if (t.error) throw t.error;
    return { tasks: (t.data ?? []) as Task[], today: (d.data ?? null) as Today | null };
  }, ['reports', 'orders', 'shops', 'shop_settlements', 'data_requests', 'staff_tasks', 'task_claims']);

  const tasks = data?.tasks ?? [];
  const late = (t: Task) => new Date(t.due_at).getTime() < now;
  const shown = tasks.filter((t) => filter === 'all' || (filter === 'mine' ? t.assigned_to === me.id : late(t)));
  const span = (ms: number) => {
    const m = Math.round(Math.abs(ms) / 60000);
    if (m < 60) return `${m} دقيقة`;
    const h = Math.floor(m / 60);
    return h < 48 ? `${h} ساعة${m % 60 ? ` و${m % 60} دقيقة` : ''}` : `${Math.round(h / 24)} يوم`;
  };
  async function claim(t: Task) { await supabase.rpc('claim_task', { p_kind: t.kind, p_ref: t.ref }); reload(); }
  async function finish(t: Task) { if (t.task_id) { await supabase.rpc('finish_task', { p_id: t.task_id, p_note: '' }); reload(); } }
  const d = data?.today;

  return (
    <Page title="المهام" sub={`أهلاً ${me.full_name || ''} · عندك ${tasks.length} مهمة، منهم ${tasks.filter(late).length} متأخرة.`}>
      {d ? (
        <div className="strip">
          <div><span className="muted small">طلبات النهارده</span><strong>{d.requests}</strong></div>
          <div><span className="muted small">أوردرات النهارده</span><strong>{d.orders}</strong></div>
          <div><span className="muted small">مبيعات النهارده (ج.م)</span><strong>{money(d.sales).replace(' ج.م', '')}</strong></div>
          <div><span className="muted small">عمولة النهارده (ج.م)</span><strong>{money(d.commission).replace(' ج.م', '')}</strong></div>
          <div><span className="muted small">طلبات لقت عرض (٪)</span><strong>{d.with_offer_pct ?? '—'}</strong></div>
          <div><span className="muted small">محلات شغالة دلوقتي</span><strong>{d.shops_open}</strong></div>
        </div>
      ) : null}
      <div className="tabs" style={{ alignSelf: 'flex-start' }}>
        {([['all', 'الكل'], ['mine', 'مهامي'], ['late', 'متأخرة']] as const).map(([v, l]) => (
          <button key={v} className={'tab' + (filter === v ? ' active' : '')} onClick={() => setFilter(v)}>{l}</button>
        ))}
      </div>
      <section className="panel flush">
        {shown.length ? (
          <table className="table">
            <tbody>{shown.map((t) => {
              const ms = new Date(t.due_at).getTime() - now;
              return (
                <tr key={t.kind + t.ref}>
                  <td><strong>{t.title}</strong><div className="muted small">{t.details}</div></td>
                  <td className={ms < 0 ? 'late' : ''} style={{ whiteSpace: 'nowrap' }}>{ms < 0 ? `متأخر ${span(ms)}` : `فاضل ${span(ms)}`}</td>
                  <td>{t.assigned_name ? <Pill>{t.assigned_name}</Pill> : <button className="link" onClick={() => claim(t)}>خدها</button>}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button className="btn" onClick={() => nav(t.link)}>افتح</button>
                    {t.task_id ? <button className="link" onClick={() => finish(t)} style={{ marginInlineStart: 8 }}>خلصت</button> : null}
                  </td>
                </tr>
              );
            })}</tbody>
          </table>
        ) : <p className="empty">مفيش مهام دلوقتي.</p>}
      </section>
    </Page>
  );
}

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Page, Pill, useData } from '../App';
import { must, supabase, useLive } from '../lib';

export type Speed = { shop_id: string; answered: number; median_min: number | null; avg_min: number | null; within_15: number; waiting: number; oldest_wait_min: number | null };
type Wait = { request_id: string; first_answer_at: string | null; answers: number };
const SLOW = 15;

/** Live stopwatch text: 45 ث، 12 د، 1 س 5 د. */
export function clock(fromMs: number, now: number) {
  const s = Math.max(0, Math.floor((now - fromMs) / 1000));
  if (s < 60) return `${s} ث`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} د`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h} س ${m % 60 ? (m % 60) + ' د' : ''}` : `${Math.floor(h / 24)} يوم`;
}
export const mins = (m: number | null | undefined) => (m == null ? '—' : m < 1 ? 'أقل من دقيقة' : m < 60 ? `${m} د` : `${Math.floor(m / 60)} س ${m % 60 ? (m % 60) + ' د' : ''}`);

export function useSpeed() {
  return useLive(async () => must(await supabase.rpc('shop_speed')) as Speed[], ['quotes', 'requests'], []);
}
function useTick(ms = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(t); }, [ms]);
  return now;
}

/** How fast shops answer: every open request with a live timer, and each shop's typical reply time. */
export default function SpeedPage() {
  const { all } = useData();
  const now = useTick();
  const { data: speed } = useSpeed();
  const { data: waits } = useLive(async () => must(await supabase.rpc('request_waits')) as Wait[], ['quotes', 'requests'], []);
  const w = Object.fromEntries((waits ?? []).map((x) => [x.request_id, x]));
  const open = all.requests.filter((r) => r.status === 'open' && w[r.id]).sort((a, b) => a.created_at.localeCompare(b.created_at));
  const unanswered = open.filter((r) => !w[r.id].first_answer_at);
  const rows = [...(speed ?? [])].sort((a, b) => (a.median_min ?? 1e9) - (b.median_min ?? 1e9));
  const answered = rows.reduce((s, r) => s + r.answered, 0);
  const fast = rows.reduce((s, r) => s + r.within_15, 0);
  const firsts = (waits ?? []).filter((x) => x.first_answer_at).map((x) => {
    const r = all.requests.find((y) => y.id === x.request_id);
    return r ? (new Date(x.first_answer_at!).getTime() - new Date(r.created_at).getTime()) / 60000 : null;
  }).filter((x): x is number => x != null).sort((a, b) => a - b);
  const medianFirst = firsts.length ? Math.round(firsts[Math.floor(firsts.length / 2)]) : null;

  return (
    <Page title="سرعة الرد" sub="أهم رقم في ضغطة: العميل بيستنى قد إيه لحد أول رد من محل. الأرقام بتتحدث لوحدها كل ثانية.">
      <div className="kpis four">
        <div className={'kpi' + (unanswered.length ? ' hot' : '')}><span className="muted small">طلبات لسه محدش رد عليها</span><strong>{unanswered.length}</strong>
          <span className="muted small">{unanswered.filter((r) => (now - new Date(r.created_at).getTime()) / 60000 >= SLOW).length} عدّت {SLOW} دقيقة</span></div>
        <div className="kpi"><span className="muted small">أول رد على الطلب (الوسيط، ٣٠ يوم)</span><strong>{mins(medianFirst)}</strong></div>
        <div className="kpi"><span className="muted small">ردود في أقل من {SLOW} دقيقة</span><strong>{answered ? Math.round((fast / answered) * 100) + '٪' : '—'}</strong><span className="muted small">{fast} من {answered} رد</span></div>
        <div className="kpi"><span className="muted small">طلبات مفتوحة</span><strong>{open.length}</strong></div>
      </div>

      <section className="panel flush">
        <div className="panel-head" style={{ padding: '14px 16px 0' }}><h2>الطلبات المفتوحة دلوقتي</h2><span className="muted small">الأقدم الأول</span></div>
        {open.length ? (
          <table className="table">
            <thead><tr><th>الطلب</th><th>القطعة</th><th>العربية</th><th>مستني من</th><th>أول رد بعد</th><th>ردود</th></tr></thead>
            <tbody>
              {open.map((r) => {
                const x = w[r.id];
                const start = new Date(r.created_at).getTime();
                const waitMin = (now - start) / 60000;
                return (
                  <tr key={r.id} className={!x.first_answer_at && waitMin >= SLOW ? 'late' : ''}>
                    <td className="mono">#{r.num}</td>
                    <td>{r.part}</td>
                    <td className="small">{r.car_make} {r.car_model} {r.car_year}، {r.area}</td>
                    <td><span className={'timer' + (!x.first_answer_at ? (waitMin >= SLOW ? ' bad' : ' live') : '')}>{clock(start, now)}</span></td>
                    <td>{x.first_answer_at ? clock(start, new Date(x.first_answer_at).getTime()) : <Pill tone={waitMin >= SLOW ? 'bad' : 'wait'}>لسه</Pill>}</td>
                    <td>{x.answers}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : <p className="empty">مفيش طلبات مفتوحة دلوقتي.</p>}
      </section>

      <section className="panel flush">
        <div className="panel-head" style={{ padding: '14px 16px 0' }}><h2>كل محل بيرد في قد إيه</h2><span className="muted small">آخر ٩٠ يوم، على الطلبات اللي تخص ماركاته</span></div>
        {rows.length ? (
          <table className="table">
            <thead><tr><th>المحل</th><th>بيرد عادةً في</th><th>المتوسط</th><th>في أقل من {SLOW} د</th><th>رد على</th><th>مستني ردّه دلوقتي</th><th>أقدم طلب مستني</th></tr></thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.shop_id}>
                  <td><Link to={`/shops/${s.shop_id}`}>{all.priv[s.shop_id]?.name ?? 'محل'}</Link><div className="small muted">{all.shops[s.shop_id]?.area}</div></td>
                  <td><strong>{mins(s.median_min)}</strong></td>
                  <td>{mins(s.avg_min)}</td>
                  <td>{s.answered ? Math.round((s.within_15 / s.answered) * 100) + '٪' : '—'}</td>
                  <td>{s.answered}</td>
                  <td>{s.waiting ? <Pill tone="wait">{s.waiting}</Pill> : '0'}</td>
                  <td>{s.oldest_wait_min != null ? <span className={'timer' + (s.oldest_wait_min >= SLOW ? ' bad' : ' live')}>{mins(s.oldest_wait_min)}</span> : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p className="empty">لسه مفيش بيانات.</p>}
      </section>
    </Page>
  );
}

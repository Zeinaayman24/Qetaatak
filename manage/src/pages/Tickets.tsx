import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Page, Pill, useData } from '../App';
import { CATEGORY, PRIORITY, TICKET_STATUS, ago, memberId, needsPeople, ticketId } from '../lib';

export default function Tickets() {
  const { all, me } = useData();
  const nav = useNavigate();
  const [status, setStatus] = useState<'active' | 'open' | 'in_progress' | 'bot' | 'resolved' | 'all'>('active');
  const [mine, setMine] = useState(false);
  const [q, setQ] = useState('');
  const staff = all.profiles.filter((p) => p.is_admin || p.is_support);
  const n = q.trim().toLowerCase();
  const rank = { high: 0, normal: 1, low: 2 } as const;
  const shown = all.tickets
    .filter((t) => status === 'all' ? true : status === 'active' ? needsPeople(t) : t.status === status)
    .filter((t) => !mine || t.assigned_to === me.id)
    .filter((t) => {
      if (!n) return true;
      const p = all.byId[t.reporter_id];
      return [ticketId(t.ticket_no), t.body, p?.full_name, all.priv[t.reporter_id]?.name, memberId(p), p?.phone].join(' ').toLowerCase().includes(n);
    })
    .sort((a, b) => (status === 'resolved' ? 0 : rank[a.priority] - rank[b.priority]) || b.updated_at.localeCompare(a.updated_at));
  const counts = { open: all.tickets.filter((t) => t.status === 'open').length, in_progress: all.tickets.filter((t) => t.status === 'in_progress').length, bot: all.tickets.filter((t) => t.status === 'bot').length };

  return (
    <Page title="خدمة العملاء" sub={`${counts.open} مستنية موظف · ${counts.in_progress} مع موظف · ${counts.bot} مع المساعد الآلي`}>
      <div className="toolbar">
        <div className="tabs">
          {([['active', 'محتاجة موظف'], ['open', 'مستنية'], ['in_progress', 'مع موظف'], ['bot', 'مع المساعد'], ['resolved', 'انتهت'], ['all', 'الكل']] as const).map(([k, v]) => (
            <button key={k} className={'tab' + (status === k ? ' on' : '')} onClick={() => setStatus(k)}>{v}</button>
          ))}
        </div>
        <label className="check"><input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} /> المتحوّلة ليّا</label>
        <input className="search" placeholder="دوّر برقم الشكوى (T-1001)، الاسم، رقم العميل…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="panel flush">
        <table className="table clickable">
          <thead><tr><th>الشكوى</th><th>من</th><th>النوع</th><th>التفاصيل</th><th>الأولوية</th><th>مسؤول</th><th>الحالة</th><th>آخر تحديث</th></tr></thead>
          <tbody>
            {shown.map((t) => {
              const p = all.byId[t.reporter_id];
              return (
                <tr key={t.id} onClick={() => nav(`/tickets/${t.id}`)} className={t.status === 'open' ? 'unread' : ''}>
                  <td className="mono strong">{ticketId(t.ticket_no)}</td>
                  <td>{p?.is_shop ? all.priv[t.reporter_id]?.name : p?.full_name}<div className="mono small muted">{memberId(p)}</div></td>
                  <td>{CATEGORY[t.category]}</td>
                  <td className="small"><div className="clamp">{t.body}</div></td>
                  <td><Pill tone={t.priority === 'high' ? 'bad' : t.priority === 'low' ? 'plain' : 'dark'}>{PRIORITY[t.priority]}</Pill></td>
                  <td className="small">{t.assigned_to ? staff.find((s) => s.id === t.assigned_to)?.full_name || 'موظف' : '—'}</td>
                  <td><Pill tone={t.status === 'resolved' ? 'good' : t.status === 'open' ? 'wait' : t.status === 'bot' ? 'plain' : 'dark'}>{TICKET_STATUS[t.status]}</Pill></td>
                  <td className="small muted">{ago(t.updated_at)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!shown.length ? <p className="empty">مفيش شكاوى هنا.</p> : null}
      </div>
    </Page>
  );
}

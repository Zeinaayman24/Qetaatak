import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Page, Pill, useData } from '../App';
import { date, memberId } from '../lib';

export default function Customers() {
  const { all } = useData();
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [gov, setGov] = useState('');
  const list = all.profiles.filter((p) => p.is_customer);
  const govs = Array.from(new Set(list.map((p) => p.governorate).filter(Boolean))).sort();
  const n = q.trim().toLowerCase();
  const shown = list.filter((p) => (!gov || p.governorate === gov) &&
    (!n || [memberId(p), p.full_name, p.phone, p.email, p.area].join(' ').toLowerCase().includes(n)));
  return (
    <Page title="العملاء" sub={`${list.length} عميل مسجّل`}>
      <div className="toolbar">
        <input className="search" placeholder="دوّر بالرقم (C-10001)، الاسم، الموبايل، الإيميل…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={gov} onChange={(e) => setGov(e.target.value)}><option value="">كل المحافظات</option>{govs.map((g) => <option key={g}>{g}</option>)}</select>
      </div>
      <div className="panel flush">
        <table className="table clickable">
          <thead><tr><th>رقم العميل</th><th>الاسم</th><th>الموبايل</th><th>الإيميل</th><th>المنطقة</th><th>العربية</th><th>الطلبات</th><th>شكاوى</th><th>من</th><th /></tr></thead>
          <tbody>
            {shown.map((p) => {
              const reqs = all.requests.filter((r) => r.customer_id === p.id);
              const tickets = all.tickets.filter((t) => t.reporter_id === p.id);
              return (
                <tr key={p.id} onClick={() => nav(`/customers/${p.id}`)}>
                  <td className="mono strong">{memberId(p)}</td>
                  <td>{p.full_name || '—'}</td>
                  <td className="mono" dir="ltr">{p.phone}</td>
                  <td className="small" dir="ltr">{p.email}</td>
                  <td>{p.area}{p.governorate ? '، ' + p.governorate : ''}</td>
                  <td className="small">{p.car_make} {p.car_model} {p.car_year}</td>
                  <td>{reqs.length}</td>
                  <td>{tickets.length ? <Pill tone={tickets.some((t) => t.status !== 'resolved') ? 'wait' : 'plain'}>{tickets.length}</Pill> : '—'}</td>
                  <td className="small muted">{date(p.created_at)}</td>
                  <td>{p.is_blocked ? <Pill tone="bad">محظور</Pill> : null}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!shown.length ? <p className="empty">مفيش نتايج.</p> : null}
      </div>
    </Page>
  );
}

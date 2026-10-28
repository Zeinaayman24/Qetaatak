import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Page, Pill, useData } from '../App';
import { ORDER_STATUS, REQUEST_STATUS, URGENCY, date, memberId, money, orderId } from '../lib';

export default function Orders() {
  const { all } = useData();
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const n = q.trim().toLowerCase();
  const shown = all.requests.filter((r) => {
    const c = all.byId[r.customer_id];
    return (!status || r.status === status) && (!n || [orderId(r.num), r.part, r.car_make, r.car_model, c?.full_name, memberId(c), c?.phone].join(' ').toLowerCase().includes(n));
  });
  return (
    <Page title="الطلبات" sub={`${all.requests.length} طلب`}>
      <div className="toolbar">
        <input className="search" placeholder="دوّر برقم الطلب، القطعة، العربية، العميل…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={status} onChange={(e) => setStatus(e.target.value)}><option value="">كل الحالات</option>{Object.entries(REQUEST_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
      </div>
      <div className="panel flush">
        <table className="table clickable">
          <thead><tr><th>الطلب</th><th>القطعة</th><th>العربية</th><th>العميل</th><th>العروض</th><th>المحل المختار</th><th>السعر</th><th>الحالة</th><th>التاريخ</th></tr></thead>
          <tbody>
            {shown.map((r) => {
              const c = all.byId[r.customer_id];
              const qs = all.quotes.filter((x) => x.request_id === r.id);
              const chosen = qs.find((x) => x.id === r.chosen_quote_id);
              return (
                <tr key={r.id} onClick={() => nav(`/orders/${r.id}`)}>
                  <td className="mono strong">{orderId(r.num)}</td>
                  <td>{r.part}{r.urgency !== 'normal' ? <div><Pill tone="wait">{URGENCY[r.urgency]}</Pill></div> : null}</td>
                  <td className="small">{r.car_make} {r.car_model} {r.car_year}</td>
                  <td>{c?.full_name}<div className="mono small muted">{memberId(c)}</div></td>
                  <td>{qs.length}</td>
                  <td>{chosen ? all.priv[chosen.shop_id]?.name : '—'}</td>
                  <td>{chosen ? money(chosen.price) : '—'}</td>
                  <td><Pill tone={r.status === 'done' ? 'good' : r.status === 'open' ? 'wait' : r.status === 'cancelled' ? 'plain' : 'dark'}>{REQUEST_STATUS[r.status]}</Pill>{r.order_status && r.status === 'chosen' ? <div className="small muted">{ORDER_STATUS[r.order_status]}</div> : null}</td>
                  <td className="small muted">{date(r.created_at)}</td>
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

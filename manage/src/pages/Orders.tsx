import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Page, Pill, useData } from '../App';
import { ORDER_STATE, ORDER_STATUS, PAY_METHOD, PAY_STATE, REQUEST_STATUS, URGENCY, date, batchOf, memberId, money, orderId } from '../lib';

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
    <Page title="الطلبات والأوردرات" sub={`${all.requests.length} قطعة مطلوبة · ${all.orders.length} أوردر`}>
      <div className="toolbar">
        <input className="search" placeholder="دوّر برقم الطلب، القطعة، العربية، العميل…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={status} onChange={(e) => setStatus(e.target.value)}><option value="">كل الحالات</option>{Object.entries(REQUEST_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
      </div>
      <div className="panel flush">
        <table className="table clickable">
          <thead><tr><th>الطلب</th><th>الأوردر</th><th>القطعة</th><th>العربية</th><th>العميل</th><th>العروض</th><th>المحل المختار</th><th>السعر</th><th>الدفع</th><th>الحالة</th><th>التاريخ</th></tr></thead>
          <tbody>
            {shown.map((r) => {
              const c = all.byId[r.customer_id];
              const qs = all.quotes.filter((x) => x.request_id === r.id);
              const chosen = qs.find((x) => x.id === r.chosen_quote_id);
              return (
                <tr key={r.id} onClick={() => nav(`/orders/${r.id}`)}>
                  <td><span className="mono strong">{orderId(r.num)}</span>{(() => { const b = batchOf(all.requests, r); return b ? <div><span className="batch">قطعة {b.index} من {b.parts.length}</span></div> : null; })()}</td>
                  <td>{(() => { const o = r.order_id ? all.orders.find((x) => x.id === r.order_id) : undefined; return o ? <><span className="mono strong">#{o.order_no}</span><div className="small muted">{ORDER_STATE[o.status]}</div></> : <span className="muted">—</span>; })()}</td>
                  <td>{r.part}{r.urgency !== 'normal' ? <div><Pill tone="wait">{URGENCY[r.urgency]}</Pill></div> : null}</td>
                  <td className="small">{r.car_make} {r.car_model} {r.car_year}</td>
                  <td>{c?.full_name}<div className="mono small muted">{memberId(c)}</div></td>
                  <td>{qs.length}</td>
                  <td>{chosen ? all.priv[chosen.shop_id]?.name : '—'}</td>
                  <td>{chosen ? money(chosen.price) : '—'}</td>
                  <td>{(() => { const o = r.order_id ? all.orders.find((x) => x.id === r.order_id) : undefined; if (!o) return <span className="muted">—</span>; const st = PAY_STATE[o.payment_status]; return <><div className="small">{PAY_METHOD[o.payment_method]}</div>{st ? <Pill tone={st.tone}>{st.label}</Pill> : null}</>; })()}</td>
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

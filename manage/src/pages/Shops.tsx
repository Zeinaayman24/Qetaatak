import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Page, Pill, useData } from '../App';
import { SHOP_STATUS, SHOP_TYPE, date, memberId } from '../lib';

export default function Shops() {
  const { all } = useData();
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const shops = Object.values(all.shops).sort((a, b) => (a.status === 'pending' ? -1 : 0) - (b.status === 'pending' ? -1 : 0) || b.created_at.localeCompare(a.created_at));
  const n = q.trim().toLowerCase();
  const shown = shops.filter((s) => {
    const p = all.priv[s.id]; const pr = all.byId[s.id];
    return (!status || s.status === status) && (!n || [memberId(pr), p?.name, p?.owner_name, p?.phone, p?.phone2, s.area, s.governorate, s.brands.join(' ')].join(' ').toLowerCase().includes(n));
  });
  const stats = (id: string) => {
    const mine = all.quotes.filter((q) => q.shop_id === id);
    const sales = all.requests.filter((r) => mine.some((q) => q.id === r.chosen_quote_id));
    const rated = sales.filter((r) => r.rating);
    return { quotes: mine.length, sales: sales.length, rating: rated.length ? (rated.reduce((s, r) => s + r.rating!, 0) / rated.length).toFixed(1) : '—' };
  };
  return (
    <Page title="المحلات" sub={`${shops.length} محل · ${shops.filter((s) => s.status === 'pending').length} مستني موافقة`}>
      <div className="toolbar">
        <input className="search" placeholder="دوّر بالرقم (S-10002)، اسم المحل، صاحبه، الموبايل، المنطقة…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={status} onChange={(e) => setStatus(e.target.value)}><option value="">كل الحالات</option>{Object.entries(SHOP_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
      </div>
      <div className="panel flush">
        <table className="table clickable">
          <thead><tr><th>رقم المحل</th><th>المحل</th><th>صاحبه</th><th>الموبايل</th><th>المنطقة</th><th>النوع</th><th>عروض</th><th>مبيعات</th><th>تقييم</th><th>الحالة</th><th>من</th></tr></thead>
          <tbody>
            {shown.map((s) => {
              const p = all.priv[s.id]; const st = stats(s.id);
              return (
                <tr key={s.id} onClick={() => nav(`/shops/${s.id}`)}>
                  <td className="mono strong">{memberId(all.byId[s.id])}</td>
                  <td>{p?.name}</td><td>{p?.owner_name}</td>
                  <td className="mono" dir="ltr">{p?.phone}</td>
                  <td>{s.area}، {s.governorate}</td>
                  <td className="small">{SHOP_TYPE[s.shop_type]}{s.offers_delivery ? ' · بيوصّل' : ''}</td>
                  <td>{st.quotes}</td><td>{st.sales}</td><td>{st.rating}</td>
                  <td><Pill tone={s.status === 'approved' ? 'good' : s.status === 'pending' ? 'wait' : 'bad'}>{SHOP_STATUS[s.status]}</Pill>{all.byId[s.id]?.is_blocked ? <> <Pill tone="bad">محظور</Pill></> : null}</td>
                  <td className="small muted">{date(s.created_at)}</td>
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

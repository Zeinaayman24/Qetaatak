import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Page, Pill, useData } from '../App';
import { SHOP_STATUS, SHOP_TYPE, date, memberId, money, supabase, useLive } from '../lib';
import { mins, useSpeed } from './Speed';

export default function Shops() {
  const { all } = useData();
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [tab, setTab] = useState<'pending' | 'approved' | 'warned' | 'suspended' | 'closed' | 'all'>('pending');
  const { data: nums } = useLive(async () => {
    const { data } = await supabase.rpc('staff_shop_numbers');
    return Object.fromEntries(((data ?? []) as { shop_id: string; owed: number; warned: boolean }[]).map((x) => [x.shop_id, x]));
  }, ['orders', 'shop_settlements', 'shops']);
  const { data: speed } = useSpeed();
  const sp = Object.fromEntries((speed ?? []).map((x) => [x.shop_id, x]));
  const shops = Object.values(all.shops).sort((a, b) => (a.status === 'pending' ? -1 : 0) - (b.status === 'pending' ? -1 : 0) || b.created_at.localeCompare(a.created_at));
  const n = q.trim().toLowerCase();
  const shown = shops.filter((s) => {
    const p = all.priv[s.id]; const pr = all.byId[s.id];
    const inTab = tab === 'all' || (tab === 'pending' ? s.status === 'pending' || s.status === 'changes' : tab === 'warned' ? s.status === 'approved' && nums?.[s.id]?.warned : s.status === tab);
    return inTab && (!n || [memberId(pr), p?.name, p?.owner_name, p?.phone, p?.phone2, s.area, s.governorate, s.brands.join(' ')].join(' ').toLowerCase().includes(n));
  });
  const stats = (id: string) => {
    const mine = all.quotes.filter((q) => q.shop_id === id);
    const sales = all.requests.filter((r) => mine.some((q) => q.id === r.chosen_quote_id));
    const rated = sales.filter((r) => r.rating);
    return { quotes: mine.length, sales: sales.length, rating: rated.length ? (rated.reduce((s, r) => s + r.rating!, 0) / rated.length).toFixed(1) : '—' };
  };
  return (
    <Page title="المحلات" sub={`${shops.length} محل · ${shops.filter((s) => s.status === 'pending').length} مستني مراجعة`} actions={<button className="btn ghost" onClick={() => nav('/speed')}>سرعة الرد</button>}>
      <div className="tabs" style={{ alignSelf: 'flex-start' }}>
        {([['pending', 'مستني مراجعة'], ['approved', 'شغال'], ['warned', 'فيه تنبيه'], ['suspended', 'موقوف'], ['closed', 'مقفول'], ['all', 'الكل']] as const).map(([v, l]) => (
          <button key={v} className={'tab' + (tab === v ? ' active' : '')} onClick={() => setTab(v)}>{l}</button>
        ))}
      </div>
      <div className="toolbar">
        <input className="search" placeholder="دوّر بالرقم (S-10002)، اسم المحل، صاحبه، الموبايل، المنطقة…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="panel flush">
        <table className="table clickable">
          <thead><tr><th>رقم المحل</th><th>المحل</th><th>صاحبه</th><th>الموبايل</th><th>المنطقة</th><th>النوع</th><th>بيرد في</th><th>عروض</th><th>مبيعات</th><th>تقييم</th><th>العمولة المستحقة</th><th>الحالة</th><th>من</th></tr></thead>
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
                  <td><strong>{mins(sp[s.id]?.median_min)}</strong>{sp[s.id]?.waiting ? <div className="small muted">{sp[s.id].waiting} مستني ردّه</div> : null}</td>
                  <td>{st.quotes}</td><td>{st.sales}</td><td>{st.rating}</td>
                  <td>{nums?.[s.id]?.owed ? money(nums[s.id].owed) : '—'}</td>
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

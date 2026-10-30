import { Link } from 'react-router-dom';
import { Page, Pill, useData } from '../App';
import { CATEGORY, PRIORITY, REQUEST_STATUS, TICKET_STATUS, ago, batchOf, memberId, money, must, needsPeople, orderId, supabase, ticketId, useLive, type Message } from '../lib';

export default function Dashboard() {
  const { all, me } = useData();
  const { data: flagged } = useLive(async () => must(await supabase.from('messages').select('*').eq('flagged', true).order('created_at', { ascending: false }).limit(8)) as Message[], ['messages'], []);
  const customers = all.profiles.filter((p) => p.is_customer);
  const shops = Object.values(all.shops);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const reqToday = all.requests.filter((r) => new Date(r.created_at) >= today).length;
  const sold = all.requests.filter((r) => r.status === 'chosen' || r.status === 'done');
  const gmv = sold.reduce((s, r) => s + (all.quotes.find((q) => q.id === r.chosen_quote_id)?.price ?? 0), 0);
  const found = all.requests.filter((r) => all.quotes.some((q) => q.request_id === r.id)).length;
  const openTickets = all.tickets.filter(needsPeople);
  const pending = shops.filter((s) => s.status === 'pending');
  const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) + '%' : '—');

  const kpis: [string, string | number, string?][] = [
    ['العملاء', customers.length],
    ['المحلات الشغالة', shops.filter((s) => s.status === 'approved').length, pending.length ? `${pending.length} مستنية موافقة` : undefined],
    ['طلبات النهارده', reqToday, `${all.requests.length} إجمالي`],
    ['محادثات مع خدمة العملاء', openTickets.length, openTickets.filter((t) => t.priority === 'high').length ? `${openTickets.filter((t) => t.priority === 'high').length} عاجلة` : undefined],
    ['قيمة المبيعات', money(gmv), `عمولة ${money(gmv * 0.05)}`],
    ['طلبات لقت عرض', pct(found, all.requests.length), `إغلاق ${pct(sold.length, found)}`],
  ];

  return (
    <Page title={`أهلاً ${me.full_name?.split(' ')[0] || ''}`} sub="ملخص ضغطة دلوقتي. الأرقام بتتحدث لوحدها.">
      <div className="kpis">
        {kpis.map(([label, value, sub]) => (
          <div className="kpi" key={label}><span className="muted small">{label}</span><strong>{value}</strong>{sub ? <span className="muted small">{sub}</span> : null}</div>
        ))}
      </div>

      <div className="grid-2">
        <section className="panel">
          <div className="panel-head"><h2>محادثات محتاجة موظف</h2><Link to="/tickets">الكل</Link></div>
          {openTickets.length ? (
            <table className="table">
              <tbody>
                {openTickets.slice(0, 6).map((t) => {
                  const p = all.byId[t.reporter_id];
                  return (
                    <tr key={t.id}>
                      <td><Link to={`/tickets/${t.id}`} className="mono">{ticketId(t.ticket_no)}</Link></td>
                      <td>{CATEGORY[t.category]}<div className="muted small">{p?.full_name || all.priv[t.reporter_id]?.name} · <span className="mono">{memberId(p)}</span></div></td>
                      <td><Pill tone={t.priority === 'high' ? 'bad' : 'plain'}>{PRIORITY[t.priority]}</Pill></td>
                      <td><Pill tone={t.status === 'open' ? 'wait' : 'plain'}>{TICKET_STATUS[t.status]}</Pill></td>
                      <td className="muted small">{ago(t.updated_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : <p className="empty">مفيش شكاوى مفتوحة 🎉</p>}
        </section>

        <section className="panel">
          <div className="panel-head"><h2>محلات مستنية موافقة</h2><Link to="/shops">الكل</Link></div>
          {pending.length ? (
            <table className="table">
              <tbody>
                {pending.map((s) => (
                  <tr key={s.id}>
                    <td><Link to={`/shops/${s.id}`} className="mono">{memberId(all.byId[s.id])}</Link></td>
                    <td>{all.priv[s.id]?.name}<div className="muted small">{s.area}، {s.governorate}</div></td>
                    <td className="muted small">{ago(s.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p className="empty">مفيش محلات مستنية.</p>}
        </section>
      </div>

      {flagged?.length ? (
        <section className="panel">
          <div className="panel-head"><h2>🔒 محاولات تبادل أرقام قبل الأوردر</h2><span className="muted small">اتشالت تلقائياً من الرسائل</span></div>
          <table className="table">
            <tbody>
              {flagged.map((m) => {
                const r = all.requests.find((x) => x.id === m.request_id);
                const fromShop = m.sender_id === m.shop_id;
                const who = all.byId[m.sender_id];
                return (
                  <tr key={m.id}>
                    <td>{fromShop ? all.priv[m.shop_id]?.name : who?.full_name}<div className="mono small muted">{memberId(who)}</div></td>
                    <td className="small">«{m.body}»</td>
                    <td>{r ? <Link className="mono" to={`/orders/${r.id}`}>{orderId(r.num)}</Link> : null}</td>
                    <td className="muted small">{ago(m.created_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      ) : null}

      <section className="panel">
        <div className="panel-head"><h2>آخر الطلبات</h2><Link to="/orders">الكل</Link></div>
        <table className="table">
          <thead><tr><th>الطلب</th><th>القطعة</th><th>العميل</th><th>العروض</th><th>الحالة</th><th>من</th></tr></thead>
          <tbody>
            {all.requests.slice(0, 8).map((r) => (
              <tr key={r.id}>
                <td><Link to={`/orders/${r.id}`} className="mono">{orderId(r.num)}</Link>{(() => { const b = batchOf(all.requests, r); return b ? <div><span className="batch">قطعة {b.index} من {b.parts.length}</span></div> : null; })()}</td>
                <td>{r.part}<div className="muted small">{r.car_make} {r.car_model} {r.car_year}</div></td>
                <td>{all.byId[r.customer_id]?.full_name}<div className="muted small mono">{memberId(all.byId[r.customer_id])}</div></td>
                <td>{all.quotes.filter((q) => q.request_id === r.id).length}</td>
                <td><Pill tone={r.status === 'done' ? 'good' : r.status === 'open' ? 'wait' : 'plain'}>{REQUEST_STATUS[r.status]}</Pill></td>
                <td className="muted small">{ago(r.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </Page>
  );
}

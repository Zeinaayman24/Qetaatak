import { Link, useParams } from 'react-router-dom';
import { Field, Page, Pill, useData } from '../App';
import { CATEGORY, REQUEST_STATUS, TICKET_STATUS, address, date, memberId, money, orderId, supabase, ticketId, useLive, must, type Profile } from '../lib';

export default function CustomerDetail() {
  const { id } = useParams();
  const { all, me, reload } = useData();
  const p = all.byId[id!] as Profile | undefined;
  const { data: cars } = useLive(async () => must(await supabase.from('cars').select('*').eq('owner_id', id!)) as { id: string; make: string; model: string; year: number; vin: string }[], ['cars'], [id]);
  if (!p) return <Page title="العميل"><p className="empty">العميل ده مش موجود.</p></Page>;
  const reqs = all.requests.filter((r) => r.customer_id === p.id);
  const tickets = all.tickets.filter((t) => t.reporter_id === p.id);
  const spent = reqs.filter((r) => r.chosen_quote_id).reduce((s, r) => s + (all.quotes.find((q) => q.id === r.chosen_quote_id)?.price ?? 0), 0);

  async function toggleBlock() {
    const { error } = await supabase.from('profiles').update({ is_blocked: !p!.is_blocked }).eq('id', p!.id);
    if (error) alert('مش مسموح. الأدمن بس يقدر يحظر.'); else reload();
  }

  return (
    <Page title={<>{p.full_name} <span className="mono muted">{memberId(p)}</span></>} sub={`عميل من ${date(p.created_at)}`}
      actions={me.is_admin ? <button className={'btn ' + (p.is_blocked ? '' : 'danger')} onClick={toggleBlock}>{p.is_blocked ? 'إلغاء الحظر' : 'حظر العميل'}</button> : null}>
      {p.is_blocked ? <div className="notice bad">العميل ده محظور: مش هيقدر يعمل طلبات أو يبعت رسايل.</div> : null}
      <div className="grid-2">
        <section className="panel">
          <h2>البيانات</h2>
          <div className="fields">
            <Field label="رقم العميل"><span className="mono">{memberId(p)}</span></Field>
            <Field label="الاسم">{p.full_name}</Field>
            <Field label="الموبايل"><span className="mono" dir="ltr">{p.phone}</span></Field>
            <Field label="الإيميل"><span dir="ltr">{p.email}</span></Field>
            <Field label="الدولة">{p.country}</Field>
            <Field label="العنوان">{address(p)}</Field>
            <Field label="علامة مميزة">{p.landmark}</Field>
            <Field label="الرقم البريدي"><span className="mono">{p.postal_code}</span></Field>
          </div>
        </section>
        <section className="panel">
          <h2>العربيات</h2>
          <div className="fields">
            <Field label="الأساسية">{p.car_make} {p.car_model} {p.car_year}{p.car_vin ? <div className="mono small">VIN {p.car_vin}</div> : null}</Field>
            {(cars ?? []).map((c) => <Field key={c.id} label="إضافية">{c.make} {c.model} {c.year}{c.vin ? <div className="mono small">VIN {c.vin}</div> : null}</Field>)}
          </div>
          <h2 style={{ marginTop: 20 }}>الأرقام</h2>
          <div className="fields">
            <Field label="الطلبات">{reqs.length}</Field>
            <Field label="اشترى بـ">{money(spent)}</Field>
            <Field label="الشكاوى">{tickets.length}</Field>
          </div>
        </section>
      </div>
      <section className="panel">
        <h2>الطلبات</h2>
        <table className="table">
          <thead><tr><th>الطلب</th><th>القطعة</th><th>العربية</th><th>الحالة</th><th>التقييم</th><th>التاريخ</th></tr></thead>
          <tbody>{reqs.map((r) => (
            <tr key={r.id}>
              <td><Link className="mono" to={`/orders/${r.id}`}>{orderId(r.num)}</Link></td><td>{r.part}</td><td className="small">{r.car_make} {r.car_model}</td>
              <td><Pill>{REQUEST_STATUS[r.status]}</Pill></td><td>{r.rating ? '★'.repeat(r.rating) : '—'}</td><td className="small muted">{date(r.created_at)}</td>
            </tr>
          ))}</tbody>
        </table>
        {!reqs.length ? <p className="empty">مفيش طلبات.</p> : null}
      </section>
      <section className="panel">
        <h2>الشكاوى</h2>
        <table className="table">
          <tbody>{tickets.map((t) => (
            <tr key={t.id}><td><Link className="mono" to={`/tickets/${t.id}`}>{ticketId(t.ticket_no)}</Link></td><td>{CATEGORY[t.category]}</td><td className="small">{t.body}</td><td><Pill>{TICKET_STATUS[t.status]}</Pill></td></tr>
          ))}</tbody>
        </table>
        {!tickets.length ? <p className="empty">مفيش شكاوى.</p> : null}
      </section>
    </Page>
  );
}

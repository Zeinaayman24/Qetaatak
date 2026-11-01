import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Field, Modal, Page, Pill, can, useData } from '../App';
import { CATEGORY, REQUEST_STATUS, TICKET_STATUS, address, date, memberId, money, orderId, supabase, ticketId, useLive, type Profile } from '../lib';

type Extra = {
  addresses: { id: string; label: string; governorate: string; area: string; street: string; building: string; floor: string; apartment: string; landmark: string }[];
  cars: { id: string; make: string; model: string; year: number; vin: string }[];
  consent: { on: boolean; at: string | null; deleted_at: string | null };
  data_requests: { id: string; kind: string; status: string; created_at: string; done_at: string | null }[];
  spent: number; refused: number; refused_unjustified: number; cancelled: number; block_reason: string | null;
};

/** Customer page for staff (C03): masked number, addresses, cars, privacy, stats, block with an internal reason. */
export default function CustomerDetail() {
  const { id } = useParams();
  const { all, role, reload } = useData();
  const p = all.byId[id!] as Profile | undefined;
  const { data: x, reload: reloadX } = useLive(async () => {
    const { data, error } = await supabase.rpc('staff_customer', { p_user: id });
    if (error) throw error;
    return data as Extra;
  }, ['orders', 'data_requests'], [id]);
  const [phone, setPhone] = useState<string | null>(null);
  const [blocking, setBlocking] = useState(false);
  const [reason, setReason] = useState('');
  if (!p) return <Page title="العميل"><p className="empty">العميل ده مش موجود.</p></Page>;
  const reqs = all.requests.filter((r) => r.customer_id === p.id);
  const tickets = all.tickets.filter((t) => t.reporter_id === p.id);
  const orders = all.orders.filter((o) => o.customer_id === p.id);

  async function showPhone() {
    const { data } = await supabase.rpc('staff_show_phone', { p_user: p!.id });
    setPhone((data as string) ?? '');
  }
  async function setBlock(on: boolean) {
    const { error } = await supabase.rpc('staff_block', { p_user: p!.id, p_on: on, p_reason: reason });
    if (!error) { setBlocking(false); setReason(''); reload(); reloadX(); }
  }
  const delReq = x?.data_requests.find((d) => d.kind === 'delete');
  const copyReq = x?.data_requests.find((d) => d.kind === 'copy');

  return (
    <Page title={<>{p.full_name} <span className="mono muted">{memberId(p)}</span></>} sub={`عميل من ${date(p.created_at)}`}
      actions={can(role, 'support') ? (p.is_blocked
        ? <button className="btn" onClick={() => setBlock(false)}>إلغاء الحظر</button>
        : <button className="btn danger" onClick={() => setBlocking(true)}>حظر العميل</button>) : null}>
      {p.is_blocked ? <div className="notice bad">العميل ده محظور: مش هيقدر يعمل طلبات أو يبعت رسايل.{x?.block_reason ? ` (${x.block_reason})` : ''}</div> : null}
      <div className="grid-2">
        <section className="panel">
          <h2>البيانات</h2>
          <div className="fields">
            <Field label="رقم العميل"><span className="mono">{memberId(p)}</span></Field>
            <Field label="الاسم">{p.full_name}</Field>
            <Field label="الموبايل"><span className="mono" dir="ltr">{phone ?? p.phone}</span>{phone == null && p.phone ? <> <button className="link" onClick={showPhone}>اعرض الرقم</button></> : null}</Field>
            <Field label="المنطقة">{[p.area, p.governorate].filter(Boolean).join('، ')}</Field>
          </div>
          <h2 style={{ marginTop: 20 }}>الأرقام</h2>
          <p>اشترى بـ {money(x?.spent ?? 0)} · رفض {x?.refused ?? 0} قطع{x?.refused_unjustified ? ` (${x.refused_unjustified} مش في محله)` : ''} · لغى {x?.cancelled ?? 0} أوردرات</p>
        </section>
        <section className="panel">
          <h2>العناوين</h2>
          {(x?.addresses ?? []).length ? x!.addresses.map((a) => <div key={a.id} className="row-line"><Pill>{a.label}</Pill> {address(a)}{a.landmark ? ` (${a.landmark})` : ''}</div>) : <p className="empty">مفيش عناوين محفوظة.</p>}
          <h2 style={{ marginTop: 20 }}>العربيات</h2>
          <div className="fields">
            <Field label="الأساسية">{p.car_make} {p.car_model} {p.car_year}</Field>
            {(x?.cars ?? []).map((c) => <Field key={c.id} label="إضافية">{c.make} {c.model} {c.year}</Field>)}
          </div>
        </section>
      </div>
      <section className="panel">
        <h2>الخصوصية</h2>
        <p>موافقة التسويق: {x?.consent.on ? 'أيوه' : 'لأ'}{x?.consent.at ? ` (من ${date(x.consent.at)})` : ''}</p>
        <p>طلب نسخة بيانات: {copyReq ? (copyReq.status === 'done' ? `اتعمل ${date(copyReq.done_at)}` : `مطلوب ${date(copyReq.created_at)}`) : '—'}</p>
        <p>مسح الحساب: {delReq ? `مطلوب ${date(delReq.created_at)}، هيتمسح ${date(delReq.done_at ?? delReq.created_at)}` : '—'}</p>
      </section>
      {orders.length ? (
        <section className="panel">
          <h2>الأوردرات</h2>
          <table className="table"><tbody>{orders.map((o) => (
            <tr key={o.id}><td className="mono">#{o.order_no}</td><td>{money(o.items_total + o.delivery_fee)}</td><td className="small">{o.status}{o.refused_at ? ' · رفض' : ''}</td><td className="small muted">{date(o.created_at)}</td></tr>
          ))}</tbody></table>
        </section>
      ) : null}
      {blocking ? (
        <Modal title="حظر العميل" onClose={() => setBlocking(false)}>
          <textarea rows={3} placeholder="السبب (داخلي)" value={reason} onChange={(e) => setReason(e.target.value)} />
          <div className="toolbar"><button className="btn danger" disabled={!reason.trim()} onClick={() => setBlock(true)}>حظر العميل</button><button className="btn ghost" onClick={() => setBlocking(false)}>لأ</button></div>
        </Modal>
      ) : null}
      <section className="panel">
        <h2>الطلبات والأوردرات</h2>
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
        <h2>الشكاوى والبلاغات</h2>
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

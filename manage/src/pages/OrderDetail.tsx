import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Field, Modal, Page, Pill, can, useData } from '../App';
import { CATEGORY, CONDITION, ORDER_STATE, PAY_METHOD, PAY_STATE, ORDER_STATUS, REQUEST_STATUS, SIDE, TICKET_STATUS, WANTED, address, batchOf, dateTime, memberId, money, orderId, photoUrl, supabase, ticketId, type Message } from '../lib';

export default function OrderDetail() {
  const { id } = useParams();
  const { all, role, reload } = useData();
  // the page opens by request id, or by order id (from «المهام»)
  const r = all.requests.find((x) => x.id === id) ?? all.requests.find((x) => x.order_id === id);
  const [msgs, setMsgs] = useState<Message[] | null>(null);
  const [box, setBox] = useState<null | 'chat' | 'cancel' | 'dispute'>(null);
  const [reason, setReason] = useState('');
  const [who, setWho] = useState('customer');
  const [justified, setJustified] = useState<boolean | null>(null);
  const [phone, setPhone] = useState<string | null>(null);
  const [note, setNote] = useState('');
  if (!r) return <Page title="الطلب"><p className="empty">الطلب ده مش موجود.</p></Page>;
  const o = r.order_id ? all.orders.find((x) => x.id === r.order_id) : undefined;
  const close = () => { setBox(null); setReason(''); setJustified(null); setNote(''); };
  async function openChat() {
    const { data, error } = await supabase.rpc('staff_open_chat', { p_request: r!.id, p_shop: null, p_reason: reason });
    if (error) return setNote('مش مسموح.');
    setMsgs((data ?? []) as Message[]); close();
  }
  async function act(fn: string, args: Record<string, unknown>, ok: string) {
    const { error } = await supabase.rpc(fn, args);
    if (error) return setNote(/not allowed/.test(error.message) ? 'مش مسموح.' : /reason/.test(error.message) ? 'اكتب السبب.' : 'حصلت مشكلة.');
    close(); setNote(ok); reload();
  }
  const c = all.byId[r.customer_id];
  const qs = all.quotes.filter((x) => x.request_id === r.id).sort((a, b) => a.price - b.price);
  const tickets = all.tickets.filter((t) => t.request_id === r.id);
  const threads = Array.from(new Set((msgs ?? []).map((m) => m.shop_id)));
  const photo = photoUrl(r.photo_path);

  return (
    <Page title={<>طلب <span className="mono">{orderId(r.num)}</span></>} sub={<><Pill>{REQUEST_STATUS[r.status]}</Pill>{r.order_status ? ' · ' + ORDER_STATUS[r.order_status] : ''} · {dateTime(r.created_at)}</>}>
      <div className="grid-2">
        <section className="panel">
          <h2>الطلب</h2>
          <div className="fields">
            <Field label="القطعة">{r.part}{r.qty > 1 ? ` × ${r.qty}` : ''}</Field>
            {(() => {
              const b = batchOf(all.requests, r);
              return b ? (
                <Field label="نفس الطلب">
                  <div className="tags">{b.parts.map((x, i) => x.id === r.id
                    ? <span key={x.id} className="pill dark">{i + 1}. {x.part}</span>
                    : <Link key={x.id} className="pill" to={`/orders/${x.id}`}>{i + 1}. {x.part}</Link>)}</div>
                </Field>
              ) : null;
            })()}
            <Field label="العربية">{r.car_make} {r.car_model} {r.car_year}{r.vin ? <div className="mono small">VIN {r.vin}</div> : null}</Field>
            <Field label="عايزها">{WANTED[r.wanted_condition]}</Field>
            <Field label="الجهة">{SIDE[r.side]}</Field>
            <Field label="ملاحظات">{r.notes}</Field>
            {(() => { return o ? (<>
              <Field label="الأوردر"><span className="mono strong">#{o.order_no}</span> · {ORDER_STATE[o.status]} · {money(Number(o.items_total) + Number(o.delivery_fee))}{o.rating ? ` · ${'★'.repeat(o.rating)}` : ''}</Field>
              <Field label="الدفع">{PAY_METHOD[o.payment_method]} · {PAY_STATE[o.payment_status]?.label ?? o.payment_status}{o.payment_ref ? <> · <span className="mono">{o.payment_ref}</span></> : null}{o.payment_status === 'review' ? <> · <a href="#/payments">راجع الإيصال</a></> : null}</Field>
            </>) : null; })()}
            <Field label="التوصيل">{r.delivery_mode === 'delivery' ? 'توصيل لعنوان العميل' : r.delivery_mode === 'pickup' ? 'استلام من المحل' : ''}</Field>
            <Field label="التقييم">{r.rating ? '★'.repeat(r.rating) : ''}{r.review ? <div className="small">«{r.review}»</div> : null}</Field>
          </div>
          {photo ? <img className="photo" src={photo} alt="صورة القطعة" /> : null}
        </section>
        <section className="panel">
          <h2>العميل</h2>
          <div className="fields">
            <Field label="رقم العميل"><Link className="mono" to={`/customers/${c?.id}`}>{memberId(c)}</Link></Field>
            <Field label="الاسم">{c?.full_name}</Field>
            <Field label="الموبايل"><span className="mono" dir="ltr">{phone ?? c?.phone}</span>{phone == null && c?.phone ? <> <button className="link" onClick={async () => setPhone(((await supabase.rpc('staff_show_phone', { p_user: c.id })).data as string) ?? '')}>اعرض الرقم</button></> : null}</Field>
            <Field label="المنطقة">{r.area}</Field>
          </div>
          <h2 style={{ marginTop: 20 }}>شكاوى على الطلب</h2>
          {tickets.length ? tickets.map((t) => <div key={t.id} className="row-line"><Link className="mono" to={`/tickets/${t.id}`}>{ticketId(t.ticket_no)}</Link> {CATEGORY[t.category]} <Pill>{TICKET_STATUS[t.status]}</Pill></div>) : <p className="empty small">مفيش.</p>}
        </section>
      </div>
      {o ? (
        <section className="panel">
          <h2>أوردر #{o.order_no}</h2>
          <div className="timeline">
            <div>اتأكد · {dateTime(o.created_at)}</div>
            {o.paid_at ? <div>{o.payment_method === 'instapay' ? 'المحل أكّد التحويل' : 'اتدفع'} · {dateTime(o.paid_at)}</div> : null}
            {o.status !== 'preparing' && o.status !== 'cancelled' ? <div>جاهز</div> : null}
            {o.status === 'received' ? <div>اتسلّم · {dateTime(o.received_at)}</div> : null}
            {o.refused_at ? <div>اترفض · {dateTime(o.refused_at)}</div> : null}
            {o.status === 'cancelled' && !o.refused_at ? <div>اتلغى · {dateTime(o.updated_at)}{o.cancel_reason ? ` (${o.cancel_reason.replace(/^shop: /, 'المحل: ').replace(/^staff: /, 'ضغطة: ').replace('customer', 'العميل').replace('unpaid', 'ماحوّلش')})` : ''}</div> : null}
            {o.payment_status === 'refund_due' ? <div className="late">الاسترجاع مستحق · من {dateTime(o.refund_due_at ?? o.updated_at)}</div> : null}
            {o.payment_status === 'refunded' ? <div>اترجّع</div> : null}
          </div>
          {o.delivery_mode === 'delivery' && o.delivery_address ? <p className="small">التوصيل على: {address(o.delivery_address)}</p> : null}
          {o.refused_at ? (
            <div className="notice">
              <p>العميل رفض: {o.refusal_reason}</p>
              {o.refusal_photo ? <img className="photo" src={photoUrl(o.refusal_photo)!} alt="" /> : null}
              {o.dispute_note ? <p>اعتراض المحل: {o.dispute_note}</p> : null}
              {o.dispute_decision ? <p>القرار: {o.dispute_decision === 'justified' ? 'الرفض في محله' : 'الرفض مش في محله (بيتحسب على العميل)'}{o.dispute_message ? ` · ${o.dispute_message}` : ''}</p>
                : can(role, 'support') ? <button className="btn" onClick={() => setBox('dispute')}>القرار</button> : null}
            </div>
          ) : null}
          {can(role, 'support') ? (
            <div className="toolbar">
              {o.status !== 'received' && o.status !== 'cancelled' ? <button className="btn danger" onClick={() => setBox('cancel')}>الغي الأوردر بالنيابة</button> : null}
              {o.payment_status === 'review' || o.payment_status === 'refund_due' ? <button className="btn ghost" onClick={() => act('remind_shop_payment', { p_order: o.id }, 'اتبعت تذكير للمحل.')}>فكّر المحل</button> : null}
              {r.status === 'open' ? <button className="btn ghost" onClick={() => act('staff_nudge_shops', { p_request: r.id }, 'المحلات اتنبّهت.')}>نبّه المحلات</button> : null}
              <Link className="btn ghost" to="/tickets">افتح شكوى</Link>
            </div>
          ) : null}
          {note ? <p className="muted">{note}</p> : null}
        </section>
      ) : null}
      <section className="panel">
        <h2>العروض ({qs.length})</h2>
        <table className="table">
          <thead><tr><th>المحل</th><th>السعر</th><th>الحالة</th><th>الضمان</th><th>التاريخ</th><th /></tr></thead>
          <tbody>{qs.map((q) => (
            <tr key={q.id} className={q.id === r.chosen_quote_id ? 'highlight' : ''}>
              <td><Link to={`/shops/${q.shop_id}`}>{all.priv[q.shop_id]?.name}</Link> <span className="mono small muted">{memberId(all.byId[q.shop_id])}</span></td>
              <td className="strong">{money(q.price)}</td><td>{CONDITION[q.condition]}</td><td>{q.warranty_days ? `${q.warranty_days} يوم` : "بدون ضمان"}</td><td className="small muted">{dateTime(q.created_at)}</td>
              <td>{q.id === r.chosen_quote_id ? <Pill tone="good">العميل اختاره</Pill> : null}</td>
            </tr>
          ))}</tbody>
        </table>
        {!qs.length ? <p className="empty">لسه مفيش عروض.</p> : null}
      </section>
      <section className="panel">
        <h2>المحادثات</h2>
        {msgs == null ? (
          <div><p className="muted">المحادثات مقفولة لخصوصية العملاء.</p>{can(role, 'support') ? <button className="btn ghost" onClick={() => setBox('chat')}>افتح المحادثة</button> : null}</div>
        ) : threads.length ? threads.map((shopId) => (
          <div key={shopId} className="thread">
            <h3>مع {all.priv[shopId]?.name} <span className="mono small muted">{memberId(all.byId[shopId])}</span></h3>
            {(msgs ?? []).filter((m) => m.shop_id === shopId).map((m) => (
              <div key={m.id} className={'bubble ' + (m.sender_id === shopId ? 'them' : 'us') + (m.flagged ? ' flagged' : '')}>
                <span className="small muted">{m.sender_id === shopId ? 'المحل' : 'العميل'} · {dateTime(m.created_at)}{m.flagged ? ' · اتشال لينك' : ''}</span>
                {m.body ? <p>{m.body}</p> : null}
                {m.photo_path ? <img src={photoUrl(m.photo_path)!} alt="صورة" /> : null}
              </div>
            ))}
          </div>
        )) : <p className="empty">مفيش رسايل.</p>}
      </section>
      {box === 'chat' ? (
        <Modal title="افتح المحادثة" onClose={close}>
          <select value={reason} onChange={(e) => setReason(e.target.value)} aria-label="السبب">
            <option value="">السبب</option>
            {tickets.map((t) => <option key={t.id} value={'شكوى ' + ticketId(t.ticket_no)}>شكوى {ticketId(t.ticket_no)}</option>)}
            <option value="بلاغ">بلاغ</option><option value="اشتباه نصب">اشتباه نصب</option>
          </select>
          <p className="muted small">فتحك للمحادثة بيتسجّل.</p>
          {note ? <p className="error">{note}</p> : null}
          <div className="toolbar"><button className="btn" disabled={!reason} onClick={openChat}>افتح المحادثة</button><button className="btn ghost" onClick={close}>لأ</button></div>
        </Modal>
      ) : null}
      {box === 'cancel' && o ? (
        <Modal title="الغي الأوردر بالنيابة" onClose={close}>
          <textarea rows={3} placeholder="السبب (بيظهر للطرفين)" value={reason} onChange={(e) => setReason(e.target.value)} />
          <label className="row-line">مين طلب الإلغاء:
            <select value={who} onChange={(e) => setWho(e.target.value)}><option value="customer">العميل</option><option value="shop">المحل</option><option value="daghta">ضغطة</option></select>
          </label>
          <div className="toolbar"><button className="btn danger" disabled={!reason.trim()} onClick={() => act('staff_cancel_order', { p_order: o.id, p_reason: reason, p_who: who }, 'الأوردر اتلغى.')}>ألغي</button><button className="btn ghost" onClick={close}>لأ</button></div>
        </Modal>
      ) : null}
      {box === 'dispute' && o ? (
        <Modal title="القرار" onClose={close}>
          <label className="row-line"><input type="radio" checked={justified === true} onChange={() => setJustified(true)} /> الرفض في محله</label>
          <label className="row-line"><input type="radio" checked={justified === false} onChange={() => setJustified(false)} /> الرفض مش في محله (بيتحسب على العميل)</label>
          <textarea rows={3} placeholder="رسالة للطرفين" value={reason} onChange={(e) => setReason(e.target.value)} />
          <div className="toolbar"><button className="btn" disabled={justified == null} onClick={() => act('staff_decide_dispute', { p_order: o.id, p_justified: justified, p_message: reason }, 'اتحفظ.')}>حفظ</button><button className="btn ghost" onClick={close}>لأ</button></div>
        </Modal>
      ) : null}
    </Page>
  );
}

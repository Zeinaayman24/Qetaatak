import { Link, useParams } from 'react-router-dom';
import { Field, Page, Pill, useData } from '../App';
import { CATEGORY, CONDITION, ORDER_STATE, PAY_METHOD, PAY_STATE, ORDER_STATUS, REQUEST_STATUS, SIDE, TICKET_STATUS, URGENCY, WANTED, batchOf, dateTime, memberId, money, must, orderId, photoUrl, supabase, ticketId, useLive, type Message } from '../lib';

export default function OrderDetail() {
  const { id } = useParams();
  const { all } = useData();
  const r = all.requests.find((x) => x.id === id);
  const { data: msgs } = useLive(async () => must(await supabase.from('messages').select('*').eq('request_id', id!).order('created_at')) as Message[], ['messages'], [id]);
  if (!r) return <Page title="الطلب"><p className="empty">الطلب ده مش موجود.</p></Page>;
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
            <Field label="الاستعجال">{URGENCY[r.urgency]}</Field>
            <Field label="الميزانية">{r.budget ? money(r.budget) : ''}</Field>
            <Field label="ملاحظات">{r.notes}</Field>
            {(() => { const o = r.order_id ? all.orders.find((x) => x.id === r.order_id) : undefined; return o ? (<>
              <Field label="الأوردر"><span className="mono strong">#{o.order_no}</span> · {ORDER_STATE[o.status]} · {money(Number(o.items_total) + Number(o.delivery_fee))}{o.rating ? ` · ${'★'.repeat(o.rating)}` : ''}</Field>
              <Field label="الدفع">{PAY_METHOD[o.payment_method]} · {PAY_STATE[o.payment_status]?.label ?? o.payment_status}{o.payment_ref ? <> · <span className="mono">{o.payment_ref}</span></> : null}{o.payment_status === 'review' ? <> · <a href="#/payments">راجع الإيصال</a></> : null}</Field>
            </>) : null; })()}
            <Field label="التوصيل">{r.delivery_mode === 'delivery' ? 'توصيل للبيت' : r.delivery_mode === 'pickup' ? 'استلام من المحل' : ''}</Field>
            <Field label="التقييم">{r.rating ? '★'.repeat(r.rating) : ''}{r.review ? <div className="small">«{r.review}»</div> : null}</Field>
          </div>
          {photo ? <img className="photo" src={photo} alt="صورة القطعة" /> : null}
        </section>
        <section className="panel">
          <h2>العميل</h2>
          <div className="fields">
            <Field label="رقم العميل"><Link className="mono" to={`/customers/${c?.id}`}>{memberId(c)}</Link></Field>
            <Field label="الاسم">{c?.full_name}</Field>
            <Field label="الموبايل"><span className="mono" dir="ltr">{c?.phone}</span></Field>
            <Field label="المنطقة">{r.area}</Field>
          </div>
          <h2 style={{ marginTop: 20 }}>شكاوى على الطلب</h2>
          {tickets.length ? tickets.map((t) => <div key={t.id} className="row-line"><Link className="mono" to={`/tickets/${t.id}`}>{ticketId(t.ticket_no)}</Link> {CATEGORY[t.category]} <Pill>{TICKET_STATUS[t.status]}</Pill></div>) : <p className="empty small">مفيش.</p>}
        </section>
      </div>
      <section className="panel">
        <h2>العروض ({qs.length})</h2>
        <table className="table">
          <thead><tr><th>المحل</th><th>السعر</th><th>الحالة</th><th>الضمان</th><th>التاريخ</th><th /></tr></thead>
          <tbody>{qs.map((q) => (
            <tr key={q.id} className={q.id === r.chosen_quote_id ? 'highlight' : ''}>
              <td><Link to={`/shops/${q.shop_id}`}>{all.priv[q.shop_id]?.name}</Link> <span className="mono small muted">{memberId(all.byId[q.shop_id])}</span></td>
              <td className="strong">{money(q.price)}</td><td>{CONDITION[q.condition]}</td><td>{q.warranty_days} يوم</td><td className="small muted">{dateTime(q.created_at)}</td>
              <td>{q.id === r.chosen_quote_id ? <Pill tone="good">العميل اختاره</Pill> : null}</td>
            </tr>
          ))}</tbody>
        </table>
        {!qs.length ? <p className="empty">لسه مفيش عروض.</p> : null}
      </section>
      <section className="panel">
        <h2>المحادثات</h2>
        {threads.length ? threads.map((shopId) => (
          <div key={shopId} className="thread">
            <h3>مع {all.priv[shopId]?.name} <span className="mono small muted">{memberId(all.byId[shopId])}</span></h3>
            {(msgs ?? []).filter((m) => m.shop_id === shopId).map((m) => (
              <div key={m.id} className={'bubble ' + (m.sender_id === shopId ? 'them' : 'us') + (m.flagged ? ' flagged' : '')}>
                <span className="small muted">{m.sender_id === shopId ? 'المحل' : 'العميل'} · {dateTime(m.created_at)}{m.flagged ? ' · 🔒 حاول يبعت رقم أو لينك واتشال' : ''}</span>
                {m.body ? <p>{m.body}</p> : null}
                {m.photo_path ? <img src={photoUrl(m.photo_path)!} alt="صورة" /> : null}
              </div>
            ))}
          </div>
        )) : <p className="empty">مفيش رسايل.</p>}
      </section>
    </Page>
  );
}

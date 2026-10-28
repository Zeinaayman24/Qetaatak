import { Link, useParams } from 'react-router-dom';
import { Field, Page, Pill, useData } from '../App';
import { CATEGORY, CONDITION, REQUEST_STATUS, SHOP_STATUS, SHOP_TYPE, TICKET_STATUS, address, date, memberId, money, orderId, supabase, ticketId } from '../lib';

export default function ShopDetail() {
  const { id } = useParams();
  const { all, me, reload } = useData();
  const s = all.shops[id!];
  const p = all.priv[id!];
  const pr = all.byId[id!];
  if (!s) return <Page title="المحل"><p className="empty">المحل ده مش موجود.</p></Page>;
  const quotes = all.quotes.filter((q) => q.shop_id === s.id);
  const sales = all.requests.filter((r) => quotes.some((q) => q.id === r.chosen_quote_id));
  const rated = sales.filter((r) => r.rating);
  const revenue = sales.reduce((sum, r) => sum + (quotes.find((q) => q.id === r.chosen_quote_id)?.price ?? 0), 0);
  const tickets = all.tickets.filter((t) => t.reporter_id === s.id || (t.request_id && sales.some((r) => r.id === t.request_id)));

  async function setStatus(status: string) {
    const { error } = await supabase.from('shops').update({ status }).eq('id', s.id);
    if (error) alert('الأدمن بس يقدر يغيّر حالة المحل.'); else reload();
  }
  async function toggleBlock() {
    const { error } = await supabase.from('profiles').update({ is_blocked: !pr?.is_blocked }).eq('id', s.id);
    if (error) alert('مش مسموح.'); else reload();
  }

  return (
    <Page title={<>{p?.name} <span className="mono muted">{memberId(pr)}</span></>} sub={<><Pill tone={s.status === 'approved' ? 'good' : s.status === 'pending' ? 'wait' : 'bad'}>{SHOP_STATUS[s.status]}</Pill> · مسجّل من {date(s.created_at)}</>}
      actions={me.is_admin ? (
        <>
          {s.status !== 'approved' ? <button className="btn" onClick={() => setStatus('approved')}>وافق على المحل</button> : <button className="btn ghost" onClick={() => setStatus('suspended')}>إيقاف المحل</button>}
          <button className={'btn ' + (pr?.is_blocked ? 'ghost' : 'danger')} onClick={toggleBlock}>{pr?.is_blocked ? 'إلغاء الحظر' : 'حظر'}</button>
        </>
      ) : null}>
      <div className="kpis four">
        <div className="kpi"><span className="muted small">عروض بعتها</span><strong>{quotes.length}</strong></div>
        <div className="kpi"><span className="muted small">مبيعات</span><strong>{sales.length}</strong></div>
        <div className="kpi"><span className="muted small">قيمة المبيعات</span><strong>{money(revenue)}</strong><span className="muted small">عمولة {money(revenue * 0.05)}</span></div>
        <div className="kpi"><span className="muted small">التقييم</span><strong>{rated.length ? (rated.reduce((a, r) => a + r.rating!, 0) / rated.length).toFixed(1) + ' ★' : '—'}</strong><span className="muted small">{rated.length} تقييم</span></div>
      </div>
      <div className="grid-2">
        <section className="panel">
          <h2>بيانات المحل</h2>
          <div className="fields">
            <Field label="رقم المحل"><span className="mono">{memberId(pr)}</span></Field>
            <Field label="اسم المحل">{p?.name}</Field>
            <Field label="صاحب المحل">{p?.owner_name}</Field>
            <Field label="موبايل"><span className="mono" dir="ltr">{p?.phone}</span></Field>
            <Field label="موبايل تاني"><span className="mono" dir="ltr">{p?.phone2}</span></Field>
            <Field label="الإيميل"><span dir="ltr">{pr?.email}</span></Field>
            <Field label="السجل التجاري"><span className="mono">{p?.commercial_register}</span></Field>
          </div>
        </section>
        <section className="panel">
          <h2>العنوان والشغل</h2>
          <div className="fields">
            <Field label="العنوان">{address({ street: p?.street, building: p?.building, area: s.area, governorate: s.governorate })}</Field>
            <Field label="علامة مميزة">{p?.landmark}</Field>
            <Field label="الرقم البريدي"><span className="mono">{p?.postal_code}</span></Field>
            <Field label="النوع">{SHOP_TYPE[s.shop_type]}</Field>
            <Field label="التوصيل">{s.offers_delivery ? 'بيوصّل' : 'استلام من المحل بس'}</Field>
            <Field label="التخصص">{s.specialties.join('، ')}</Field>
            <Field label="الماركات">{s.brands.join('، ')}</Field>
          </div>
        </section>
      </div>
      <section className="panel">
        <h2>العروض والمبيعات</h2>
        <table className="table">
          <thead><tr><th>الطلب</th><th>القطعة</th><th>السعر</th><th>الحالة</th><th>اتختار؟</th><th>التقييم</th><th>التاريخ</th></tr></thead>
          <tbody>{quotes.map((q) => {
            const r = all.requests.find((x) => x.id === q.request_id);
            if (!r) return null;
            const won = r.chosen_quote_id === q.id;
            return (
              <tr key={q.id}>
                <td><Link className="mono" to={`/orders/${r.id}`}>{orderId(r.num)}</Link></td><td>{r.part}</td><td>{money(q.price)}<div className="small muted">{CONDITION[q.condition]}</div></td>
                <td><Pill>{REQUEST_STATUS[r.status]}</Pill></td><td>{won ? <Pill tone="good">اتباع</Pill> : r.chosen_quote_id ? 'لأ' : '—'}</td>
                <td>{won && r.rating ? '★'.repeat(r.rating) : '—'}{won && r.review ? <div className="small muted">«{r.review}»</div> : null}</td>
                <td className="small muted">{date(q.created_at)}</td>
              </tr>
            );
          })}</tbody>
        </table>
        {!quotes.length ? <p className="empty">لسه مبعتش عروض.</p> : null}
      </section>
      <section className="panel">
        <h2>شكاوى مرتبطة بالمحل</h2>
        <table className="table"><tbody>{tickets.map((t) => (
          <tr key={t.id}><td><Link className="mono" to={`/tickets/${t.id}`}>{ticketId(t.ticket_no)}</Link></td><td>{CATEGORY[t.category]}</td><td className="small">{t.body}</td><td><Pill>{TICKET_STATUS[t.status]}</Pill></td></tr>
        ))}</tbody></table>
        {!tickets.length ? <p className="empty">مفيش شكاوى.</p> : null}
      </section>
    </Page>
  );
}

import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Field, Modal, Page, Pill, can, notAllowed, useData } from '../App';
import { mins, useSpeed } from './Speed';
import { CATEGORY, CONDITION, REQUEST_STATUS, SHOP_STATUS, SHOP_TYPE, TICKET_STATUS, address, date, dateTime, memberId, money, orderId, supabase, ticketId, useLive } from '../lib';

type StaffShop = {
  metrics: { reply_min: number | null; answered_pct: number | null; offers: number; sold: number; cancels: number; refusal_pct: number | null; rating: number | null; ratings: number };
  owed: number; limit: number; free_until: string; last_payment: { amount: number; at: string } | null;
  docs: { id_front: string | null; id_back: string | null; register: string | null; tax: string | null; payout_name: string };
  featured: { id: number; starts_on: string; ends_on: string; amount: number }[];
  history: { at: string; who: string | null; action: string; reason: string }[];
};
type Box = null | 'changes' | 'reject' | 'pause' | 'reopen' | 'close' | 'warn' | 'featured' | 'approve';
const CHECKS = ['الاسم في البطاقة زي صاحب المحل', 'السجل أو الرخصة سارية', 'مكان المحل على الخريطة منطقي', 'اسم حساب التحويل زي صاحب المحل', 'صورة المحل حقيقية'];
const REJECT = ['مستندات مزوّرة', 'مش محل قطع غيار', 'مكرّر', 'سبب تاني'];
const level = (bad: boolean, warn: boolean) => (bad ? <Pill tone="bad">خطر</Pill> : warn ? <Pill tone="wait">محتاج تحسين</Pill> : <Pill tone="good">كويس</Pill>);

export default function ShopDetail() {
  const { id } = useParams();
  const { all, role, reload } = useData();
  const { data: speed } = useSpeed();
  const { data: x, reload: reloadX } = useLive(async () => {
    const { data, error } = await supabase.rpc('staff_shop', { p_shop: id });
    if (error) throw error;
    return data as StaffShop;
  }, ['shops', 'shop_private', 'shop_settlements'], [id]);
  const [box, setBox] = useState<Box>(null);
  const [reason, setReason] = useState('');
  const [step, setStep] = useState('');
  const [pick, setPick] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [amount, setAmount] = useState('');
  const [checks, setChecks] = useState<string[]>([]);
  const [err, setErr] = useState('');
  const s = all.shops[id!];
  const p = all.priv[id!];
  const pr = all.byId[id!];
  const sp = speed?.find((v) => v.shop_id === id);
  if (!s) return <Page title="المحل"><p className="empty">المحل ده مش موجود.</p></Page>;
  const quotes = all.quotes.filter((q) => q.shop_id === s.id);
  const tickets = all.tickets.filter((t) => t.reporter_id === s.id || (t.request_id && all.requests.some((r) => r.id === t.request_id && quotes.some((q) => q.id === r.chosen_quote_id))));
  const featured = !!s.featured_until && new Date(s.featured_until) > new Date();
  const close = () => { setBox(null); setReason(''); setStep(''); setPick(''); setErr(''); };

  async function run(fn: string, args: Record<string, unknown>) {
    setErr('');
    const { error } = await supabase.rpc(fn, args);
    if (error) return setErr(/not allowed/.test(error.message) ? 'مش مسموح.' : /reason/.test(error.message) ? 'اكتب السبب.' : 'حصلت مشكلة. جرّب تاني.');
    close(); reload(); reloadX();
  }
  async function openDoc(path: string | null, label: string) {
    if (!path) return;
    await supabase.rpc('staff_log_view', { p_action: 'document_opened', p_type: 'shops', p_id: s.id, p_reason: label });
    const { data } = await supabase.storage.from('shop-docs').createSignedUrl(path, 300);
    if (data?.signedUrl) window.open(data.signedUrl, '_blank', 'noopener');
  }
  async function toggleBlock() {
    await supabase.from('profiles').update({ is_blocked: !pr?.is_blocked }).eq('id', s.id); reload();
  }
  const m = x?.metrics;
  const review = can(role, 'review');

  return (
    <Page title={<>{p?.name} <span className="mono muted">{memberId(pr)}</span></>}
      sub={<><Pill tone={s.status === 'approved' ? 'good' : s.status === 'pending' ? 'wait' : 'bad'}>{SHOP_STATUS[s.status]}</Pill>{featured ? <> <Pill tone="dark">محل مميّز لحد {date(s.featured_until!)}</Pill></> : null} · من {date(s.created_at)}</>}
      actions={
        <>
          {s.status === 'pending' || s.status === 'changes' ? (
            <>
              <button className="btn" disabled={!review} title={review ? '' : notAllowed('review')} onClick={() => setBox('approve')}>وافق</button>
              <button className="btn ghost" disabled={!review} onClick={() => setBox('changes')}>ابعت للتعديل</button>
              <button className="btn danger" disabled={!review} onClick={() => setBox('reject')}>ارفض</button>
            </>
          ) : null}
          {s.status === 'approved' ? <>
            <button className="btn ghost" disabled={!review} onClick={() => setBox('warn')}>ابعت تنبيه</button>
            <button className="btn ghost" disabled={!review} onClick={() => setBox('pause')}>إيقاف مؤقت</button>
          </> : null}
          {s.status === 'suspended' ? <button className="btn" disabled={!review} onClick={() => setBox('reopen')}>رجّع المحل</button> : null}
          {s.status === 'approved' ? <button className="btn ghost" disabled={!can(role, 'finance')} onClick={() => setBox('featured')}>محل مميّز</button> : null}
          {role === 'admin' && s.status !== 'closed' ? <button className="btn danger" onClick={() => setBox('close')}>قفل المحل نهائياً</button> : null}
          {role === 'admin' ? <button className={'btn ' + (pr?.is_blocked ? 'ghost' : 'danger')} onClick={toggleBlock}>{pr?.is_blocked ? 'إلغاء الحظر' : 'حظر الحساب'}</button> : null}
        </>
      }>
      {s.status === 'suspended' && s.suspend_reason ? <p className="muted">السبب: {s.suspend_reason}{s.reopen_step ? ` · المطلوب: ${s.reopen_step}` : ''}</p> : null}
      {(s.status === 'pending' || s.status === 'changes') && x ? (
        <section className="panel">
          <h2>مراجعة المحل</h2>
          <div className="grid-2">
            <div>
              {[...CHECKS, `وافق على الاتفاقية (نسخة ${s.agreement_version ?? '—'})`].map((c) => (
                <label key={c} className="row-line"><input type="checkbox" checked={checks.includes(c)} onChange={() => setChecks((v) => (v.includes(c) ? v.filter((y) => y !== c) : [...v, c]))} /> {c}</label>
              ))}
            </div>
            <div>
              <h3>المستندات</h3>
              {([['id_front', 'البطاقة (وش)'], ['id_back', 'البطاقة (ضهر)'], ['register', 'السجل أو الرخصة'], ['tax', 'البطاقة الضريبية']] as const).map(([k, l]) => (
                <div key={k} className="row-line">{l}: {x.docs?.[k] ? <button className="link" onClick={() => openDoc(x.docs[k], l)}>افتح</button> : <span className="muted">—</span>}</div>
              ))}
              <div className="row-line">اسم حساب التحويل: {x.docs?.payout_name || '—'}</div>
              {s.lat != null ? <div className="row-line"><a href={`https://www.google.com/maps?q=${s.lat},${s.lng}`} target="_blank" rel="noopener">مكان المحل على الخريطة</a></div> : null}
              {s.photo_path ? <img src={supabase.storage.from('photos').getPublicUrl(s.photo_path).data.publicUrl} alt="" style={{ width: 160, borderRadius: 10 }} /> : null}
              <p className="muted small">المستندات دي سرية، متنزّلهاش ومتبعتهاش لحد.</p>
            </div>
          </div>
        </section>
      ) : null}
      {m ? (
        <section className="panel">
          <h2>أداء آخر ٣٠ يوم</h2>
          <table className="table"><tbody>
            <tr><td>متوسط وقت الرد</td><td>{mins(m.reply_min ?? undefined)}</td><td>{m.reply_min == null ? '' : level(false, m.reply_min > 60)}</td></tr>
            <tr><td>نسبة الطلبات اللي ردّ عليها</td><td>{m.answered_pct ?? '—'}٪</td><td /></tr>
            <tr><td>العروض اللي اتباعت</td><td>{m.sold} من {m.offers}</td><td /></tr>
            <tr><td>إلغاءات منه</td><td>{m.cancels}</td><td>{level(m.cancels >= 3, m.cancels === 2)}</td></tr>
            <tr><td>رفض العملاء</td><td>{m.refusal_pct ?? '—'}٪</td><td>{m.refusal_pct == null ? '' : level(m.refusal_pct > 10, m.refusal_pct >= 5)}</td></tr>
            <tr><td>التقييم</td><td>{m.rating ?? '—'} ({m.ratings})</td><td>{m.rating == null ? '' : level(m.rating < 3 && m.ratings >= 10, m.rating < 3.5)}</td></tr>
          </tbody></table>
        </section>
      ) : null}
      {x ? (
        <section className="panel">
          <h2>العمولة المستحقة</h2>
          <div className="fields">
            <Field label="العمولة المستحقة">{money(x.owed)}</Field>
            <Field label="الحد">{money(x.limit)}</Field>
            <Field label="آخر سداد">{x.last_payment ? `${money(x.last_payment.amount)} · ${date(x.last_payment.at)}` : '—'}</Field>
            <Field label="الفترة المجانية لحد">{date(x.free_until)}</Field>
          </div>
        </section>
      ) : null}
      <div className="kpis">
        <div className="kpi"><span className="muted small">بيرد عادةً في</span><strong>{mins(sp?.median_min)}</strong></div>
        <div className="kpi"><span className="muted small">فريق المحل (١)</span><strong>صاحب المحل</strong></div>
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
          </div>
        </section>
        <section className="panel">
          <h2>العنوان والشغل</h2>
          <div className="fields">
            <Field label="العنوان">{address({ street: p?.street, building: p?.building, area: s.area, governorate: s.governorate })}</Field>
            <Field label="علامة مميزة">{p?.landmark}</Field>
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
      {x?.history.length ? (
        <section className="panel">
          <h2>سجل المحل: مين عمل إيه وإمتى</h2>
          <table className="table"><tbody>{x.history.map((h, i) => (
            <tr key={i}><td className="small">{dateTime(h.at)}</td><td>{h.who ?? 'النظام'}</td><td>{h.action}</td><td className="small">{h.reason}</td></tr>
          ))}</tbody></table>
        </section>
      ) : null}
      {box ? (
        <Modal title={{ approve: 'وافق على المحل', changes: 'ابعت للتعديل', reject: 'سبب الرفض', pause: 'إيقاف مؤقت', reopen: 'رجّع المحل', close: 'قفل المحل نهائياً (مخالفة جسيمة)', warn: 'ابعت تنبيه', featured: 'محل مميّز' }[box]} onClose={close}>
          {box === 'approve' ? <p>{checks.length < CHECKS.length + 1 ? 'لسه فيه بنود في المراجعة ماتعلّمتش.' : 'كل البنود اتراجعت.'}</p> : null}
          {box === 'changes' ? <textarea rows={4} placeholder="اكتب المطلوب تعديله (بيظهر للمحل زي ما هو)" value={reason} onChange={(e) => setReason(e.target.value)} /> : null}
          {box === 'reject' ? <>
            {REJECT.map((r) => <label key={r} className="row-line"><input type="radio" checked={pick === r} onChange={() => setPick(r)} /> {r}</label>)}
            {pick === 'سبب تاني' ? <textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} /> : null}
          </> : null}
          {box === 'pause' ? <>
            <textarea rows={3} placeholder="السبب (بيظهر للمحل)" value={reason} onChange={(e) => setReason(e.target.value)} />
            <textarea rows={2} placeholder="المطلوب عشان يرجع (بيظهر للمحل)" value={step} onChange={(e) => setStep(e.target.value)} />
          </> : null}
          {box === 'reopen' ? <textarea rows={2} placeholder="ملاحظة داخلية" value={reason} onChange={(e) => setReason(e.target.value)} /> : null}
          {box === 'close' || box === 'warn' ? <>
            {box === 'warn' ? <select value={pick} onChange={(e) => setPick(e.target.value)} aria-label="المقياس"><option value="">المقياس</option>{['متوسط وقت الرد', 'إلغاءات منك', 'رفض العملاء', 'التقييم', 'تأكيد التحويلات', 'رجوع فلوس العملاء'].map((v) => <option key={v}>{v}</option>)}</select> : null}
            <textarea rows={3} placeholder={box === 'warn' ? 'رسالة للمحل' : 'السبب'} value={reason} onChange={(e) => setReason(e.target.value)} />
          </> : null}
          {box === 'featured' ? <>
            <label className="row-line">من <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /> لحد <input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
            <input inputMode="numeric" placeholder="المبلغ المدفوع (ج.م)" value={amount} onChange={(e) => setAmount(e.target.value)} />
            {x?.featured.length ? <p className="muted small">قبل كده: {x.featured.map((f) => `${date(f.starts_on)} – ${date(f.ends_on)} (${money(f.amount)})`).join('، ')}</p> : null}
          </> : null}
          {err ? <p className="error">{err}</p> : null}
          <div className="toolbar">
            {box === 'approve' ? <button className="btn" onClick={() => run('staff_shop_decide', { p_shop: s.id, p_decision: 'approve', p_reason: checks.join('، ') })}>وافق</button> : null}
            {box === 'changes' ? <button className="btn" onClick={() => run('staff_shop_decide', { p_shop: s.id, p_decision: 'changes', p_reason: reason })}>ابعت</button> : null}
            {box === 'reject' ? <button className="btn danger" onClick={() => run('staff_shop_decide', { p_shop: s.id, p_decision: 'reject', p_reason: pick === 'سبب تاني' ? reason : pick })}>ارفض نهائياً</button> : null}
            {box === 'pause' ? <button className="btn danger" onClick={() => run('staff_shop_status', { p_shop: s.id, p_action: 'pause', p_reason: reason, p_reopen_step: step })}>أوقف</button> : null}
            {box === 'reopen' ? <button className="btn" onClick={() => run('staff_shop_status', { p_shop: s.id, p_action: 'reopen', p_reason: reason, p_reopen_step: '' })}>رجّع المحل</button> : null}
            {box === 'close' ? <button className="btn danger" onClick={() => run('staff_shop_status', { p_shop: s.id, p_action: 'close', p_reason: reason, p_reopen_step: '' })}>قفل المحل نهائياً</button> : null}
            {box === 'warn' ? <button className="btn" onClick={() => run('staff_shop_status', { p_shop: s.id, p_action: 'warn', p_reason: (pick ? pick + ' محتاج تحسين. ' : '') + reason, p_reopen_step: '' })}>ابعت</button> : null}
            {box === 'featured' ? <>
              <button className="btn" onClick={() => run('staff_set_featured', { p_shop: s.id, p_from: from || null, p_to: to || null, p_amount: Number(amount) || 0 })}>حفظ</button>
              {featured ? <button className="btn ghost" onClick={() => run('staff_set_featured', { p_shop: s.id, p_from: null, p_to: null, p_amount: 0 })}>شيل التمييز</button> : null}
            </> : null}
            <button className="btn ghost" onClick={close}>لأ</button>
          </div>
        </Modal>
      ) : null}
    </Page>
  );
}

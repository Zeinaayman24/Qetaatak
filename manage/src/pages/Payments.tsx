import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Page, Pill, useData } from '../App';
import { PAY_METHOD, PAY_STATE, dateTime, memberId, money, must, receiptUrl, supabase, useLive, type Order } from '../lib';

const SETTINGS: [string, string, string][] = [
  ['instapay_address', 'عنوان InstaPay', 'مثلاً daghta@instapay'],
  ['wallet_number', 'رقم المحفظة', 'رقم فودافون كاش / محفظة'],
  ['account_name', 'اسم صاحب الحساب', 'الاسم اللي العميل هيشوفه وهو بيحوّل'],
  ['payment_note', 'ملاحظة للعميل', 'مثلاً: اكتب رقم الأوردر في ملاحظة التحويل'],
];

/** Payments: transfer receipts to check, refunds to send, every online payment, and the company's InstaPay details. */
export default function Payments() {
  const { all, me } = useData();
  const review = all.orders.filter((o) => o.payment_method === 'instapay' && o.payment_status === 'review');
  const refunds = all.orders.filter((o) => o.payment_status === 'refund_due');
  const online = all.orders.filter((o) => o.payment_method === 'instapay' || o.payment_method === 'card');
  const paidOnline = online.filter((o) => o.payment_status === 'paid').reduce((s, o) => s + Number(o.items_total) + Number(o.delivery_fee), 0);
  const total = (o: Order) => Number(o.items_total) + Number(o.delivery_fee);

  return (
    <Page title="المدفوعات" sub={`${review.length} إيصال محتاج مراجعة · ${refunds.length} استرجاع · ${money(paidOnline)} اتدفعوا أونلاين`}>
      <div className="kpis four">
        {[
          ['إيصالات للمراجعة', String(review.length)],
          ['استرجاع مطلوب', String(refunds.length)],
          ['أوردرات كاش', String(all.orders.filter((o) => o.payment_method === 'cash' || o.payment_method === 'shop').length)],
          ['مدفوع أونلاين', money(paidOnline)],
        ].map(([l, v]) => <div key={l} className="kpi"><span className="muted small">{l}</span><strong>{v}</strong></div>)}
      </div>

      <section className="panel">
        <div className="panel-head"><h2>إيصالات تحويل محتاجة مراجعة</h2></div>
        {review.length ? review.map((o) => <ReceiptCard key={o.id} o={o} total={total(o)} />) : <p className="empty">مفيش إيصالات مستنية. 👌</p>}
      </section>

      {refunds.length ? (
        <section className="panel">
          <div className="panel-head"><h2>أوردرات مدفوعة اتلغت · رجّع المبلغ</h2></div>
          {refunds.map((o) => <RefundRow key={o.id} o={o} total={total(o)} />)}
        </section>
      ) : null}

      <section className="panel flush">
        <table className="table">
          <thead><tr><th>الأوردر</th><th>العميل</th><th>المحل</th><th>الطريقة</th><th>المبلغ</th><th>الحالة</th><th>المرجع</th><th>آخر تحديث</th></tr></thead>
          <tbody>
            {online.map((o) => {
              const c = all.byId[o.customer_id];
              const st = PAY_STATE[o.payment_status] ?? { label: o.payment_status, tone: 'plain' as const };
              const part = all.requests.find((r) => r.order_id === o.id);
              return (
                <tr key={o.id}>
                  <td>{part ? <Link className="mono strong" to={`/orders/${part.id}`}>#{o.order_no}</Link> : <span className="mono strong">#{o.order_no}</span>}</td>
                  <td>{c?.full_name}<div className="mono small muted">{memberId(c)}</div></td>
                  <td>{all.priv[o.shop_id]?.name ?? '—'}</td>
                  <td>{PAY_METHOD[o.payment_method]}</td>
                  <td>{money(total(o))}</td>
                  <td><Pill tone={st.tone}>{st.label}</Pill>{o.payment_note ? <div className="small muted">{o.payment_note}</div> : null}</td>
                  <td className="mono small">{o.payment_ref || '—'}</td>
                  <td className="small muted">{dateTime(o.updated_at ?? o.created_at)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!online.length ? <p className="empty">لسه مفيش مدفوعات أونلاين.</p> : null}
      </section>

      {me.is_admin ? <Settings /> : null}
    </Page>
  );
}

function ReceiptCard({ o, total }: { o: Order; total: number }) {
  const { all, reload } = useData();
  const [url, setUrl] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  useEffect(() => { if (o.payment_proof) receiptUrl(o.payment_proof).then(setUrl); }, [o.payment_proof]);
  const c = all.byId[o.customer_id];
  async function decide(ok: boolean) {
    if (!ok && !note.trim()) return setMsg('اكتب للعميل سبب الرفض.');
    setBusy(true); setMsg('');
    const { error } = await supabase.rpc('review_payment', { p_order: o.id, p_ok: ok, p_note: note.trim() });
    setBusy(false);
    if (error) setMsg(error.message); else reload();
  }
  return (
    <div className="receipt">
      {url ? <a href={url} target="_blank" rel="noreferrer"><img src={url} alt={'إيصال أوردر ' + o.order_no} /></a> : <div className="receipt-ph">بيحمّل الإيصال…</div>}
      <div className="receipt-body">
        <h3>أوردر <span className="mono">#{o.order_no}</span> · {money(total)}</h3>
        <p className="muted small">{c?.full_name} ({memberId(c)}) · {all.priv[o.shop_id]?.name ?? 'محل'} · رقم العملية: <span className="mono">{o.payment_ref || 'مش مكتوب'}</span></p>
        <p className="small">اتأكد إن المبلغ <strong>{money(total)}</strong> وصل الحساب فعلاً قبل التأكيد.</p>
        <textarea rows={2} placeholder="سبب الرفض (لو هترفض) · بيوصل للعميل" value={note} onChange={(e) => setNote(e.target.value)} />
        {msg ? <p className="error">{msg}</p> : null}
        <div className="row-actions">
          <button className="btn accent" disabled={busy} onClick={() => decide(true)}>الفلوس وصلت · أكّد الدفع</button>
          <button className="btn danger" disabled={busy} onClick={() => decide(false)}>ارفض الإيصال</button>
        </div>
      </div>
    </div>
  );
}

function RefundRow({ o, total }: { o: Order; total: number }) {
  const { all, reload } = useData();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const c = all.byId[o.customer_id];
  async function done() {
    setBusy(true);
    const { error } = await supabase.rpc('mark_refunded', { p_order: o.id, p_note: note.trim() });
    setBusy(false);
    if (error) alert(error.message); else reload();
  }
  return (
    <div className="refund">
      <div><strong className="mono">#{o.order_no}</strong> · {money(total)} · {PAY_METHOD[o.payment_method]}<div className="small muted">{c?.full_name} · {c?.phone} · مرجع الدفع: <span className="mono">{o.payment_ref || '—'}</span></div></div>
      <input className="search" placeholder="رقم عملية الاسترجاع (اختياري)" value={note} onChange={(e) => setNote(e.target.value)} />
      <button className="btn" disabled={busy} onClick={done}>رجّعت المبلغ</button>
    </div>
  );
}

function Settings() {
  const { data, reload } = useLive(async () => {
    const rows = must(await supabase.from('app_settings').select('key, value')) as { key: string; value: string }[];
    return Object.fromEntries(rows.map((r) => [r.key, r.value])) as Record<string, string>;
  }, []);
  const [form, setForm] = useState<Record<string, string> | null>(null);
  const [msg, setMsg] = useState('');
  useEffect(() => { if (data && !form) setForm(data); }, [data, form]);
  if (!form) return null;
  async function save() {
    setMsg('');
    for (const [k] of SETTINGS) {
      const { error } = await supabase.rpc('set_setting', { p_key: k, p_value: (form![k] ?? '').trim() });
      if (error) return setMsg(error.message);
    }
    setMsg('اتحفظ ✓'); reload();
  }
  return (
    <section className="panel">
      <div className="panel-head"><h2>بيانات التحويل اللي بتظهر للعميل</h2></div>
      <p className="muted small">العميل اللي يختار InstaPay أو محفظة بيشوف البيانات دي في صفحة الأوردر. الدفع بالبطاقة بيشتغل لما مفاتيح Paymob تتحط في Supabase.</p>
      <div className="settings-grid">
        {SETTINGS.map(([k, label, ph]) => (
          <label key={k} className="input"><span>{label}</span>
            <input dir={k === 'instapay_address' || k === 'wallet_number' ? 'ltr' : 'rtl'} placeholder={ph} value={form[k] ?? ''} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
          </label>
        ))}
      </div>
      <div className="row-actions"><button className="btn" onClick={save}>احفظ</button>{msg ? <span className="muted small">{msg}</span> : null}</div>
    </section>
  );
}

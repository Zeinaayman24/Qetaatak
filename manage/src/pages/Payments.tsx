import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Page, Pill, useData } from '../App';
import { PAY_METHOD, PAY_STATE, dateTime, memberId, money, must, receiptUrl, supabase, useLive, type Order } from '../lib';

/** Payments: transfers waiting for the shop, refunds due, and every online payment. */
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
          ['تحويلات مستنية المحل', String(review.length)],
          ['استرجاع مطلوب', String(refunds.length)],
          ['أوردرات كاش', String(all.orders.filter((o) => o.payment_method === 'cash' || o.payment_method === 'shop').length)],
          ['مدفوع أونلاين', money(paidOnline)],
        ].map(([l, v]) => <div key={l} className="kpi"><span className="muted small">{l}</span><strong>{v}</strong></div>)}
      </div>

      <section className="panel">
        <div className="panel-head"><h2>تحويلات مستنية تأكيد المحل</h2></div>
        <p className="muted small">التحويلات بتروح للمحل مباشرة والمحل هو اللي بيأكد. لو المحل اتأخر أو فيه خلاف، تقدر تتدخل وتأكد أو ترفض من هنا.</p>
        {review.length ? review.map((o) => <ReceiptCard key={o.id} o={o} total={total(o)} />) : <p className="empty">مفيش تحويلات مستنية. 👌</p>}
      </section>

      {refunds.length ? (
        <section className="panel">
          <div className="panel-head"><h2>أوردرات مدفوعة اتلغت · المبلغ لازم يرجع</h2></div>
          <p className="muted small">البطاقة: إحنا اللي بنرجّع من Paymob. التحويل: المحل بيرجّع ويسجّل، وتقدر تسجّل نيابة عنه.</p>
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

      <Commission admin={!!me.is_admin} />
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

type Settlement = { id: string; shop_id: string; amount: number; ref: string; proof_path: string | null; status: string; note: string; created_at: string };

/** Shop commission: free or owed, the rate and limit, payments shops sent, and each shop's balance. */
function Commission({ admin }: { admin: boolean }) {
  const { all } = useData();
  const { data, reload } = useLive(async () => {
    const [settings, balances, settlements] = await Promise.all([
      supabase.from('app_settings').select('key, value'),
      supabase.rpc('shop_balances'),
      supabase.from('shop_settlements').select('*').order('created_at', { ascending: false }).limit(200),
    ]);
    return {
      s: Object.fromEntries((must(settings) as { key: string; value: string }[]).map((r) => [r.key, r.value])) as Record<string, string>,
      balances: (must(balances) as { shop_id: string; orders: number; fees: number; paid: number }[]).filter((b) => Number(b.orders) > 0),
      settlements: must(settlements) as Settlement[],
    };
  }, ['orders', 'shop_settlements']);
  const [form, setForm] = useState<Record<string, string> | null>(null);
  const [msg, setMsg] = useState('');
  useEffect(() => { if (data && !form) setForm(data.s); }, [data, form]);
  if (!data || !form) return null;
  const owedMode = data.s.billing_mode === 'owed';
  const pending = data.settlements.filter((x) => x.status === 'pending');

  async function save() {
    setMsg('');
    for (const k of ['billing_mode', 'commission_pct', 'owed_limit', 'instapay_address', 'wallet_number', 'account_name']) {
      const { error } = await supabase.rpc('set_setting', { p_key: k, p_value: (form![k] ?? '').trim() });
      if (error) return setMsg(error.message);
    }
    setMsg('اتحفظ ✓'); reload();
  }
  async function review(x: Settlement, ok: boolean) {
    const note = ok ? '' : (prompt('سبب الرفض (بيوصل للمحل)') ?? '');
    const { error } = await supabase.rpc('review_settlement', { p_id: x.id, p_ok: ok, p_note: note });
    if (error) alert(error.message); else reload();
  }
  async function openProof(path: string) { const u = await receiptUrl(path); if (u) window.open(u, '_blank'); }

  return (
    <>
      <section className="panel">
        <div className="panel-head"><h2>عمولة المحلات</h2><Pill tone={owedMode ? 'dark' : 'good'}>{owedMode ? 'العمولة شغالة' : 'مجاناً دلوقتي'}</Pill></div>
        <p className="muted small">المحل بياخد فلوسه كاملة من العميل. العمولة بتتحسب على كل أوردر العميل استلمه، والمحل بيسدّدها بعد البيع (من غير شحن رصيد). في الوضع المجاني المحلات بتشوف بس «وفّرت كام».</p>
        {admin ? (
          <>
            <div className="settings-grid">
              <label className="input"><span>الوضع</span>
                <select value={form.billing_mode ?? 'free'} onChange={(e) => setForm({ ...form, billing_mode: e.target.value })}>
                  <option value="free">مجاناً (المحلات بتشوف اللي وفّروه)</option>
                  <option value="owed">العمولة شغالة (المحلات بتسدّد بعد البيع)</option>
                </select>
              </label>
              <label className="input"><span>نسبة العمولة ٪</span><input dir="ltr" value={form.commission_pct ?? '5'} onChange={(e) => setForm({ ...form, commission_pct: e.target.value })} /></label>
              <label className="input"><span>الحد الأقصى المستحق قبل إيقاف العروض (ج.م)</span><input dir="ltr" value={form.owed_limit ?? '500'} onChange={(e) => setForm({ ...form, owed_limit: e.target.value })} /></label>
              <label className="input"><span>InstaPay ضغطة (المحلات بتسدّد عليه)</span><input dir="ltr" value={form.instapay_address ?? ''} onChange={(e) => setForm({ ...form, instapay_address: e.target.value })} /></label>
              <label className="input"><span>محفظة ضغطة</span><input dir="ltr" value={form.wallet_number ?? ''} onChange={(e) => setForm({ ...form, wallet_number: e.target.value })} /></label>
              <label className="input"><span>اسم الحساب</span><input value={form.account_name ?? ''} onChange={(e) => setForm({ ...form, account_name: e.target.value })} /></label>
            </div>
            <div className="row-actions"><button className="btn" onClick={save}>احفظ</button>{msg ? <span className="muted small">{msg}</span> : null}</div>
          </>
        ) : null}
      </section>

      {pending.length ? (
        <section className="panel">
          <div className="panel-head"><h2>تحويلات عمولة من المحلات</h2></div>
          {pending.map((x) => (
            <div key={x.id} className="refund">
              <div><strong>{all.priv[x.shop_id]?.name ?? 'محل'}</strong> · {money(x.amount)}<div className="small muted">{dateTime(x.created_at)} · رقم العملية: <span className="mono">{x.ref || '—'}</span>{x.proof_path ? <> · <a href="#" onClick={(e) => { e.preventDefault(); openProof(x.proof_path!); }}>شوف الإيصال</a></> : null}</div></div>
              <button className="btn accent" onClick={() => review(x, true)}>وصلت · أكّد</button>
              <button className="btn danger" onClick={() => review(x, false)}>ارفض</button>
            </div>
          ))}
        </section>
      ) : null}

      <section className="panel flush">
        <table className="table">
          <thead><tr><th>المحل</th><th>أوردرات اتباعت</th><th>العمولة</th><th>اتسدّد</th><th>{owedMode ? 'عليه' : 'وفّر'}</th></tr></thead>
          <tbody>
            {data.balances.sort((a, b) => Number(b.fees) - Number(a.fees)).map((b) => (
              <tr key={b.shop_id}>
                <td>{all.priv[b.shop_id]?.name ?? '—'}</td><td>{b.orders}</td><td>{money(Number(b.fees))}</td><td>{money(Number(b.paid))}</td>
                <td className="strong">{owedMode ? money(Math.max(0, Number(b.fees) - Number(b.paid))) : money(Number(b.fees))}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!data.balances.length ? <p className="empty">لسه مفيش أوردرات اتباعت.</p> : null}
      </section>
    </>
  );
}

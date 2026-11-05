import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Page, Pill, can, useData } from '../App';
import { DEPOSIT_STATE, dateTime, memberId, money, must, receiptUrl, supabase, useLive, type Order } from '../lib';

/**
 * Pickup deposits (change 1.33). A pickup order is reserved with a small deposit paid to Daghta; it replaces the shop's commission.
 * Here the team switches deposits on, checks InstaPay receipts, refunds, settles refusal disputes and pays shops their no-show share.
 */
export default function Deposits() {
  const { all, role } = useData();
  const deps = all.orders.filter((o) => (o.deposit_status ?? 'none') !== 'none');
  const review = deps.filter((o) => o.deposit_status === 'review');
  const refunds = deps.filter((o) => o.deposit_status === 'refund_due');
  const disputes = deps.filter((o) => o.deposit_status === 'disputed' || o.deposit_status === 'refund_check');
  // a used deposit is Daghta's fee, except in the shop's free months when it goes to the shop (shop_comp)
  const used = deps.filter((o) => o.deposit_status === 'used').reduce((s, o) => s + Number(o.deposit ?? 0) - Number(o.shop_comp ?? 0), 0);
  const kept = deps.filter((o) => o.deposit_status === 'forfeited' || (o.deposit_status === 'used' && Number(o.shop_comp ?? 0) > 0));
  const keptNet = kept.filter((o) => o.deposit_status === 'forfeited').reduce((s, o) => s + Number(o.deposit ?? 0) - Number(o.shop_comp ?? 0), 0);
  const owedShops = Object.entries(kept.filter((o) => Number(o.shop_comp ?? 0) > 0 && !o.shop_comp_paid_at)
    .reduce<Record<string, { amount: number; n: number }>>((acc, o) => {
      const a = acc[o.shop_id] ?? { amount: 0, n: 0 };
      return { ...acc, [o.shop_id]: { amount: a.amount + Number(o.shop_comp), n: a.n + 1 } };
    }, {}));
  const finance = can(role, 'finance');

  return (
    <Page title="العربون" sub={`${review.length} إيصال للمراجعة · ${refunds.length} استرجاع · ${disputes.length} رفض أو خلاف`}>
      <div className="kpis four">
        {[
          ['إيصالات للمراجعة', String(review.length)],
          ['لازم يرجع', String(refunds.length)],
          ['رسوم ضغطة من العربون', money(used)],
          ['عربون مارجعش (بعد نصيب المحلات)', money(keptNet)],
        ].map(([l, v]) => <div key={l} className="kpi"><span className="muted small">{l}</span><strong>{v}</strong></div>)}
      </div>

      <Settings />

      <section className="panel">
        <div className="panel-head"><h2>إيصالات عربون مستنية مراجعة</h2></div>
        <p className="muted small">العربون بيتحوّل لحساب ضغطة. افتح InstaPay أو المحفظة واتأكد إن المبلغ وصل فعلاً قبل ما تأكّد. أول ما تأكّد، رقم المحل وعنوانه بيظهروا للعميل والمحل بيبدأ يجهّز.</p>
        {review.length ? review.map((o) => <DepositReceipt key={o.id} o={o} finance={finance} />) : <p className="empty">مفيش إيصالات مستنية.</p>}
      </section>

      {refunds.length ? (
        <section className="panel">
          <div className="panel-head"><h2>عربون لازم يرجع للعميل</h2></div>
          <p className="muted small">المحل لغى، أو العميل رفض القطعة والمحل أكّد، أو العميل لغى قبل ما نراجع إيصاله. رجّع على نفس طريقة الدفع (البطاقة من Paymob، التحويل لنفس الحساب) وسجّل هنا.</p>
          {refunds.map((o) => <Settle key={o.id} o={o} finance={finance} actions={[['refunded', 'رجّعنا العربون']]} placeholder="رقم عملية الاسترجاع (اختياري)" />)}
        </section>
      ) : null}

      {disputes.length ? (
        <section className="panel">
          <div className="panel-head"><h2>رفض القطعة</h2></div>
          <p className="muted small">«مستني المحل»: المحل عنده ٢٤ ساعة يأكد إن العميل ماخدش القطعة، وبعدها العربون بيرجع لوحده. «خلاف»: المحل بيقول العميل خد القطعة. اتكلم مع الطرفين وقرّر.</p>
          {disputes.map((o) => <Settle key={o.id} o={o} finance={finance} actions={[['refund', 'رجّع العربون للعميل'], ['keep', 'العميل خد القطعة · العربون يفضل']]} placeholder="ملاحظة القرار" />)}
        </section>
      ) : null}

      <section className="panel">
        <div className="panel-head"><h2>نصيب المحلات من العربون اللي مارجعش</h2></div>
        <p className="muted small">لما عميل يدفع عربون ومايجيش، المحل ليه نسبة منه تعويض عن حجز القطعة. حوّل للمحل، وبعدين سجّل إنك حوّلت.</p>
        {owedShops.length ? owedShops.map(([sid, x]) => <ShopShare key={sid} shopId={sid} amount={x.amount} n={x.n} finance={finance} />) : <p className="empty">مفيش مستحقات للمحلات.</p>}
      </section>

      <section className="panel flush">
        <table className="table">
          <thead><tr><th>الأوردر</th><th>العميل</th><th>المحل</th><th>العربون</th><th>الحالة</th><th>الطريقة</th><th>الحجز لحد</th><th>آخر تحديث</th></tr></thead>
          <tbody>
            {deps.map((o) => {
              const c = all.byId[o.customer_id];
              const st = DEPOSIT_STATE[o.deposit_status ?? ''] ?? { label: o.deposit_status, tone: 'plain' as const };
              const part = all.requests.find((r) => r.order_id === o.id);
              return (
                <tr key={o.id}>
                  <td>{part ? <Link className="mono strong" to={`/orders/${part.id}`}>#{o.order_no}</Link> : <span className="mono strong">#{o.order_no}</span>}</td>
                  <td>{c?.full_name}<div className="mono small muted">{memberId(c)}</div></td>
                  <td>{all.priv[o.shop_id]?.name ?? '—'}</td>
                  <td>{money(Number(o.deposit ?? 0))}<div className="small muted">من {money(Number(o.items_total))}</div></td>
                  <td><Pill tone={st.tone}>{st.label}</Pill>{o.deposit_note ? <div className="small muted">{o.deposit_note}</div> : null}</td>
                  <td>{o.deposit_method === 'card' ? 'بطاقة' : o.deposit_method === 'instapay' ? 'تحويل' : '—'}{o.deposit_ref ? <div className="mono small muted">{o.deposit_ref}</div> : null}</td>
                  <td className="small">{o.hold_until ? dateTime(o.hold_until) : '—'}</td>
                  <td className="small muted">{dateTime(o.updated_at ?? o.created_at)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!deps.length ? <p className="empty">لسه مفيش أوردرات بعربون.</p> : null}
      </section>
    </Page>
  );
}

const FIELDS: [string, string][] = [
  ['deposit_hold_hours', 'الحجز بعد ما القطعة تجهز (ساعة)'],
  ['deposit_pay_hours', 'مهلة دفع العربون (ساعة)'],
  ['deposit_shop_share', 'نصيب المحل لو العميل ماجاش ٪'],
];

/** The switch and the numbers (admin only). */
function Settings() {
  const { me, reload } = useData();
  const admin = !!me.is_admin;
  const { data } = useLive(async () => Object.fromEntries((must(await supabase.from('app_settings').select('key, value')) as { key: string; value: string }[]).map((r) => [r.key, r.value])) as Record<string, string>, ['orders']);
  const [form, setForm] = useState<Record<string, string> | null>(null);
  const [msg, setMsg] = useState('');
  const [card, setCard] = useState<boolean | null>(null);
  useEffect(() => { if (data && !form) setForm(data); }, [data, form]);
  useEffect(() => { supabase.functions.invoke('paymob', { body: { mode: 'ping' } }).then(({ data: d }) => setCard(!!d?.configured)).catch(() => setCard(false)); }, []);
  if (!data || !form) return null;
  const on = data.deposits === 'on';
  const transfer = !!(data.instapay_address || data.wallet_number);

  async function set(k: string, v: string) {
    const { error } = await supabase.rpc('set_setting', { p_key: k, p_value: v });
    if (error) throw new Error(/no way to pay/.test(error.message) ? 'حط InstaPay أو محفظة ضغطة في صفحة «الفلوس» الأول، عشان العملاء يقدروا يدفعوا العربون ونرجّعه.' : error.message);
  }
  async function save() {
    setMsg('');
    try { for (const [k] of FIELDS) await set(k, (form![k] ?? '').trim()); setMsg('اتحفظ.'); reload(); } catch (e) { setMsg((e as Error).message); }
  }
  async function toggle() {
    setMsg('');
    if (!on && !confirm('تشغّل العربون؟ من دلوقتي كل أوردر استلام من المحل هيتطلب عليه عربون.')) return;
    try { await set('deposits', on ? 'off' : 'on'); setForm(null); setMsg(on ? 'العربون اتقفل. الاستلام من المحل رجع زي الأول.' : 'العربون اشتغل.'); reload(); } catch (e) { setMsg((e as Error).message); }
  }


  const hiding = data.hide_shops === 'on';
  async function toggleHiding() {
    setMsg('');
    if (!hiding && !confirm('تخبّي المحلات المجانية؟ العملاء هيشوفوا «محل في منطقتك» بدل الاسم والرقم لحد ما يدفعوا العربون أو المحل يشترك.')) return;
    try { await set('hide_shops', hiding ? 'off' : 'on'); setForm(null); setMsg(hiding ? 'كل المحلات بقت ظاهرة.' : 'المحلات المجانية بقت مخفية.'); reload(); } catch (e) { setMsg((e as Error).message); }
  }

  return (
    <>
    <section className="panel">
      <div className="panel-head"><h2>إخفاء المحلات</h2><Pill tone={hiding ? 'wait' : 'plain'}>{hiding ? 'المجانية مخفية' : 'كل المحلات ظاهرة'}</Pill></div>
      <p className="muted small">وهو مقفول، اسم كل محل وصورته ورقمه بيظهروا على عروضه. لو اشتغل، المحل اللي مش مشترك بيظهر «محل في منطقتك» لحد ما العميل يدفع العربون. «محلات قريبة منك» بتعرض كل المحلات في الحالتين.</p>
      {admin ? <div className="row-actions"><button className={'btn ' + (hiding ? 'accent' : 'ghost')} onClick={toggleHiding}>{hiding ? 'اظهر كل المحلات' : 'خبّي المحلات المجانية'}</button></div> : null}
    </section>
    <section className="panel">
      <div className="panel-head"><h2>إعدادات العربون</h2><Pill tone={on ? 'good' : 'plain'}>{on ? 'شغال' : 'مقفول'}</Pill></div>
      <p className="muted small">
        وهو مقفول، الاستلام من المحل شغال زي الأول. لما يشتغل: العميل يدفع العربون لضغطة، رقم المحل وعنوانه يظهروا بعده، والباقي يتدفع في المحل. العربون هو عمولة ضغطة على الأوردر ده. الأوردرات القديمة مش بتتأثر.
      </p>
      <p className="small">
        طرق الدفع المتاحة للعملاء: {transfer ? 'تحويل InstaPay / محفظة ضغطة ✓' : 'تحويل: مش متظبط (حطه في صفحة «الفلوس»)'} · {card === null ? 'بنشيك على البطاقة…' : card ? 'بطاقة (Paymob) ✓' : 'بطاقة: Paymob لسه مش متفعّل'}
      </p>
      {admin ? (
        <>
          <div className="settings-grid">
            {FIELDS.map(([k, label]) => (
              <label key={k} className="input"><span>{label}</span><input dir="ltr" value={form[k] ?? ''} onChange={(e) => setForm({ ...form, [k]: e.target.value })} /></label>
            ))}
          </div>
          <p className="muted small">العربون = عمولة ضغطة الثابتة ({money(Number(data.order_fee || 100))} ج.م)، وبيتغيّر من صفحة «الفلوس». في الشهور المجانية للمحل العربون بيتحوّل للمحل.</p>
          <div className="row-actions">
            <button className="btn" onClick={save}>احفظ الأرقام</button>
            <button className={'btn ' + (on ? 'danger' : 'accent')} onClick={toggle}>{on ? 'اقفل العربون' : 'شغّل العربون'}</button>
            {msg ? <span className="muted small">{msg}</span> : null}
          </div>
        </>
      ) : <p className="muted small">الأدمن بس يقدر يغيّر الإعدادات.</p>}
    </section>
    </>
  );
}

function DepositReceipt({ o, finance }: { o: Order; finance: boolean }) {
  const { all, reload } = useData();
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (o.deposit_proof) receiptUrl(o.deposit_proof).then(setUrl); }, [o.deposit_proof]);
  const c = all.byId[o.customer_id];
  async function decide(ok: boolean) {
    const note = ok ? '' : (prompt('سبب الرفض (بيوصل للعميل)') ?? '').trim();
    if (!ok && !note) return;
    setBusy(true);
    const { error } = await supabase.rpc('staff_review_deposit', { p_order: o.id, p_ok: ok, p_note: note });
    setBusy(false);
    if (error) alert(error.message); else reload();
  }
  return (
    <div className="receipt">
      {url ? <a href={url} target="_blank" rel="noreferrer"><img src={url} alt={'إيصال عربون أوردر ' + o.order_no} /></a> : <div className="receipt-ph">بيحمّل الإيصال…</div>}
      <div className="receipt-body">
        <h3>عربون أوردر <span className="mono">#{o.order_no}</span> · {money(Number(o.deposit ?? 0))}</h3>
        <p className="muted small">{c?.full_name} ({memberId(c)}) · {all.priv[o.shop_id]?.name ?? 'محل'} · رقم العملية: <span className="mono">{o.deposit_ref || 'مش مكتوب'}</span></p>
        <p className="small">اتبعت {dateTime(o.updated_at)}. صورة الإيصال لوحدها مش دليل: اتأكد من الحساب.</p>
        {finance ? (
          <div className="row-actions">
            <button className="btn accent" disabled={busy} onClick={() => decide(true)}>المبلغ وصل · أكّد</button>
            <button className="btn danger" disabled={busy} onClick={() => decide(false)}>ماوصلش</button>
          </div>
        ) : <p className="muted small">المالية أو الأدمن بس يقدروا يأكدوا.</p>}
      </div>
    </div>
  );
}

function Settle({ o, finance, actions, placeholder }: { o: Order; finance: boolean; actions: [string, string][]; placeholder: string }) {
  const { all, reload } = useData();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const c = all.byId[o.customer_id];
  async function act(a: string) {
    setBusy(true);
    const { error } = await supabase.rpc('staff_settle_deposit', { p_order: o.id, p_action: a, p_note: note.trim() });
    setBusy(false);
    if (error) alert(error.message); else reload();
  }
  return (
    <div className="refund">
      <div>
        <strong className="mono">#{o.order_no}</strong> · {money(Number(o.deposit ?? 0))} · {o.deposit_method === 'card' ? 'بطاقة' : 'تحويل'}
        <Pill tone={(DEPOSIT_STATE[o.deposit_status ?? ''] ?? { tone: 'plain' }).tone}>{DEPOSIT_STATE[o.deposit_status ?? '']?.label ?? o.deposit_status}</Pill>
        <div className="small muted">{c?.full_name} · {c?.phone} · {all.priv[o.shop_id]?.name ?? '—'}{o.deposit_ref ? <> · مرجع: <span className="mono">{o.deposit_ref}</span></> : null}</div>
        {o.refusal_reason ? <div className="small">سبب الرفض: {o.refusal_reason}</div> : null}
        {o.deposit_status === 'disputed' && o.deposit_note ? <div className="small">المحل: {o.deposit_note}</div> : null}
        {o.deposit_status === 'refund_check' && o.refusal_answer_due ? <div className="small muted">بيرجع لوحده {dateTime(o.refusal_answer_due)} لو المحل مارّدش</div> : null}
      </div>
      <input className="search" placeholder={placeholder} value={note} onChange={(e) => setNote(e.target.value)} />
      {finance ? <div className="row-actions">{actions.map(([a, label]) => <button key={a} className={'btn ' + (a === 'keep' ? '' : 'accent')} disabled={busy} onClick={() => act(a)}>{label}</button>)}</div>
        : <span className="muted small">للمالية</span>}
    </div>
  );
}

function ShopShare({ shopId, amount, n, finance }: { shopId: string; amount: number; n: number; finance: boolean }) {
  const { all, reload } = useData();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const p = all.priv[shopId] as { name?: string; phone?: string; instapay_address?: string; wallet_number?: string } | undefined;
  async function paid() {
    if (!confirm(`سجّل إنك حوّلت ${money(amount)} لـ ${p?.name ?? 'المحل'}؟`)) return;
    setBusy(true);
    const { error } = await supabase.rpc('staff_pay_shop_comp', { p_shop: shopId, p_note: note.trim() });
    setBusy(false);
    if (error) alert(error.message); else reload();
  }
  return (
    <div className="refund">
      <div><strong>{p?.name ?? 'محل'}</strong> · {money(amount)} ({n} أوردر)
        <div className="small muted">{p?.instapay_address ? <>InstaPay: <span className="mono">{p.instapay_address}</span> · </> : null}{p?.wallet_number ? <>محفظة: <span className="mono">{p.wallet_number}</span> · </> : null}{p?.phone ?? ''}</div>
      </div>
      <input className="search" placeholder="رقم عملية التحويل (اختياري)" value={note} onChange={(e) => setNote(e.target.value)} />
      {finance ? <button className="btn" disabled={busy} onClick={paid}>حوّلنا · سجّل</button> : <span className="muted small">للمالية</span>}
    </div>
  );
}

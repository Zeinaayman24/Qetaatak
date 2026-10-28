import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Field, Page, Pill, useData } from '../App';
import { CATEGORY, PRIORITY, REQUEST_STATUS, TICKET_STATUS, dateTime, memberId, must, orderId, supabase, ticketId, useLive, type TicketMessage } from '../lib';

export default function TicketDetail() {
  const { id } = useParams();
  const { all, me, reload } = useData();
  const t = all.tickets.find((x) => x.id === id);
  const [text, setText] = useState('');
  const [internal, setInternal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const { data: msgs, reload: reloadMsgs } = useLive(async () => must(await supabase.from('ticket_messages').select('*').eq('report_id', id!).order('created_at')) as TicketMessage[], ['ticket_messages'], [id]);
  if (!t) return <Page title="الشكوى"><p className="empty">الشكوى دي مش موجودة.</p></Page>;
  const p = all.byId[t.reporter_id];
  const isShop = !!p?.is_shop;
  const req = t.request_id ? all.requests.find((r) => r.id === t.request_id) : undefined;
  const staff = all.profiles.filter((x) => x.is_admin || x.is_support);

  async function update(patch: Record<string, unknown>) {
    const { error } = await supabase.from('reports').update(patch).eq('id', t!.id);
    if (error) setErr('مقدرناش نحفظ التغيير.'); else { setErr(''); reload(); }
  }
  async function send(resolve = false) {
    const body = text.trim();
    if (!body) return;
    setBusy(true); setErr('');
    const { error } = await supabase.from('ticket_messages').insert({ report_id: t!.id, body, internal });
    if (error) { setErr('الرسالة متبعتتش. جرّب تاني.'); setBusy(false); return; }
    const patch: Record<string, unknown> = {};
    if (!t!.assigned_to) patch.assigned_to = me.id;
    if (resolve) { patch.status = 'resolved'; patch.resolved_at = new Date().toISOString(); }
    else if (t!.status === 'open' && !internal) patch.status = 'in_progress';
    if (Object.keys(patch).length) await supabase.from('reports').update(patch).eq('id', t!.id);
    setText(''); setBusy(false); reloadMsgs(); reload();
  }

  return (
    <Page title={<>شكوى <span className="mono">{ticketId(t.ticket_no)}</span></>} sub={<>{CATEGORY[t.category]} · {dateTime(t.created_at)}</>}
      actions={t.status !== 'resolved'
        ? <button className="btn ghost" onClick={() => update({ status: 'resolved', resolved_at: new Date().toISOString() })}>اقفل الشكوى</button>
        : <button className="btn ghost" onClick={() => update({ status: 'open', resolved_at: null })}>افتحها تاني</button>}>
      <div className="ticket-layout">
        <section className="panel conversation">
          <div className="bubble them">
            <span className="small muted">{isShop ? all.priv[t.reporter_id]?.name : p?.full_name} · {dateTime(t.created_at)}</span>
            <p>{t.body}</p>
          </div>
          {t.admin_reply ? <div className="bubble us"><span className="small muted">ردّ قديم</span><p>{t.admin_reply}</p></div> : null}
          {(msgs ?? []).map((m) => {
            const fromReporter = m.sender_id === t.reporter_id;
            const who = fromReporter ? (isShop ? all.priv[t.reporter_id]?.name : p?.full_name) : (all.byId[m.sender_id]?.full_name || 'خدمة العملاء');
            return (
              <div key={m.id} className={'bubble ' + (m.internal ? 'internal' : fromReporter ? 'them' : 'us')}>
                <span className="small muted">{m.internal ? '🔒 ملاحظة داخلية · ' : ''}{who} · {dateTime(m.created_at)}</span>
                <p>{m.body}</p>
              </div>
            );
          })}
          <div className="composer">
            <textarea id="reply" rows={4} placeholder={internal ? 'ملاحظة لفريق العمل بس، العميل مش هيشوفها' : `ردّك هيوصل ${isShop ? 'للمحل' : 'للعميل'} في التطبيق كإشعار`} value={text} onChange={(e) => setText(e.target.value)} className={internal ? 'internal' : ''} />
            <div className="composer-actions">
              <label className="check"><input type="checkbox" checked={internal} onChange={(e) => setInternal(e.target.checked)} /> ملاحظة داخلية</label>
              <span style={{ flex: 1 }} />
              {!internal && t.status !== 'resolved' ? <button className="btn ghost" disabled={busy || !text.trim()} onClick={() => send(true)}>ابعت واقفل</button> : null}
              <button className="btn" disabled={busy || !text.trim()} onClick={() => send(false)}>{internal ? 'احفظ الملاحظة' : 'ابعت الرد'}</button>
            </div>
            {err ? <p className="error">{err}</p> : null}
          </div>
        </section>

        <aside className="side">
          <section className="panel">
            <h2>الشكوى</h2>
            <div className="fields">
              <Field label="الحالة"><Pill tone={t.status === 'resolved' ? 'good' : t.status === 'open' ? 'wait' : 'plain'}>{TICKET_STATUS[t.status]}</Pill></Field>
              <Field label="الأولوية">
                <select value={t.priority} onChange={(e) => update({ priority: e.target.value })}>{Object.entries(PRIORITY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
              </Field>
              <Field label="المسؤول">
                <select value={t.assigned_to ?? ''} onChange={(e) => update({ assigned_to: e.target.value || null })}>
                  <option value="">مش متحوّلة</option>
                  {staff.map((s) => <option key={s.id} value={s.id}>{s.full_name || s.email}</option>)}
                </select>
              </Field>
              <Field label="الحالة">
                <select value={t.status} onChange={(e) => update({ status: e.target.value, resolved_at: e.target.value === 'resolved' ? new Date().toISOString() : null })}>
                  {Object.entries(TICKET_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </Field>
            </div>
          </section>
          <section className="panel">
            <h2>{isShop ? 'المحل' : 'العميل'}</h2>
            <div className="fields">
              <Field label="الرقم"><Link className="mono" to={isShop ? `/shops/${t.reporter_id}` : `/customers/${t.reporter_id}`}>{memberId(p)}</Link></Field>
              <Field label="الاسم">{isShop ? all.priv[t.reporter_id]?.name : p?.full_name}</Field>
              <Field label="الموبايل"><span className="mono" dir="ltr">{isShop ? all.priv[t.reporter_id]?.phone : p?.phone}</span></Field>
              <Field label="الإيميل"><span dir="ltr">{p?.email}</span></Field>
              <Field label="شكاوى قبل كده">{all.tickets.filter((x) => x.reporter_id === t.reporter_id && x.id !== t.id).length}</Field>
            </div>
          </section>
          {req ? (
            <section className="panel">
              <h2>الطلب المرتبط</h2>
              <div className="fields">
                <Field label="الطلب"><Link className="mono" to={`/orders/${req.id}`}>{orderId(req.num)}</Link></Field>
                <Field label="القطعة">{req.part}</Field>
                <Field label="الحالة">{REQUEST_STATUS[req.status]}</Field>
              </div>
            </section>
          ) : null}
        </aside>
      </div>
    </Page>
  );
}

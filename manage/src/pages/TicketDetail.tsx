import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Field, Page, Pill, useData } from '../App';
import { CATEGORY, PRIORITY, REQUEST_STATUS, RESOLVED_BY, TICKET_STATUS, dateTime, memberId, must, orderId, supabase, ticketId, useLive, type TicketMessage } from '../lib';

/**
 * One complaint as one live conversation: what the customer said to the assistant, the hand-over,
 * and the agent's chat with the customer. The agent takes the chat over, replies, and ends it.
 */
export default function TicketDetail() {
  const { id } = useParams();
  const { all, me, reload } = useData();
  const t = all.tickets.find((x) => x.id === id);
  const [text, setText] = useState('');
  const [internal, setInternal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const { data: msgs, reload: reloadMsgs } = useLive(async () => must(await supabase.from('ticket_messages').select('*').eq('report_id', id!).order('created_at')) as TicketMessage[], ['ticket_messages'], [id]);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [msgs?.length, t?.id]);

  if (!t) return <Page title="الشكوى"><p className="empty">الشكوى دي مش موجودة.</p></Page>;
  const p = all.byId[t.reporter_id];
  const isShop = !!p?.is_shop;
  const reporterName = isShop ? all.priv[t.reporter_id]?.name : p?.full_name;
  const req = t.request_id ? all.requests.find((r) => r.id === t.request_id) : undefined;
  const staff = all.profiles.filter((x) => x.is_admin || x.is_support);
  const agent = t.assigned_to ? all.byId[t.assigned_to] : undefined;
  const mine = t.status === 'in_progress' && t.assigned_to === me.id;
  const ended = t.status === 'resolved';

  async function update(patch: Record<string, unknown>) {
    const { error } = await supabase.from('reports').update(patch).eq('id', t!.id);
    if (error) setErr('مقدرناش نحفظ التغيير.'); else { setErr(''); reload(); }
  }
  async function rpc(fn: 'take_ticket' | 'close_ticket') {
    const { error } = await supabase.rpc(fn, { p_report: t!.id });
    if (error) setErr('مقدرناش نكمّل. جرّب تاني.'); else setErr('');
    reload(); reloadMsgs();
    return !error;
  }
  async function send(close = false) {
    const body = text.trim();
    if (!body) return;
    setBusy(true); setErr('');
    // Writing to the customer means you are handling this chat.
    if (!internal && !mine && !(await rpc('take_ticket'))) { setBusy(false); return; }
    const { error } = await supabase.from('ticket_messages').insert({ report_id: t!.id, body, internal });
    if (error) { setErr('الرسالة متبعتتش. جرّب تاني.'); setBusy(false); return; }
    if (close) await rpc('close_ticket');
    setText(''); setBusy(false); reloadMsgs(); reload();
  }

  const hasTranscript = (msgs ?? []).some((m) => m.kind === 'bot');
  const banner =
    t.status === 'bot' ? { tone: 'plain', text: 'المساعد الآلي لسه بيتعامل مع العميل. تقدر تستلم المحادثة منه في أي وقت.' } :
    t.status === 'open' ? { tone: 'wait', text: 'المساعد حوّل المحادثة لخدمة العملاء والعميل مستني حد يرد عليه.' } :
    t.status === 'in_progress' ? { tone: mine ? 'dark' : 'plain', text: mine ? 'انت ماسك المحادثة دي. ردودك بتوصل للعميل فوراً في نفس الشات.' : `${agent?.full_name || 'موظف'} ماسك المحادثة دي.` } :
    { tone: 'good', text: `المحادثة انتهت${t.resolved_by ? ' · ' + RESOLVED_BY[t.resolved_by] : ''}.` };

  return (
    <Page title={<>محادثة <span className="mono">{ticketId(t.ticket_no)}</span></>} sub={<>{CATEGORY[t.category]} · بدأت {dateTime(t.created_at)}</>}
      actions={
        <>
          {!ended && !mine ? <button className="btn" onClick={() => rpc('take_ticket')}>{t.status === 'in_progress' ? 'استلمها انت' : 'استلم المحادثة'}</button> : null}
          {!ended ? <button className="btn ghost" onClick={() => rpc('close_ticket')}>إنهاء المحادثة</button> : null}
          {ended ? <button className="btn ghost" onClick={() => rpc('take_ticket')}>افتحها تاني</button> : null}
        </>
      }>
      <div className="ticket-layout">
        <section className="panel conversation">
          <div className={'chat-banner ' + banner.tone}>{banner.text}</div>
          <div className="chat-scroll">
          {!hasTranscript ? (
            <div className="bubble them">
              <span className="small muted">{reporterName} · {dateTime(t.created_at)}</span>
              <p>{t.body}</p>
            </div>
          ) : null}
          {t.admin_reply ? <div className="bubble us"><span className="small muted">ردّ قديم</span><p>{t.admin_reply}</p></div> : null}
          {(msgs ?? []).map((m) => {
            if (m.kind === 'system') return <div key={m.id} className="chat-event">{m.body} · {dateTime(m.created_at)}</div>;
            const fromReporter = m.sender_id === t.reporter_id && m.kind === 'user';
            const who = m.kind === 'bot' ? '🤖 المساعد الآلي' : fromReporter ? reporterName : (all.byId[m.sender_id]?.full_name || 'خدمة العملاء');
            const cls = m.internal ? 'internal' : m.kind === 'bot' ? 'bot' : fromReporter ? 'them' : 'us';
            return (
              <div key={m.id} className={'bubble ' + cls}>
                <span className="small muted">{m.internal ? '🔒 ملاحظة داخلية · ' : ''}{who} · {dateTime(m.created_at)}</span>
                <p>{m.body}</p>
              </div>
            );
          })}
          <div ref={end} />
          </div>
          {!ended ? (
            <div className="composer">
              <textarea id="reply" rows={3} placeholder={internal ? 'ملاحظة لفريق العمل بس، العميل مش هيشوفها' : `اكتب ${isShop ? 'للمحل' : 'للعميل'}… بيوصله فوراً في نفس الشات`}
                value={text} onChange={(e) => setText(e.target.value)} className={internal ? 'internal' : ''}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !internal) { e.preventDefault(); send(false); } }} />
              <div className="composer-actions">
                <label className="check"><input type="checkbox" checked={internal} onChange={(e) => setInternal(e.target.checked)} /> ملاحظة داخلية</label>
                <span className="small muted">Enter للإرسال · Shift+Enter سطر جديد</span>
                <span style={{ flex: 1 }} />
                {!internal ? <button className="btn ghost" disabled={busy || !text.trim()} onClick={() => send(true)}>ابعت وإنهي المحادثة</button> : null}
                <button className="btn" disabled={busy || !text.trim()} onClick={() => send(false)}>{internal ? 'احفظ الملاحظة' : mine ? 'ابعت' : 'استلم وابعت'}</button>
              </div>
              {err ? <p className="error">{err}</p> : null}
            </div>
          ) : <p className="empty">المحادثة انتهت. العميل لو احتاج حاجة تانية هيبدأ محادثة جديدة مع المساعد.</p>}
        </section>

        <aside className="side">
          <section className="panel">
            <h2>المحادثة</h2>
            <div className="fields">
              <Field label="الحالة"><Pill tone={ended ? 'good' : t.status === 'open' ? 'wait' : t.status === 'bot' ? 'plain' : 'dark'}>{TICKET_STATUS[t.status]}</Pill></Field>
              <Field label="مع مين">{t.status === 'bot' ? 'المساعد الآلي' : agent ? agent.full_name || agent.email : '—'}</Field>
              {t.escalated_at ? <Field label="اتحوّلت لموظف">{dateTime(t.escalated_at)}</Field> : null}
              {t.resolved_by ? <Field label="الإنهاء">{RESOLVED_BY[t.resolved_by]}</Field> : null}
              <Field label="الأولوية">
                <select value={t.priority} onChange={(e) => update({ priority: e.target.value })}>{Object.entries(PRIORITY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
              </Field>
              <Field label="حوّلها لزميل">
                <select value={t.assigned_to ?? ''} onChange={(e) => update({ assigned_to: e.target.value || null, ...(e.target.value && t.status === 'open' ? { status: 'in_progress' } : {}) })}>
                  <option value="">محدش</option>
                  {staff.map((s) => <option key={s.id} value={s.id}>{s.full_name || s.email}</option>)}
                </select>
              </Field>
            </div>
          </section>
          <section className="panel">
            <h2>{isShop ? 'المحل' : 'العميل'}</h2>
            <div className="fields">
              <Field label="الرقم"><Link className="mono" to={isShop ? `/shops/${t.reporter_id}` : `/customers/${t.reporter_id}`}>{memberId(p)}</Link></Field>
              <Field label="الاسم">{reporterName}</Field>
              <Field label="الموبايل"><span className="mono" dir="ltr">{isShop ? all.priv[t.reporter_id]?.phone : p?.phone}</span></Field>
              <Field label="الإيميل"><span dir="ltr">{p?.email}</span></Field>
              <Field label="محادثات قبل كده">{all.tickets.filter((x) => x.reporter_id === t.reporter_id && x.id !== t.id).length}</Field>
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

import { useState } from 'react';
import { Modal, Page, Pill, ROLE_NAME, useData, type Role } from '../App';
import { dateTime, supabase, useLive } from '../lib';

type Member = { id: string; full_name: string; email: string; role: Role; last_sign_in_at: string | null; invited: boolean };
const call = async (body: Record<string, unknown>) => {
  const { data, error } = await supabase.functions.invoke('staff-invite', { body });
  if (error) throw error;
  return data;
};

/** «فريق العمل» (C10): admins invite members by email with a role, change roles, or remove them. */
export default function Staff() {
  const { me } = useData();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('support');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<Member | null>(null);
  const { data, reload } = useLive(async () => ((await call({ action: 'list' })).rows ?? []) as Member[], ['profiles']);

  async function invite() {
    setMsg(''); setBusy(true);
    try { await call({ action: 'invite', name, email, role }); setName(''); setEmail(''); setMsg('اتبعتت الدعوة.'); reload(); }
    catch { setMsg('مقدرناش نبعت الدعوة. اتأكد من الإيميل.'); }
    setBusy(false);
  }
  async function changeRole(m: Member, r: Role) { await call({ action: 'role', id: m.id, role: r }); reload(); }
  async function remove() {
    if (!removing) return;
    await call({ action: 'remove', id: removing.id }); setRemoving(null); reload();
  }

  return (
    <Page title="فريق العمل">
      <section className="panel">
        <h2>أضف عضو</h2>
        <div className="toolbar">
          <input placeholder="الاسم" value={name} onChange={(e) => setName(e.target.value)} />
          <input className="search" dir="ltr" placeholder="الإيميل" value={email} onChange={(e) => setEmail(e.target.value)} />
          <select value={role} onChange={(e) => setRole(e.target.value as Role)} aria-label="الدور">
            {(Object.keys(ROLE_NAME) as Role[]).map((r) => <option key={r} value={r}>{ROLE_NAME[r]}</option>)}
          </select>
          <button className="btn" disabled={busy || !name.trim() || !email.trim()} onClick={invite}>ابعت دعوة</button>
        </div>
        <p className="muted small">العضو لازم يفعّل التحقق بخطوتين أول مرة يدخل.</p>
        {msg ? <p className="muted">{msg}</p> : null}
      </section>
      <section className="panel flush">
        <table className="table">
          <thead><tr><th>الاسم</th><th>الإيميل</th><th>الدور</th><th>آخر دخول</th><th /></tr></thead>
          <tbody>{(data ?? []).map((m) => (
            <tr key={m.id}>
              <td>{m.full_name || '—'}</td>
              <td dir="ltr" className="small">{m.email}</td>
              <td>{m.id === me.id ? <Pill tone="dark">{ROLE_NAME[m.role]}</Pill> : (
                <select value={m.role} onChange={(e) => changeRole(m, e.target.value as Role)} aria-label="غيّر الدور">
                  {(Object.keys(ROLE_NAME) as Role[]).map((r) => <option key={r} value={r}>{ROLE_NAME[r]}</option>)}
                </select>
              )}</td>
              <td className="small">{m.last_sign_in_at ? dateTime(m.last_sign_in_at) : 'مستني يدخل'}</td>
              <td>{m.id !== me.id ? <button className="link danger" onClick={() => setRemoving(m)}>شيل</button> : null}</td>
            </tr>
          ))}</tbody>
        </table>
      </section>
      {removing ? (
        <Modal title={`تشيل ${removing.full_name || removing.email}؟`} onClose={() => setRemoving(null)}>
          <p>هيخرج فوراً ومش هيقدر يدخل تاني.</p>
          <div className="toolbar"><button className="btn danger" onClick={remove}>شيل</button><button className="btn ghost" onClick={() => setRemoving(null)}>لأ</button></div>
        </Modal>
      ) : null}
    </Page>
  );
}

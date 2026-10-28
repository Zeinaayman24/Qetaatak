import { useState } from 'react';
import { Page, Pill, useData } from '../App';
import { memberId, supabase } from '../lib';

/** Admins add or remove customer service staff by the email they signed up with. */
export default function Staff() {
  const { all, me, reload } = useData();
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState('');
  const staff = all.profiles.filter((p) => p.is_admin || p.is_support);

  async function add() {
    setMsg('');
    const e = email.trim().toLowerCase();
    const p = all.profiles.find((x) => x.email.toLowerCase() === e);
    if (!p) return setMsg('مفيش حساب بالإيميل ده. الموظف لازم يعمل حساب على قطعتك الأول ويكمّل بياناته.');
    if (p.is_admin || p.is_support) return setMsg('الشخص ده في الفريق بالفعل.');
    const { error } = await supabase.from('profiles').update({ is_support: true }).eq('id', p.id);
    if (error) return setMsg('مقدرناش نضيفه.');
    setEmail(''); setMsg('اتضاف كموظف خدمة عملاء.'); reload();
  }
  async function remove(id: string) {
    const { error } = await supabase.from('profiles').update({ is_support: false }).eq('id', id);
    if (!error) reload();
  }

  return (
    <Page title="فريق العمل" sub="موظفين خدمة العملاء بيشوفوا البيانات ويردوا على الشكاوى. الموافقة على المحلات والحظر للأدمن بس.">
      <section className="panel">
        <h2>أضف موظف</h2>
        <div className="toolbar">
          <input className="search" dir="ltr" placeholder="email@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          <button className="btn" onClick={add}>أضف كخدمة عملاء</button>
        </div>
        {msg ? <p className="muted">{msg}</p> : null}
      </section>
      <section className="panel flush">
        <table className="table">
          <thead><tr><th>الرقم</th><th>الاسم</th><th>الإيميل</th><th>الدور</th><th>شكاوى متحوّلة</th><th /></tr></thead>
          <tbody>{staff.map((s) => (
            <tr key={s.id}>
              <td className="mono">{memberId(s)}</td><td>{s.full_name || '—'}</td><td dir="ltr" className="small">{s.email}</td>
              <td><Pill tone={s.is_admin ? 'dark' : 'plain'}>{s.is_admin ? 'أدمن' : 'خدمة عملاء'}</Pill></td>
              <td>{all.tickets.filter((t) => t.assigned_to === s.id && t.status !== 'resolved').length}</td>
              <td>{!s.is_admin && s.id !== me.id ? <button className="link danger" onClick={() => remove(s.id)}>شيله</button> : null}</td>
            </tr>
          ))}</tbody>
        </table>
      </section>
    </Page>
  );
}

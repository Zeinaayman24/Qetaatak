import { useState } from 'react';
import { Page, useData } from '../App';
import { dateTime, supabase, useLive } from '../lib';

type Row = { id: number; at: string; staff_id: string | null; action: string; target_type: string; target_id: string; before: unknown; after: unknown; reason: string };
const ACTION: Record<string, string> = {
  phone_shown: 'عرض رقم', chat_opened: 'فتح محادثة', document_opened: 'فتح مستند', 'claim task': 'أخد مهمة', 'finish task': 'خلّص مهمة',
};
const label = (a: string) => ACTION[a] ?? a.replace(/^(update|insert|delete) /, (m) => ({ 'update ': 'تعديل ', 'insert ': 'إضافة ', 'delete ': 'مسح ' } as Record<string, string>)[m]);

/** «سجل التغييرات» (C11): every staff action, admins only. Rows can't be edited or deleted. */
export default function ChangeLog() {
  const { all } = useData();
  const [staff, setStaff] = useState('');
  const [kind, setKind] = useState('');
  const [day, setDay] = useState('');
  const { data } = useLive(async () => {
    let q = supabase.from('staff_log').select('*').order('at', { ascending: false }).limit(500);
    if (staff) q = q.eq('staff_id', staff);
    if (kind) q = q.ilike('action', `%${kind}%`);
    if (day) q = q.gte('at', new Date(day).toISOString()).lt('at', new Date(new Date(day).getTime() + 86400000).toISOString());
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as Row[];
  }, ['staff_log'], [staff, kind, day]);
  const team = all.profiles.filter((p) => p.staff_role || p.is_admin || p.is_support);
  const show = (v: unknown) => (v == null ? '' : JSON.stringify(v).slice(0, 160));
  return (
    <Page title="سجل التغييرات" sub="الأدمن بس">
      <div className="toolbar">
        <select value={staff} onChange={(e) => setStaff(e.target.value)}><option value="">الموظف</option>{team.map((p) => <option key={p.id} value={p.id}>{p.full_name || p.email}</option>)}</select>
        <select value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="">نوع الإجراء</option><option value="update">تعديل</option><option value="chat_opened">فتح محادثة</option><option value="phone_shown">عرض رقم</option><option value="document_opened">فتح مستند</option>
        </select>
        <input type="date" value={day} onChange={(e) => setDay(e.target.value)} aria-label="التاريخ" />
      </div>
      <section className="panel flush">
        <table className="table">
          <thead><tr><th>الوقت</th><th>الموظف</th><th>الإجراء</th><th>على</th><th>قبل</th><th>بعد</th><th>السبب</th></tr></thead>
          <tbody>{(data ?? []).map((r) => (
            <tr key={r.id}>
              <td className="small">{dateTime(r.at)}</td>
              <td>{r.staff_id ? all.byId[r.staff_id]?.full_name || '—' : 'النظام'}</td>
              <td>{label(r.action)}</td>
              <td className="small mono">{r.target_type} {r.target_id.slice(0, 8)}</td>
              <td className="small mono" dir="ltr">{show(r.before)}</td>
              <td className="small mono" dir="ltr">{show(r.after)}</td>
              <td className="small">{r.reason}</td>
            </tr>
          ))}</tbody>
        </table>
      </section>
    </Page>
  );
}

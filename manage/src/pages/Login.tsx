import { Logo } from '../Logo';
import { useState } from 'react';
import { supabase } from '../lib';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(''); setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
    setBusy(false);
    if (error) setErr(/Invalid login/i.test(error.message) ? 'الإيميل أو كلمة السر غلط.' : 'مشكلة في الدخول. جرّب تاني.');
  }
  return (
    <div className="center-screen">
      <form className="card narrow" onSubmit={submit}>
        <Logo as="h1" />
        <h2>نظام الإدارة</h2>
        <p className="muted">لفريق العمل وخدمة العملاء. ادخل بنفس حسابك على ضغطة.</p>
        <label className="input"><span>الإيميل</span><input id="email" type="email" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required /></label>
        <label className="input"><span>كلمة السر</span><input id="password" type="password" dir="ltr" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required /></label>
        {err ? <p className="error">{err}</p> : null}
        <button className="btn" disabled={busy}>{busy ? 'بيدخل…' : 'دخول'}</button>
      </form>
    </div>
  );
}

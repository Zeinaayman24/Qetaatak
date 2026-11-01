import { Logo } from '../Logo';
import { useState } from 'react';
import { supabase } from '../lib';

/** C01 staff sign-in, step 1: email and password. Step 2 (authenticator code) is in Mfa.tsx. */
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
    else markSignIn();
  }
  return (
    <div className="center-screen">
      <form className="card narrow" onSubmit={submit}>
        <Logo as="h1" />
        <h2>نظام إدارة ضغطة</h2>
        <p className="muted">لفريق ضغطة بس. كل دخول وكل تغيير بيتسجّل.</p>
        <label className="input"><span>الإيميل</span><input id="email" type="email" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required /></label>
        <label className="input"><span>كلمة السر</span><input id="password" type="password" dir="ltr" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required /></label>
        {err ? <p className="error">{err}</p> : null}
        <button className="btn" disabled={busy}>{busy ? '…' : 'دخول'}</button>
      </form>
    </div>
  );
}

/* ---------------------------------------------------------------- session limits (C01) */
const SIGNED_IN = 'daghta-manage-signed-in';
const ACTIVE = 'daghta-manage-active';
export const SESSION_MAX_MS = 12 * 3600000;
export const IDLE_MAX_MS = 3600000;
const get = (k: string) => { try { return Number(localStorage.getItem(k)) || 0; } catch { return 0; } };
const put = (k: string, v: number) => { try { localStorage.setItem(k, String(v)); } catch { /* storage blocked */ } };
export function markSignIn() { put(SIGNED_IN, Date.now()); put(ACTIVE, Date.now()); }
export function markActive() { put(ACTIVE, Date.now()); }
/** True when the session is older than 12 hours or idle for an hour. */
export function sessionExpired() {
  const s = get(SIGNED_IN), a = get(ACTIVE), now = Date.now();
  if (!s) { markSignIn(); return false; }
  return now - s > SESSION_MAX_MS || now - a > IDLE_MAX_MS;
}

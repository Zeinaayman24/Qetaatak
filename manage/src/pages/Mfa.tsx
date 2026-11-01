import { useEffect, useState } from 'react';
import { Logo } from '../Logo';
import { supabase } from '../lib';

/**
 * C01 step 2: the code from an authenticator app (Google Authenticator and similar).
 * First time: the staff member scans a QR code to turn on two-step login.
 */
export default function Mfa({ onDone }: { onDone: () => void }) {
  const [factorId, setFactorId] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [secret, setSecret] = useState('');
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.auth.mfa.listFactors();
      if (error) return setErr('مشكلة في الدخول. جرّب تاني.');
      const verified = data.totp.find((f) => f.status === 'verified');
      if (verified) return setFactorId(verified.id);
      // clean up an unfinished setup, then start a new one
      for (const f of data.all.filter((x) => x.factor_type === 'totp' && x.status !== 'verified')) await supabase.auth.mfa.unenroll({ factorId: f.id });
      const en = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Daghta ' + Date.now() });
      if (en.error) return setErr('مشكلة في الدخول. جرّب تاني.');
      setFactorId(en.data.id); setQr(en.data.totp.qr_code); setSecret(en.data.totp.secret);
    })();
  }, []);

  async function confirm(e: React.FormEvent) {
    e.preventDefault();
    if (!factorId) return;
    setErr(''); setBusy(true);
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: code.replace(/\D/g, '') });
    setBusy(false);
    if (error) return setErr('الكود غلط.');
    onDone();
  }

  return (
    <div className="center-screen">
      <form className="card narrow" onSubmit={confirm}>
        <Logo as="h1" />
        <h2>نظام إدارة ضغطة</h2>
        {qr ? (
          <>
            <p>فعّل التحقق بخطوتين: امسح الكود ده بتطبيق التحقق واكتب الرقم.</p>
            <img src={qr} alt="" width={180} height={180} style={{ alignSelf: 'center', background: '#fff', borderRadius: 12 }} />
            <p className="muted small mono" dir="ltr" style={{ textAlign: 'center', wordBreak: 'break-all' }}>{secret}</p>
          </>
        ) : <p>اكتب الكود من تطبيق التحقق (Google Authenticator)</p>}
        <label className="input"><span>الكود</span>
          <input inputMode="numeric" autoComplete="one-time-code" dir="ltr" maxLength={6} value={code} onChange={(e) => setCode(e.target.value)} required autoFocus />
        </label>
        {err ? <p className="error">{err}</p> : null}
        <button className="btn" disabled={busy || !factorId}>{busy ? '…' : 'تأكيد'}</button>
        <button type="button" className="link" onClick={() => supabase.auth.signOut()}>خروج</button>
      </form>
    </div>
  );
}

import { Logo } from './Logo';
import Payments from './pages/Payments';
import Deposits from './pages/Deposits';
import Ads from './pages/Ads';
import SpeedPage from './pages/Speed';
import Cars from './pages/Cars';
import Install from './pages/Install';
import type { Session } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { HashRouter, NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { ALL_TABLES, loadAll, supabase, useLive, type All, type Profile } from './lib';
import Customers from './pages/Customers';
import CustomerDetail from './pages/CustomerDetail';
import Tasks from './pages/Tasks';
import ChangeLog from './pages/ChangeLog';
import Mfa from './pages/Mfa';
import { markActive, sessionExpired } from './pages/Login';
import Login from './pages/Login';
import OrderDetail from './pages/OrderDetail';
import Orders from './pages/Orders';
import ShopDetail from './pages/ShopDetail';
import Shops from './pages/Shops';
import Staff from './pages/Staff';
import TicketDetail from './pages/TicketDetail';
import Tickets from './pages/Tickets';

type Ctx = { me: Profile; role: Role; all: All; reload: () => void };
export type Role = 'admin' | 'support' | 'review' | 'finance';
export const ROLE_NAME: Record<Role, string> = { admin: 'أدمن', support: 'خدمة عملاء', review: 'مراجعة المحلات', finance: 'مالية' };
/** Can this role do a step that needs `need`? Admin can do everything. */
export const can = (role: Role, need: Role) => role === 'admin' || role === need;
const DataCtx = createContext<Ctx | null>(null);
export const useData = () => {
  const v = useContext(DataCtx);
  if (!v) throw new Error('no data');
  return v;
};

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);
  if (session === undefined) return <div className="center-screen"><span className="spinner" /></div>;
  if (!session) return <Login />;
  return <StaffGate session={session} />;
}

function StaffGate({ session }: { session: Session }) {
  const [me, setMe] = useState<Profile | null | undefined>(undefined);
  const [role, setRole] = useState<Role | null>(null);
  const [aal2, setAal2] = useState<boolean | null>(null);
  useEffect(() => {
    supabase.from('profiles').select('*').eq('id', session.user.id).maybeSingle().then(({ data }) => setMe((data as Profile) ?? null));
    supabase.rpc('my_staff_role').then(({ data }) => setRole((data as Role) ?? null));
    supabase.auth.mfa.getAuthenticatorAssuranceLevel().then(({ data }) => setAal2(data?.currentLevel === 'aal2'));
  }, [session.user.id, session.access_token]);
  // signed out after 12 hours, or 1 hour without using the app (C01)
  useEffect(() => {
    if (sessionExpired()) { supabase.auth.signOut(); return; }
    const touch = () => markActive();
    ['click', 'keydown', 'scroll'].forEach((e) => window.addEventListener(e, touch, { passive: true }));
    const t = setInterval(() => { if (sessionExpired()) supabase.auth.signOut(); }, 60000);
    return () => { clearInterval(t); ['click', 'keydown', 'scroll'].forEach((e) => window.removeEventListener(e, touch)); };
  }, []);
  if (me === undefined || aal2 === null) return <div className="center-screen"><span className="spinner" /></div>;
  if (!me || !role) {
    return (
      <div className="center-screen">
        <div className="card narrow">
          <Logo as="h1" />
          <p className="error">الحساب ده مش من فريق ضغطة.</p>
          <button className="btn" onClick={() => supabase.auth.signOut()}>خروج</button>
        </div>
      </div>
    );
  }
  if (!aal2) return <Mfa onDone={() => setAal2(true)} />;
  return <Shell me={me} role={role} />;
}

function Shell({ me, role }: { me: Profile; role: Role }) {
  const { data, error, reload } = useLive(loadAll, ALL_TABLES);
  if (error) return <div className="center-screen"><p className="error">مشكلة في تحميل البيانات: {error}</p></div>;
  if (!data) return <div className="center-screen"><span className="spinner" /></div>;
  const openTickets = data.tickets.filter((t) => t.status === 'open').length;
  const pendingShops = Object.values(data.shops).filter((s) => s.status === 'pending').length;
  return (
    <DataCtx.Provider value={{ me, role, all: data, reload }}>
      <HashRouter>
        <div className="layout">
          <aside className="sidebar">
            <div className="brand"><Logo dark /><span className="tag">الإدارة</span></div>
            <nav>
              <Nav to="/" icon="grid" label="المهام" end />
              <Nav to="/tickets" icon="chat" label="خدمة العملاء" badge={openTickets} />
              <Nav to="/shops" icon="store" label="المحلات" badge={pendingShops} />
              <Nav to="/customers" icon="users" label="العملاء" />
              <Nav to="/orders" icon="receipt" label="الطلبات والأوردرات" />
              <Nav to="/payments" icon="card" label="الفلوس" badge={data.orders.filter((o) => o.payment_status === 'review' || o.payment_status === 'refund_due').length} />
              <Nav to="/deposits" icon="card" label="العربون" badge={data.orders.filter((o) => ['review', 'refund_due', 'disputed'].includes(o.deposit_status ?? '')).length} />
              <Nav to="/reports-chat" icon="flag" label="البلاغات" />
              <Nav to="/ads" icon="megaphone" label="الإعلانات" />
              <Nav to="/install" icon="wrench" label="التركيب" />
              <Nav to="/cars" icon="car" label="العربيات" />
              <Nav to="/reports" icon="chart" label="التقارير" />
              {role === 'admin' ? <Nav to="/staff" icon="shield" label="فريق العمل" /> : null}
              {role === 'admin' ? <Nav to="/log" icon="clock" label="سجل التغييرات" /> : null}
            </nav>
            <div className="me">
              <div>
                <strong>{me.full_name || me.email}</strong>
                <span className="muted small">{ROLE_NAME[role]}</span>
              </div>
              <button className="link" onClick={() => supabase.auth.signOut()}>خروج</button>
            </div>
          </aside>
          <main className="main">
            <Routes>
              <Route path="/" element={<Tasks />} />
              <Route path="/log" element={role === 'admin' ? <ChangeLog /> : <Navigate to="/" />} />
              <Route path="/tickets" element={<Tickets />} />
              <Route path="/tickets/:id" element={<TicketDetail />} />
              <Route path="/customers" element={<Customers />} />
              <Route path="/customers/:id" element={<CustomerDetail />} />
              <Route path="/shops" element={<Shops />} />
              <Route path="/shops/:id" element={<ShopDetail />} />
              <Route path="/orders" element={<Orders />} />
              <Route path="/orders/:id" element={<OrderDetail />} />
              <Route path="/payments" element={<Payments />} />
              <Route path="/deposits" element={<Deposits />} />
              <Route path="/ads" element={<Ads />} />
              <Route path="/install" element={<Install />} />
              <Route path="/bookings/:id" element={<Install />} />
              <Route path="/cars" element={<Cars />} />
              <Route path="/speed" element={<SpeedPage />} />
              <Route path="/staff" element={role === 'admin' ? <Staff /> : <Navigate to="/" />} />
              <Route path="*" element={<Navigate to="/" />} />
            </Routes>
          </main>
        </div>
      </HashRouter>
    </DataCtx.Provider>
  );
}

function Nav({ to, icon, label, badge, end }: { to: string; icon: string; label: string; badge?: number; end?: boolean }) {
  return (
    <NavLink to={to} end={end} className={({ isActive }) => 'nav' + (isActive ? ' active' : '')}>
      <span className="nav-icon" aria-hidden><Glyph name={icon} /></span>
      <span>{label}</span>
      {badge ? <span className="badge">{badge}</span> : null}
    </NavLink>
  );
}

/** Line icons for the sidebar (24px grid, 1.8 stroke). */
const GLYPHS: Record<string, string> = {
  grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  chat: 'M4 5h16v11H9l-5 4z M8 9.5h8 M8 12.5h5',
  users: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z M2.5 20c.8-3.4 3.4-5 6.5-5s5.7 1.6 6.5 5 M16 4.3a3.5 3.5 0 0 1 0 6.4 M18 15.3c1.7.6 3 2 3.5 4.7',
  store: 'M4 9l1.5-5h13L20 9 M4 9h16v2a2.7 2.7 0 0 1-5.3 0 2.7 2.7 0 0 1-5.4 0A2.7 2.7 0 0 1 4 11z M5 13v7h14v-7 M10 20v-4h4v4',
  receipt: 'M6 3h12v18l-3-2-3 2-3-2-3 2z M9 8h6 M9 12h6 M9 16h3',
  shield: 'M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6z M9 12l2 2 4-4',
  card: 'M3 6h18v12H3z M3 10h18 M7 15h4',
  clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M12 7v5l3 2',
  megaphone: 'M3 10v4h3l7 5V5L6 10z M16 8.5a5 5 0 0 1 0 7 M18.5 6a8.5 8.5 0 0 1 0 12',
  wrench: 'M14.7 6.3a4 4 0 0 0-5.4 5.4L4 17v3h3l5.3-5.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z',
  car: 'M5 17h14M6 17l1.5-6h9L18 17M7 17v2M17 17v2M8 14h.01M16 14h.01',
  flag: 'M5 21V4 M5 4h11l-2 4 2 4H5',
  chart: 'M4 20V10 M10 20V4 M16 20v-7 M3 20h18',
};
export function Glyph({ name }: { name: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d={GLYPHS[name] ?? ''} />
    </svg>
  );
}

/* ---------------------------------------------------------------- shared bits */
export function Page({ title, sub, actions, children }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode; children: ReactNode }) {
  return (
    <div className="page">
      <header className="page-head">
        <div><h1>{title}</h1>{sub ? <p className="muted">{sub}</p> : null}</div>
        {actions ? <div className="actions">{actions}</div> : null}
      </header>
      {children}
    </div>
  );
}

export function Pill({ children, tone = 'plain' }: { children: ReactNode; tone?: 'plain' | 'good' | 'wait' | 'bad' | 'dark' }) {
  return <span className={'pill ' + tone}>{children}</span>;
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  const empty = children === null || children === undefined || children === '' || children === false;
  return <div className="field"><span>{label}</span><div>{empty ? '—' : children}</div></div>;
}

/** A confirmation box (replaces browser pop-ups): title, optional text, extra fields, and the action. */
export function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={title}>
        <header className="modal-head"><h2>{title}</h2><button className="link" onClick={onClose} aria-label="اقفل">✕</button></header>
        {children}
      </div>
    </div>
  );
}

/** Shown when a role can't do a step. */
export const notAllowed = (need: Role) => `الخطوة دي محتاجة صلاحية ${ROLE_NAME[need]}.`;

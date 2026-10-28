import type { Session } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { HashRouter, NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { ALL_TABLES, loadAll, supabase, useLive, type All, type Profile } from './lib';
import Customers from './pages/Customers';
import CustomerDetail from './pages/CustomerDetail';
import Dashboard from './pages/Dashboard';
import Login from './pages/Login';
import OrderDetail from './pages/OrderDetail';
import Orders from './pages/Orders';
import ShopDetail from './pages/ShopDetail';
import Shops from './pages/Shops';
import Staff from './pages/Staff';
import TicketDetail from './pages/TicketDetail';
import Tickets from './pages/Tickets';

type Ctx = { me: Profile; all: All; reload: () => void };
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
  useEffect(() => {
    supabase.from('profiles').select('*').eq('id', session.user.id).maybeSingle().then(({ data }) => setMe((data as Profile) ?? null));
  }, [session.user.id]);
  if (me === undefined) return <div className="center-screen"><span className="spinner" /></div>;
  if (!me || !(me.is_admin || me.is_support)) {
    return (
      <div className="center-screen">
        <div className="card narrow">
          <h1 className="logo">قطع<b>تك</b></h1>
          <h2>الحساب ده مش من فريق العمل</h2>
          <p className="muted">نظام الإدارة لفريق قطعتك بس. اطلب من الأدمن يضيف إيميلك ({session.user.email}) كموظف خدمة عملاء.</p>
          <button className="btn" onClick={() => supabase.auth.signOut()}>خروج</button>
        </div>
      </div>
    );
  }
  return <Shell me={me} />;
}

function Shell({ me }: { me: Profile }) {
  const { data, error, reload } = useLive(loadAll, ALL_TABLES);
  if (error) return <div className="center-screen"><p className="error">مشكلة في تحميل البيانات: {error}</p></div>;
  if (!data) return <div className="center-screen"><span className="spinner" /></div>;
  const openTickets = data.tickets.filter((t) => t.status === 'open').length;
  const pendingShops = Object.values(data.shops).filter((s) => s.status === 'pending').length;
  return (
    <DataCtx.Provider value={{ me, all: data, reload }}>
      <HashRouter>
        <div className="layout">
          <aside className="sidebar">
            <div className="brand"><span className="logo">قطع<b>تك</b></span><span className="tag">الإدارة</span></div>
            <nav>
              <Nav to="/" icon="grid" label="لوحة التحكم" end />
              <Nav to="/tickets" icon="chat" label="خدمة العملاء" badge={openTickets} />
              <Nav to="/customers" icon="users" label="العملاء" />
              <Nav to="/shops" icon="store" label="المحلات" badge={pendingShops} />
              <Nav to="/orders" icon="receipt" label="الطلبات" />
              {me.is_admin ? <Nav to="/staff" icon="shield" label="فريق العمل" /> : null}
            </nav>
            <div className="me">
              <div>
                <strong>{me.full_name || me.email}</strong>
                <span className="muted small">{me.is_admin ? 'أدمن' : 'خدمة عملاء'}</span>
              </div>
              <button className="link" onClick={() => supabase.auth.signOut()}>خروج</button>
            </div>
          </aside>
          <main className="main">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/tickets" element={<Tickets />} />
              <Route path="/tickets/:id" element={<TicketDetail />} />
              <Route path="/customers" element={<Customers />} />
              <Route path="/customers/:id" element={<CustomerDetail />} />
              <Route path="/shops" element={<Shops />} />
              <Route path="/shops/:id" element={<ShopDetail />} />
              <Route path="/orders" element={<Orders />} />
              <Route path="/orders/:id" element={<OrderDetail />} />
              <Route path="/staff" element={me.is_admin ? <Staff /> : <Navigate to="/" />} />
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

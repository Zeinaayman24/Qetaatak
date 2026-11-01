// Daghta management (C10): admins invite, change the role of, or remove a team member.
// The caller must be an admin signed in with two-step login (aal2). Every action is written to staff_log.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const MANAGE_URL = 'https://zeinaayman24.github.io/Qetaatak/manage/';
const ROLES = ['admin', 'support', 'review', 'finance'];
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer /, '');
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const { data: who } = await admin.auth.getUser(token);
  if (!who?.user) return json({ error: 'not allowed' }, 401);
  let aal = '';
  try { aal = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).aal ?? ''; } catch { /* bad token */ }
  const { data: me } = await admin.from('profiles').select('is_admin, staff_role').eq('id', who.user.id).maybeSingle();
  if (aal !== 'aal2' || !(me?.is_admin || me?.staff_role === 'admin')) return json({ error: 'not allowed' }, 403);
  const log = (action: string, id: string, after: unknown) =>
    admin.from('staff_log').insert({ staff_id: who.user.id, action, target_type: 'staff', target_id: id, after });

  const b = await req.json().catch(() => ({}));
  if (b.action === 'list') {
    const { data } = await admin.from('profiles').select('id, full_name, email, staff_role, is_admin').or('staff_role.not.is.null,is_admin.eq.true');
    const rows = await Promise.all((data ?? []).map(async (p) => {
      const u = await admin.auth.admin.getUserById(p.id);
      return { ...p, role: p.is_admin ? 'admin' : p.staff_role, last_sign_in_at: u.data.user?.last_sign_in_at ?? null, invited: !u.data.user?.last_sign_in_at };
    }));
    return json({ rows });
  }
  if (b.action === 'invite') {
    const email = String(b.email ?? '').trim().toLowerCase();
    const name = String(b.name ?? '').trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !name || !ROLES.includes(b.role)) return json({ error: 'bad input' }, 400);
    let id: string | undefined;
    const inv = await admin.auth.admin.inviteUserByEmail(email, { redirectTo: MANAGE_URL, data: { full_name: name } });
    if (inv.error) {
      // already has an account: give them the role
      const { data: p } = await admin.from('profiles').select('id').ilike('email', email).maybeSingle();
      if (!p) return json({ error: inv.error.message }, 400);
      id = p.id;
    } else id = inv.data.user?.id;
    if (!id) return json({ error: 'no user' }, 400);
    await admin.from('profiles').upsert({ id, email, full_name: name, staff_role: b.role, is_admin: b.role === 'admin', is_support: b.role !== 'admin' }, { onConflict: 'id' });
    await log('invite staff', id, { email, role: b.role });
    return json({ ok: true });
  }
  if (b.action === 'role' && ROLES.includes(b.role) && b.id && b.id !== who.user.id) {
    await admin.from('profiles').update({ staff_role: b.role, is_admin: b.role === 'admin', is_support: b.role !== 'admin' }).eq('id', b.id);
    await log('change staff role', b.id, { role: b.role });
    return json({ ok: true });
  }
  if (b.action === 'remove' && b.id && b.id !== who.user.id) {
    await admin.from('profiles').update({ staff_role: null, is_admin: false, is_support: false }).eq('id', b.id);
    await admin.rpc('end_sessions', { p_user: b.id });
    await log('remove staff', b.id, null);
    return json({ ok: true });
  }
  return json({ error: 'bad request' }, 400);
});

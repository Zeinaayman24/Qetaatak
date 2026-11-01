// Daghta (ضغطة) push sender: runs every minute from pg_cron, sends due rows of push_outbox as web push.
// Keys: VAPID public key below (also in the app); private key in Vault ('vapid_private_key'). Auth: x-cron-secret checked against Vault.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const { data: ok } = await db.rpc('push_secret_ok', { p_secret: req.headers.get('x-cron-secret') ?? '' });
  if (ok !== true) return json({ error: 'not allowed' }, 401);

  const pub = 'BJNvEh_FMarZzG81wKnlxPPHGd3UPAO_QV_ZvLznWBCkPWtYRXFOx0y06AJOL6C9zSozNFo7H0bTwr9c5S1eX_Y';
  const { data: priv } = await db.rpc('push_vapid_private');
  if (!priv) return json({ configured: false });
  webpush.setVapidDetails('mailto:support@daghta.app', pub, priv);

  const { data: due, error } = await db.from('push_outbox').select('*').is('sent_at', null)
    .lte('send_after', new Date().toISOString()).lt('attempts', 5).order('id').limit(200);
  if (error) return json({ error: error.message }, 500);
  if (!due?.length) return json({ sent: 0 });

  const users = [...new Set(due.map((d) => d.user_id))];
  const { data: subs } = await db.from('push_subscriptions').select('*').in('user_id', users);
  let sent = 0;
  for (const d of due) {
    const mine = (subs ?? []).filter((s) => s.user_id === d.user_id);
    const payload = JSON.stringify({ title: d.title, body: d.body, link: d.link, tag: d.link || undefined });
    let delivered = mine.length === 0; // nobody to send to: mark done
    for (const s of mine) {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 86400, urgency: 'high' });
        delivered = true; sent++;
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) await db.from('push_subscriptions').delete().eq('id', s.id); // phone unsubscribed
      }
    }
    await db.from('push_outbox').update(delivered ? { sent_at: new Date().toISOString() } : { attempts: d.attempts + 1 }).eq('id', d.id);
  }
  return json({ sent });
});

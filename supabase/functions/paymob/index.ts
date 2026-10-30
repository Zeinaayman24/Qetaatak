// Daghta (ضغطة) card payments through Paymob (Egypt).
//
// Three entry points on one URL:
//   POST {mode:"ping"}                      -> {configured}            (is card payment switched on?)
//   POST {mode:"create", order} + user JWT  -> {url}                   (Paymob unified checkout for that order)
//   POST ?hmac=...  (Paymob webhook)        -> marks the order paid / failed after checking the HMAC
//
// Switched off until these secrets are set (Supabase > Edge Functions > Secrets):
//   PAYMOB_SECRET_KEY, PAYMOB_PUBLIC_KEY, PAYMOB_HMAC, PAYMOB_INTEGRATION_IDS (comma-separated card integration ids)
// Optional: APP_URL (where the customer lands after paying).
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const env = (k: string) => Deno.env.get(k) ?? '';
const SECRET = env('PAYMOB_SECRET_KEY');
const PUBLIC = env('PAYMOB_PUBLIC_KEY');
const HMAC = env('PAYMOB_HMAC');
const INTEGRATIONS = env('PAYMOB_INTEGRATION_IDS').split(',').map((s) => Number(s.trim())).filter(Boolean);
const APP_URL = env('APP_URL') || 'https://zeinaayman24.github.io/Qetaatak';
const configured = !!(SECRET && PUBLIC && HMAC && INTEGRATIONS.length);

const admin = () => createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });

// Paymob's transaction-processed callback: these 20 values, in this order, HMAC-SHA512 with the account's HMAC secret.
const HMAC_FIELDS = [
  'amount_cents', 'created_at', 'currency', 'error_occured', 'has_parent_transaction', 'id', 'integration_id', 'is_3d_secure',
  'is_auth', 'is_capture', 'is_refunded', 'is_standalone_payment', 'is_voided', 'order.id', 'owner', 'pending',
  'source_data.pan', 'source_data.sub_type', 'source_data.type', 'success',
];
const pick = (o: Record<string, unknown>, path: string) =>
  path.split('.').reduce<unknown>((v, k) => (v && typeof v === 'object' ? (v as Record<string, unknown>)[k] : undefined), o);

async function hmacHex(text: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(HMAC), { name: 'HMAC', hash: 'SHA-512' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(text));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
function sameText(a: string, b: string) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

async function webhook(req: Request, given: string) {
  if (!configured) return json({ ok: false }, 503);
  const body = await req.json().catch(() => null) as { type?: string; obj?: Record<string, unknown> } | null;
  const obj = body?.obj;
  if (!obj || body?.type !== 'TRANSACTION') return json({ ok: true }); // other callback types are ignored
  const text = HMAC_FIELDS.map((f) => { const v = pick(obj, f); return v === undefined || v === null ? '' : String(v); }).join('');
  if (!sameText(await hmacHex(text), given.toLowerCase())) return json({ ok: false, error: 'bad hmac' }, 401);

  // special_reference comes back as the Paymob order's merchant_order_id: "<our order uuid>.<attempt>"
  const ref = String(pick(obj, 'order.merchant_order_id') ?? '');
  const orderId = ref.split('.')[0];
  if (!/^[0-9a-f-]{36}$/i.test(orderId)) return json({ ok: true });
  if (obj.pending === true) return json({ ok: true });
  const ok = obj.success === true && obj.is_voided !== true && obj.is_refunded !== true;
  const { error } = await admin().rpc('card_payment_result', {
    p_order: orderId, p_ok: ok, p_ref: String(obj.id ?? ''), p_amount_cents: Number(obj.amount_cents ?? 0),
  });
  if (error) return json({ ok: false, error: error.message }, 500);
  return json({ ok: true });
}

async function create(req: Request, orderId: string) {
  if (!configured) return json({ configured: false });
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const db = admin();
  const { data: who } = await db.auth.getUser(token);
  const user = who?.user;
  if (!user) return json({ error: 'not signed in' }, 401);

  const { data: o } = await db.from('orders').select('*').eq('id', orderId).maybeSingle();
  if (!o || o.customer_id !== user.id) return json({ error: 'not allowed' }, 403);
  if (o.payment_method !== 'card' || !['awaiting', 'failed'].includes(o.payment_status) || o.status === 'cancelled') {
    return json({ error: 'nothing to pay' }, 409);
  }
  const { data: p } = await db.from('profiles').select('*').eq('id', user.id).maybeSingle();
  const cents = Math.round((Number(o.items_total) + Number(o.delivery_fee)) * 100);
  const [first, ...rest] = String(p?.full_name || 'عميل').trim().split(/\s+/);
  const na = (v: unknown) => (v ? String(v) : 'NA');

  const res = await fetch('https://accept.paymob.com/v1/intention/', {
    method: 'POST',
    headers: { Authorization: `Token ${SECRET}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      amount: cents,
      currency: 'EGP',
      payment_methods: INTEGRATIONS,
      items: [{ name: `Daghta order #${o.order_no}`, amount: cents, description: 'Car parts', quantity: 1 }],
      billing_data: {
        first_name: first || 'Customer', last_name: rest.join(' ') || 'Daghta', email: user.email || 'customer@daghta.app',
        phone_number: na(p?.phone), street: na(p?.street), building: na(p?.building), floor: na(p?.floor), apartment: na(p?.apartment),
        city: na(p?.governorate), state: na(p?.area), country: 'EG', postal_code: na(p?.postal_code),
      },
      special_reference: `${o.id}.${Date.now()}`,
      notification_url: `${env('SUPABASE_URL')}/functions/v1/paymob`,
      redirection_url: `${APP_URL}/order/${o.id}?paid=1`,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.client_secret) return json({ error: 'paymob_unavailable', status: res.status }, 502);
  return json({ url: `https://accept.paymob.com/unifiedcheckout/?publicKey=${encodeURIComponent(PUBLIC)}&clientSecret=${encodeURIComponent(data.client_secret)}` });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  const hmac = new URL(req.url).searchParams.get('hmac');
  if (hmac) return webhook(req, hmac);
  const input = await req.json().catch(() => ({})) as { mode?: string; order?: string };
  if (input.mode === 'ping') return json({ configured });
  if (input.mode === 'create' && input.order) return create(req, input.order);
  return json({ error: 'bad request' }, 400);
});

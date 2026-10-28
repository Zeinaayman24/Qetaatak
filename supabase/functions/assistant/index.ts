// Qetaatak assistant: turns a customer's free-text chat into a draft part request or complaint.
// It only drafts; the app shows the draft and the customer confirms before anything is created.
// Switched off until the ANTHROPIC_API_KEY secret is set in Supabase (Edge Functions > Secrets).
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

const MODEL = Deno.env.get('ASSISTANT_MODEL') ?? 'claude-haiku-5-5';
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const SYSTEM = `You are "مساعد قطعتك", the assistant inside Qetaatak, an Egyptian app where car owners request spare parts and shops send quotes.
Talk in short, friendly Egyptian Arabic. One question at a time. Never invent prices, shops or stock.
Your job is to fill ONE draft, either a part request or a complaint, then ask the customer to confirm.

Part request fields: part (Arabic part name), car_index (index in the customer's cars list), side ('' | right | left | front | rear),
condition (used | new | any), urgency (normal | today | urgent), budget (number of EGP or null), notes (short text, colour, gearbox…).
Complaint fields: category (order | shop | app | other), request_num (number from recent requests or null), complaint_text.

Ask only for what is missing and matters: for a request you need part, car and condition; ask side only for parts that have sides
(lights, mirrors, doors, fenders, bumpers…), and urgency briefly. For a complaint you need category and complaint_text.
Set ready=true only when the needed fields are filled; the app then shows a summary card with a send button.
If the customer asks something unrelated, answer briefly and steer back.

Reply with ONLY a JSON object, no other text:
{"reply": "...", "quick_replies": ["up to 4 short Arabic button labels"], "draft": {"intent": "request" | "complaint" | null, ...fields}, "ready": true | false}`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const key = Deno.env.get('ANTHROPIC_API_KEY');
  if (!key) return json({ configured: false });

  let input: { ping?: boolean; messages?: { role: 'user' | 'assistant'; content: string }[]; context?: unknown };
  try { input = await req.json(); } catch { return json({ error: 'bad json' }, 400); }
  if (input.ping) return json({ configured: true });
  const messages = (input.messages ?? []).filter((m) => m && typeof m.content === 'string' && m.content.trim()).slice(-20);
  if (!messages.length || messages[messages.length - 1].role !== 'user') return json({ error: 'last message must be from the user' }, 400);

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 600,
      system: SYSTEM + '\n\nCustomer context (JSON): ' + JSON.stringify(input.context ?? {}),
      messages: messages.map((m) => ({ role: m.role, content: m.content.slice(0, 2000) })),
    }),
  });
  if (!res.ok) return json({ configured: true, error: 'ai_unavailable', status: res.status }, 502);
  const data = await res.json();
  const text: string = (data.content ?? []).filter((c: { type: string }) => c.type === 'text').map((c: { text: string }) => c.text).join('');
  const match = text.match(/\{[\s\S]*\}/);
  try {
    const out = JSON.parse(match ? match[0] : text);
    return json({ configured: true, reply: String(out.reply ?? ''), quick_replies: Array.isArray(out.quick_replies) ? out.quick_replies.slice(0, 4) : [], draft: out.draft ?? null, ready: !!out.ready });
  } catch {
    return json({ configured: true, reply: text.slice(0, 600), quick_replies: [], draft: null, ready: false });
  }
});

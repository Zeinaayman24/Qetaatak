# قطعتك — Qetaatak

A marketplace for car spare parts in Cairo. Car owners send a part request with a photo; approved shops and scrapyards reply with a price, condition and warranty; the owner picks one and gets it delivered or picks it up.

One codebase runs as the **website** today and becomes the **iOS and Android apps** later (Expo + React Native).

## How it's built

| Part | Tool |
| --- | --- |
| App (web, iOS, Android) | Expo SDK 58, Expo Router, React Native |
| Database, logins, photos, live updates | Supabase |
| Website hosting | GitHub Pages (deployed by `.github/workflows/deploy-web.yml` on every push to `main`) |

## Project layout

```
src/app/            screens (each file is a route)
  login.tsx           sign up / sign in
  welcome.tsx         choose customer or shop
  profile.tsx         customer details and car
  shop-setup.tsx      register or edit a shop
  customer/           customer home, new request, request detail
  shop/               shop inbox, request detail with quote form
  admin.tsx           approve shops, see all requests and stats
src/components/     shared UI (Arabic, right to left)
src/lib/            Supabase client, auth, live data, photos, constants
supabase/migrations database schema and security rules
```

## Features

- One role per account: customer **or** shop (enforced in the database)
- Customers: several cars with chassis number (VIN), part side, urgency and budget on requests
- Chat between a customer and each shop on a request, with photos
- In-app notifications (new quote, new request in your brands, approval, messages, order updates, ratings, support replies)
- Order tracking updated by the shop: preparing → ready / out for delivery → delivered
- Shop public pages with rating, sales and written reviews; favorite shops; "request again"
- Shop inbox search and filters (my brands, area, condition, urgent first)
- Support and complaints, answered from the admin page

## Management system (`manage/`)

A separate desktop web app for the Qetaatak team, served at `/Qetaatak/manage/` and using the same Supabase project.

- **Customers** with unique IDs (`C-10001`), full details, cars, orders and complaints; admins can block
- **Shops** with unique IDs (`S-10002`), full details, sales, ratings; admins approve, suspend or block
- **Orders** with quotes, the chosen shop, tracking and chat history
- **Customer service**: every complaint from the app is a ticket (`T-1001`) with priority, assignee,
  status and a two-way conversation; internal notes stay hidden from the customer
- **Staff**: admins add customer service employees by email (they handle tickets but can't approve shops or block)

```bash
cd manage && npm install && npm run dev   # local
npm run build                             # production build in manage/dist
```

## Security model (Supabase row level security)

- Customers see only their own requests and the quotes on them.
- Shops must be **approved by an admin** before they can see requests or send quotes.
- A shop sees only its own quotes, never other shops' prices.
- Shop name and phone are revealed to a customer only after they choose that shop's quote; the customer's phone is revealed only to the chosen shop.
- Customers change request status only through database functions (`choose_quote`, `mark_received`, `rate_request`, `cancel_request`).
- Nobody can make themselves admin or approve their own shop.

## Run it locally

```bash
npm install
npx expo start          # press w for web, or scan the QR code with Expo Go
npx tsc --noEmit        # typecheck
npx expo export -p web  # production web build in dist/
```

## Make someone an admin

In the Supabase SQL editor:

```sql
update public.profiles set is_admin = true
where id = (select id from auth.users where email = 'you@example.com');
```

## Moving to the paid Supabase project later

1. Create the new project.
2. Run the files in `supabase/migrations/` in order in its SQL editor.
3. Change `SUPABASE_URL` and `SUPABASE_KEY` in `src/lib/supabase.ts`.

## Chat assistant (`/assistant`)
Customers make part requests and complaints by chatting with «مساعد قطعتك».
- **Free mode (default):** tap-to-answer buttons plus on-device understanding of simple Arabic (`src/lib/assistant.ts`). It always shows a summary and the customer confirms before a request or ticket is created.
- **Smart AI mode:** the `assistant` Supabase Edge Function (`supabase/functions/assistant`) is deployed but switched off. To turn it on, add the secret `ANTHROPIC_API_KEY` in Supabase → Edge Functions → Secrets (optional `ASSISTANT_MODEL`, default `claude-haiku-5-5`). The app detects it automatically; no new build needed.

### Complaints: assistant first, then a person, in one chat
Each complaint is one conversation (`reports` + `ticket_messages`).
1. The assistant opens the case (status `bot`), saves the chat so far, and tries to solve it (order status, warranty, app tips).
2. If it can't, or the customer asks for a person, it calls `escalate_ticket` → status `open`, and staff are notified.
3. An agent clicks **استلم المحادثة** in the management site (`take_ticket`) → status `in_progress`. The customer sees the agent join and keeps writing in the same chat.
4. The agent ends it with **إنهاء المحادثة** (`close_ticket`) → status `resolved`, and the customer's chat closes. The customer can also mark it solved (`customer_resolve_ticket`).

## Several parts in one request
A request can hold several parts (a basket). Each part is its own row in `requests` (own quotes, chosen shop, tracking, rating and commission); parts sent together share `batch_id`. Shops quote the parts they have; the customer picks the best offer per part, or takes "everything from one shop" when a shop quoted all of them, and confirms all choices at once with `choose_quotes`. Shops get one alert per batch.

## Price requests and orders
- A **price request** (`requests`, one row per part) collects offers. Shops quote per part or say a part isn't available (`declines.reason`); customers see counts and reasons via `decline_counts`.
- Accepting offers (`accept_offers`) creates one **order** per shop (`orders`, numbered from 5001) holding the parts bought from it; parts still waiting stay in the price request.
- Orders move `preparing → ready | out_for_delivery → delivered` (shop, `set_order_status`) `→ received` (customer, `receive_order`), then `rate_order`. The customer can `cancel_order` while it's still being prepared; the parts return to choosing offers.
- **Contact details stay in the app:** before a deal, phone numbers, emails, links and social handles are replaced with ••• in chat messages and request text by database triggers (`private.mask_contacts`), and such messages are marked `flagged` for staff.

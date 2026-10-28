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

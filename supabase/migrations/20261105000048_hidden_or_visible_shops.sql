-- Shops are hidden or visible (change 1.35).
--
-- Free shops are HIDDEN: until a customer pays the pickup deposit (or places a delivery order), the customer sees
-- «محل ١٠٠٤٥ · مدينة نصر» instead of the name, no storefront photo, and no phone, address or map location.
-- A shop can SUBSCRIBE to be VISIBLE (public_until, set by the team after payment): its name, photo and contact
-- show on every offer, and its pickup orders need no deposit (normal commission rules apply).
-- Also closes a leak: shops.lat/lng (exact location), photo_path and internal notes were readable by any signed-in user.

alter table public.shops add column if not exists public_until timestamptz;
insert into public.app_settings (key, value) values ('visible_price', '1000') on conflict (key) do nothing;

create or replace function private.shop_visible(p_shop uuid) returns boolean
language sql stable security definer set search_path = ''
as $$ select coalesce((select public_until > now() from public.shops where id = p_shop), false) $$;

-- may the signed-in person see who this shop is?
create or replace function private.can_see_shop(p_shop uuid) returns boolean
language sql stable security definer set search_path = ''
as $$ select p_shop = auth.uid() or private.is_staff() or private.shop_visible(p_shop) or private.chose_shop(p_shop) $$;

-- what a customer calls a hidden shop: its member number and area
create or replace function private.shop_alias(p_shop uuid) returns text
language sql stable security definer set search_path = ''
as $$
  select 'محل ' || coalesce((select member_no::text from public.profiles where id = p_shop), '') || ' · ' || coalesce((select area from public.shops where id = p_shop), '')
$$;

create or replace function private.shop_label(p_shop uuid) returns text
language sql stable security definer set search_path = ''
as $$
  select case when private.can_see_shop(p_shop)
              then coalesce(nullif((select name from public.shop_private where id = p_shop), ''), private.shop_alias(p_shop))
              else private.shop_alias(p_shop) end
$$;

-- the contact row: also readable when the shop is visible
drop policy if exists shop_private_select on public.shop_private;
create policy shop_private_select on public.shop_private for select to authenticated
  using (id = (select auth.uid()) or private.is_staff() or private.chose_shop(id) or private.shop_visible(id));

-- ---------------------------------------------------------------- what customers get about shops
drop function public.shop_cards(uuid[]);
create function public.shop_cards(p_shops uuid[])
returns table (id uuid, name text, area text, rating numeric, ratings bigint, sales bigint, reply_min integer, photo_path text, visible boolean)
language sql stable security definer set search_path = ''
as $function$
  select s.id, private.shop_label(s.id), s.area,
    (select round(avg(o.rating)::numeric, 1) from public.orders o where o.shop_id = s.id and o.rating is not null),
    (select count(o.rating) from public.orders o where o.shop_id = s.id),
    (select count(*) from public.orders o where o.shop_id = s.id and o.status = 'received'),
    private.reply_minutes(s.id),
    case when private.can_see_shop(s.id) then s.photo_path end,
    private.shop_visible(s.id)
  from public.shops s
  where s.id = any (p_shops) and s.status = 'approved'
$function$;
revoke execute on function public.shop_cards(uuid[]) from public, anon;
grant execute on function public.shop_cards(uuid[]) to authenticated;

create or replace function public.shop_profile(p_shop uuid)
returns json language sql stable security definer set search_path = ''
as $function$
  select json_build_object(
    'shop', (select json_build_object('id', s.id, 'name', private.shop_label(s.id), 'area', s.area, 'governorate', s.governorate,
              'shop_type', s.shop_type, 'specialties', s.specialties, 'brands', s.brands, 'offers_delivery', s.offers_delivery, 'since', s.created_at,
              'reply_min', private.reply_minutes(s.id), 'photo_path', case when private.can_see_shop(s.id) then s.photo_path end,
              'visible', private.shop_visible(s.id))
             from public.shops s where s.id = p_shop and s.status = 'approved'),
    'sales', (select count(*) from public.requests r join public.quotes q on q.id = r.chosen_quote_id where q.shop_id = p_shop and r.status in ('chosen', 'done')),
    'rating', (select round(avg(r.rating)::numeric, 1) from public.requests r join public.quotes q on q.id = r.chosen_quote_id where q.shop_id = p_shop and r.rating is not null),
    'ratings', (select count(r.rating) from public.requests r join public.quotes q on q.id = r.chosen_quote_id where q.shop_id = p_shop),
    'reviews', coalesce((select json_agg(x order by x.at desc) from (
        select r.rating, r.review, r.part, r.done_at as at, split_part(p.full_name, ' ', 1) as first_name
        from public.requests r join public.quotes q on q.id = r.chosen_quote_id join public.profiles p on p.id = r.customer_id
        where q.shop_id = p_shop and r.rating is not null order by r.done_at desc limit 20) x), '[]'::json)
  )
$function$;

create or replace function public.my_inbox() returns table (
  request_id uuid, shop_id uuid, num bigint, part text, me_is_shop boolean, other_name text,
  last_body text, last_photo boolean, last_mine boolean, last_at timestamptz, unread bigint, ordered boolean
)
language sql stable security definer set search_path = ''
as $$
  with threads as (
    select m.request_id, m.shop_id from public.messages m
      join public.requests r on r.id = m.request_id
     where r.customer_id = auth.uid() or m.shop_id = auth.uid()
     group by m.request_id, m.shop_id
  )
  select t.request_id, t.shop_id, r.num, r.part, (t.shop_id = auth.uid()) as me_is_shop,
    case when t.shop_id = auth.uid() then
           case when exists (select 1 from public.orders o where o.id = r.order_id and o.shop_id = t.shop_id)
                then coalesce(nullif(split_part(cp.full_name, ' ', 1), ''), 'العميل') else 'عميل في ' || coalesce(r.area, '—') end
         else private.shop_label(t.shop_id) end,
    lm.body, lm.photo_path is not null, lm.sender_id = auth.uid(), lm.created_at,
    (select count(*) from public.messages x
      where x.request_id = t.request_id and x.shop_id = t.shop_id and x.sender_id <> auth.uid()
        and x.created_at > coalesce((select cr.read_at from public.chat_reads cr where cr.user_id = auth.uid() and cr.request_id = t.request_id and cr.shop_id = t.shop_id), '-infinity')),
    r.order_id is not null
  from threads t
  join public.requests r on r.id = t.request_id
  left join public.profiles cp on cp.id = r.customer_id
  cross join lateral (
    select m.body, m.photo_path, m.sender_id, m.created_at from public.messages m
     where m.request_id = t.request_id and m.shop_id = t.shop_id order by m.created_at desc limit 1
  ) lm
  order by lm.created_at desc
$$;

-- ---------------------------------------------------------------- the shops table: sensitive columns only through functions
-- (the column lock itself is in the next migration, applied once the apps read shops through these functions)

-- the shop's own full row (its settings screen) and the team's full list
create or replace function public.my_shop() returns setof public.shops
language sql stable security definer set search_path = ''
as $$ select * from public.shops where id = auth.uid() $$;
create or replace function public.staff_shops() returns setof public.shops
language plpgsql stable security definer set search_path = ''
as $$ begin
  if not private.is_staff() then raise exception 'not allowed'; end if;
  return query select * from public.shops order by created_at desc;
end $$;
revoke execute on function public.my_shop(), public.staff_shops() from public, anon;
grant execute on function public.my_shop(), public.staff_shops() to authenticated;

-- shops can't change their own visibility
create or replace function private.guard_shop_public() returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.public_until is distinct from old.public_until and not private.is_staff() then new.public_until := old.public_until; end if;
  return new;
end $$;
drop trigger if exists shops_public_guard on public.shops;
create trigger shops_public_guard before update on public.shops for each row execute function private.guard_shop_public();

-- the team makes a shop visible for N days after it pays (0 = hide now)
create or replace function public.set_shop_public(p_shop uuid, p_days int, p_note text) returns timestamptz
language plpgsql security definer set search_path = ''
as $$
declare until timestamptz;
begin
  if not private.has_role('finance') then raise exception 'not allowed'; end if;
  update public.shops
     set public_until = case when p_days > 0 then greatest(coalesce(public_until, now()), now()) + make_interval(days => p_days) end
   where id = p_shop returning public_until into until;
  perform private.notify(p_shop,
    case when until is not null then 'محلك ظاهر للعملاء' else 'محلك رجع مخفي' end,
    case when until is not null then 'اسمك ورقمك وصورتك بيظهروا على كل عروضك لحد ' || to_char(until at time zone 'Africa/Cairo', 'DD/MM') || '.'
         else 'العملاء بيشوفوا اسمك ورقمك بعد ما يدفعوا العربون.' end, '/shop/balance');
  insert into public.staff_log (staff_id, action, target_type, target_id, after, reason)
  values (auth.uid(), 'shop visibility', 'shop', p_shop::text, jsonb_build_object('days', p_days, 'until', until), coalesce(p_note, ''));
  return until;
end $$;
revoke execute on function public.set_shop_public(uuid, int, text) from public, anon;
grant execute on function public.set_shop_public(uuid, int, text) to authenticated;

-- ---------------------------------------------------------------- deposits: not for visible shops
create or replace function public.place_order(p_choices jsonb, p_payment text, p_address jsonb default null) returns jsonb
language plpgsql security definer set search_path = ''
as $function$
declare made jsonb; need_addr boolean; dep boolean := private.deposits_on(); all_pickup boolean;
begin
  if auth.uid() is null then raise exception 'not allowed'; end if;
  if p_payment not in ('cash', 'shop', 'instapay', 'card') then raise exception 'bad payment method'; end if;
  all_pickup := not exists (select 1 from jsonb_to_recordset(p_choices) as x(request uuid, quote uuid, mode text) where x.mode is distinct from 'pickup');
  -- with deposits on, pickup orders pay the rest at the shop, so the payment choice is only for delivery
  if dep and all_pickup then p_payment := 'shop'; end if;
  if p_payment = 'shop' and not all_pickup then raise exception 'pay at shop needs pickup'; end if;
  if p_payment = 'instapay' and exists (
    select 1 from jsonb_to_recordset(p_choices) as x(request uuid, quote uuid, mode text)
      join public.quotes q on q.id = x.quote
      join public.shop_private sp on sp.id = q.shop_id
     where sp.instapay_address = '' and sp.wallet_number = '' and (not dep or x.mode = 'delivery')
  ) then raise exception 'shop has no transfer details'; end if;
  need_addr := exists (select 1 from jsonb_to_recordset(p_choices) as x(request uuid, quote uuid, mode text) where x.mode = 'delivery');
  if need_addr and (p_address is null
      or coalesce(p_address->>'governorate', '') = '' or coalesce(p_address->>'area', '') = '' or coalesce(p_address->>'street', '') = ''
      or coalesce(p_address->>'building', '') = '' or coalesce(p_address->>'floor', '') = '' or coalesce(p_address->>'apartment', '') = '') then
    raise exception 'address needed';
  end if;
  made := public.accept_offers(p_choices);
  update public.orders o
     set payment_method = case when dep and o.delivery_mode = 'pickup' then 'shop' else p_payment end,
         payment_status = case when dep and o.delivery_mode = 'pickup' then 'unpaid' when p_payment in ('instapay', 'card') then 'awaiting' else 'unpaid' end,
         deposit = case when dep and o.delivery_mode = 'pickup' and not private.shop_visible(o.shop_id) then public.deposit_for(o.items_total) else 0 end,
         deposit_status = case when dep and o.delivery_mode = 'pickup' and not private.shop_visible(o.shop_id) then 'awaiting' else 'none' end,
         delivery_address = case when o.delivery_mode = 'delivery' then jsonb_build_object(
           'governorate', p_address->>'governorate', 'area', p_address->>'area', 'street', p_address->>'street',
           'building', p_address->>'building', 'floor', p_address->>'floor', 'apartment', p_address->>'apartment',
           'landmark', coalesce(p_address->>'landmark', ''), 'contact_phone', coalesce(p_address->>'contact_phone', '')) end
   where o.id in (select (jsonb_array_elements_text(made))::uuid);
  return made;
end $function$;
revoke execute on function public.place_order(jsonb, text, jsonb) from public, anon;
grant execute on function public.place_order(jsonb, text, jsonb) to authenticated;

-- the team sets the monthly visibility price shown to shops
create or replace function public.set_setting(p_key text, p_value text) returns void
language plpgsql security definer set search_path = ''
as $function$
declare old text;
begin
  if not private.is_admin() then raise exception 'not allowed'; end if;
  if p_key not in ('instapay_address', 'wallet_number', 'account_name', 'bank_account', 'payment_note', 'commission_pct', 'owed_limit', 'free_months', 'statement_day', 'pay_days',
                   'deposits', 'deposit_flat', 'deposit_threshold', 'deposit_pct', 'deposit_cap', 'deposit_hold_hours', 'deposit_pay_hours', 'deposit_shop_share', 'visible_price')
    then raise exception 'unknown setting'; end if;
  if p_key in ('commission_pct', 'owed_limit', 'free_months', 'statement_day', 'pay_days',
               'deposit_flat', 'deposit_threshold', 'deposit_pct', 'deposit_cap', 'deposit_hold_hours', 'deposit_pay_hours', 'deposit_shop_share', 'visible_price')
     and (p_value !~ '^[0-9]+(\.[0-9]+)?$') then raise exception 'bad number'; end if;
  if p_key = 'deposits' and p_value not in ('on', 'off') then raise exception 'bad mode'; end if;
  if p_key in ('deposit_hold_hours', 'deposit_pay_hours') and p_value::numeric < 1 then raise exception 'bad number'; end if;
  if p_key in ('deposit_pct', 'deposit_shop_share') and p_value::numeric > 100 then raise exception 'bad number'; end if;
  -- deposits can't go on until customers can pay them and be refunded: Daghta's InstaPay or wallet must be set
  if p_key = 'deposits' and p_value = 'on'
     and coalesce((select value from public.app_settings where key = 'instapay_address'), '') = ''
     and coalesce((select value from public.app_settings where key = 'wallet_number'), '') = ''
    then raise exception 'no way to pay deposits'; end if;
  select value into old from public.app_settings where key = p_key;
  if old is not distinct from coalesce(p_value, '') then return; end if;
  if p_key = 'commission_pct' then
    -- a new % starts 14 days after shops are told
    insert into public.commission_rates (starts_at, pct, created_by) values (now() + interval '14 days', p_value::numeric, auth.uid());
    insert into public.notifications (user_id, title, body, link)
    select id, 'نسبة العمولة هتتغيّر', 'من ' || to_char((now() + interval '14 days') at time zone 'Africa/Cairo', 'DD/MM') || ' العمولة هتبقى ' || p_value || '٪ من سعر القطع.', '/shop/balance'
      from public.shops where status in ('approved', 'suspended');
  end if;
  insert into public.app_settings (key, value, updated_at) values (p_key, coalesce(p_value, ''), now())
  on conflict (key) do update set value = excluded.value, updated_at = now();
  perform private.log_action('setting changed', 'app_settings', p_key, to_jsonb(old), to_jsonb(p_value), '');
end $function$;

-- 1) Delivery decided per offer, priced by distance.
--    Each shop sets three fees: same area, same governorate, another governorate (empty = doesn't deliver that far).
--    Each offer says whether THIS part can be delivered (big parts often can't) and can override the fee.
--    One delivery per shop order: the order's fee is the highest fee among its parts.
-- 2) Receipt code: every order gets a 4-digit code only the customer sees; the shop types it at handover
--    to close the order as received (the customer can still confirm by themselves).

-- ---------------------------------------------------------------- 1) delivery
alter table public.shops
  add column if not exists fee_area numeric(10, 2),
  add column if not exists fee_city numeric(10, 2),
  add column if not exists fee_far  numeric(10, 2);
alter table public.shops add constraint shops_fees_chk check (
  coalesce(fee_area, 0) >= 0 and coalesce(fee_city, 0) >= 0 and coalesce(fee_far, 0) >= 0
  and coalesce(fee_area, 0) < 10000 and coalesce(fee_city, 0) < 10000 and coalesce(fee_far, 0) < 10000);
-- shops that already deliver keep a sensible default until they set their own
update public.shops set fee_area = 50, fee_city = 80 where offers_delivery and fee_area is null and fee_city is null;

alter table public.quotes
  add column if not exists can_deliver  boolean not null default true,
  add column if not exists delivery_fee numeric(10, 2);
alter table public.quotes add constraint quotes_delivery_fee_chk check (delivery_fee is null or (delivery_fee >= 0 and delivery_fee < 10000));

-- the delivery fee for one offer to one customer's address, or null when it can't be delivered
create or replace function private.offer_delivery_fee(p_quote uuid, p_customer uuid) returns numeric
language sql stable security definer set search_path = ''
as $$
  select case
    when not q.can_deliver or not s.offers_delivery then null
    when q.delivery_fee is not null then q.delivery_fee
    when lower(trim(coalesce(p.area, ''))) <> '' and lower(trim(p.area)) = lower(trim(s.area)) and p.governorate = s.governorate then s.fee_area
    when p.governorate = s.governorate then s.fee_city
    else s.fee_far end
  from public.quotes q
  join public.shops s on s.id = q.shop_id
  left join public.profiles p on p.id = p_customer
  where q.id = p_quote
$$;

-- for the checkout: per offer, can it be delivered to me and for how much
create or replace function public.delivery_options(p_quotes uuid[]) returns table (quote_id uuid, fee numeric)
language sql stable security definer set search_path = ''
as $$
  select q.id, private.offer_delivery_fee(q.id, auth.uid())
    from public.quotes q
    join public.requests r on r.id = q.request_id
   where q.id = any (p_quotes) and r.customer_id = auth.uid()
$$;

create or replace function public.accept_offers(p_choices jsonb) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare uid uuid := auth.uid(); c record; s record; oid uuid; made uuid[] := '{}'; ono bigint; fee numeric;
begin
  if uid is null then raise exception 'not allowed'; end if;
  if jsonb_typeof(p_choices) <> 'array' or jsonb_array_length(p_choices) = 0 then raise exception 'nothing chosen'; end if;
  for c in select * from jsonb_to_recordset(p_choices) as x(request uuid, quote uuid, mode text) loop
    perform 1 from public.requests r join public.quotes q on q.request_id = r.id
     where r.id = c.request and q.id = c.quote and r.customer_id = uid and r.status = 'open';
    if not found then raise exception 'cannot choose this quote'; end if;
  end loop;
  for s in
    select q.shop_id as shop, max(x.mode) as mode, sum(q.price * coalesce(r.qty, 1)) as total,
           bool_and(private.offer_delivery_fee(q.id, uid) is not null) as deliverable,
           max(private.offer_delivery_fee(q.id, uid)) as fee
      from jsonb_to_recordset(p_choices) as x(request uuid, quote uuid, mode text)
      join public.requests r on r.id = x.request
      join public.quotes q on q.id = x.quote and q.request_id = r.id
     group by q.shop_id
  loop
    if s.mode not in ('delivery', 'pickup') then raise exception 'bad mode'; end if;
    if s.mode = 'delivery' and not s.deliverable then raise exception 'shop does not deliver'; end if;
    fee := case when s.mode = 'delivery' then coalesce(s.fee, 0) else 0 end;
    insert into public.orders (customer_id, shop_id, delivery_mode, items_total, delivery_fee)
    values (uid, s.shop, s.mode, s.total, fee)
    returning id, order_no into oid, ono;
    update public.requests r
       set status = 'chosen', chosen_quote_id = x.quote, delivery_mode = s.mode, chosen_at = now(), order_status = 'preparing', order_id = oid
      from jsonb_to_recordset(p_choices) as x(request uuid, quote uuid, mode text)
      join public.quotes q on q.id = x.quote
     where r.id = x.request and q.request_id = r.id and q.shop_id = s.shop;
    perform private.notify(s.shop, 'أوردر جديد #' || ono || ' 🎉', coalesce(private.order_parts(oid), ''), '/shop/order/' || oid);
    made := made || oid;
  end loop;
  return to_jsonb(made);
end $$;

-- ---------------------------------------------------------------- 2) receipt code
create table if not exists public.order_codes (
  order_id   uuid primary key references public.orders (id) on delete cascade,
  code       text not null,
  tries      int not null default 0,
  locked_until timestamptz
);
alter table public.order_codes enable row level security;
-- only the customer of the order can read its code (the shop never can)
create policy order_codes_customer on public.order_codes for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id and o.customer_id = (select auth.uid())));

create or replace function private.on_order_code() returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.order_codes (order_id, code) values (new.id, lpad((floor(random() * 10000))::int::text, 4, '0'))
  on conflict (order_id) do nothing;
  return new;
end $$;
create trigger orders_code after insert on public.orders for each row execute function private.on_order_code();

-- orders made before this get a code too
insert into public.order_codes (order_id, code)
select id, lpad((floor(random() * 10000))::int::text, 4, '0') from public.orders
on conflict (order_id) do nothing;

-- the shop types the customer's code at handover; 5 wrong tries lock it for 15 minutes.
-- returns 'ok', 'wrong' or 'locked' (no exception for a wrong code, so the try counter is kept)
create or replace function public.confirm_receipt(p_order uuid, p_code text) returns text
language plpgsql security definer set search_path = ''
as $$
declare o record; k record; given text := regexp_replace(translate(coalesce(p_code, ''), '٠١٢٣٤٥٦٧٨٩', '0123456789'), '\D', '', 'g');
begin
  select * into o from public.orders where id = p_order for update;
  if o.id is null or auth.uid() is null or o.shop_id is distinct from auth.uid() then raise exception 'not allowed'; end if;
  if o.status in ('received', 'cancelled') then raise exception 'order closed'; end if;
  if o.payment_method in ('instapay', 'card') and o.payment_status <> 'paid' then raise exception 'payment pending'; end if;
  select * into k from public.order_codes where order_id = p_order for update;
  if k.locked_until is not null and k.locked_until > now() then return 'locked'; end if;
  if k.code is distinct from given then
    update public.order_codes set tries = tries + 1, locked_until = case when tries + 1 >= 5 then now() + interval '15 minutes' end where order_id = p_order;
    return case when k.tries + 1 >= 5 then 'locked' else 'wrong' end;
  end if;
  update public.order_codes set tries = 0, locked_until = null where order_id = p_order;
  update public.orders set status = 'received', received_at = now(), updated_at = now() where id = p_order;
  update public.requests set status = 'done', done_at = now(), order_status = 'delivered' where order_id = p_order;
  return 'ok';
end $$;

grant execute on function public.delivery_options(uuid[]), public.confirm_receipt(uuid, text) to authenticated;

-- Orders, "not available" answers, chat fix, and keeping contact details inside the app.
--
-- A price request (requests) collects offers per part. When the customer accepts offers, one ORDER is created
-- per shop holding the parts bought from that shop. Parts still waiting for offers stay in the price request.
-- Order status: preparing → ready (pickup) / out_for_delivery → delivered (by the shop) → received (by the customer).

-- ---------------------------------------------------------------- orders
create table public.orders (
  id            uuid primary key default gen_random_uuid(),
  order_no      bigint generated always as identity (start with 5001),
  customer_id   uuid not null references public.profiles (id) on delete cascade,
  shop_id       uuid not null references public.shops (id) on delete cascade,
  delivery_mode text not null check (delivery_mode in ('delivery', 'pickup')),
  status        text not null default 'preparing'
                check (status in ('preparing', 'ready', 'out_for_delivery', 'delivered', 'received', 'cancelled')),
  items_total   numeric(12, 2) not null default 0,
  delivery_fee  numeric(12, 2) not null default 0,
  rating        int check (rating between 1 and 5),
  review        text not null default '',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  received_at   timestamptz
);
create unique index orders_no_idx on public.orders (order_no);
create index orders_customer_idx on public.orders (customer_id, created_at desc);
create index orders_shop_idx on public.orders (shop_id, created_at desc);
alter table public.orders enable row level security;
create policy orders_select on public.orders for select to authenticated
  using (customer_id = (select auth.uid()) or shop_id = (select auth.uid()) or private.is_staff());
-- no insert/update policies: orders change only through the functions below

alter table public.requests add column order_id uuid references public.orders (id) on delete set null;
create index requests_order_idx on public.requests (order_id) where order_id is not null;

-- existing deals become orders (one per part)
do $$
declare r record; oid uuid;
begin
  for r in select rq.*, q.shop_id as q_shop, q.price as q_price from public.requests rq join public.quotes q on q.id = rq.chosen_quote_id
           where rq.status in ('chosen', 'done') and rq.order_id is null loop
    insert into public.orders (customer_id, shop_id, delivery_mode, status, items_total, delivery_fee, rating, review, created_at, received_at)
    values (r.customer_id, r.q_shop, coalesce(r.delivery_mode, 'pickup'),
            case when r.status = 'done' then 'received' else coalesce(r.order_status, 'preparing') end,
            r.q_price * coalesce(r.qty, 1), case when r.delivery_mode = 'delivery' then 60 else 0 end,
            r.rating, coalesce(r.review, ''), coalesce(r.chosen_at, r.created_at), r.done_at)
    returning id into oid;
    update public.requests set order_id = oid where id = r.id;
  end loop;
end $$;

-- ---------------------------------------------------------------- accepting offers → orders
create or replace function public.accept_offers(p_choices jsonb) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare uid uuid := auth.uid(); c record; s record; oid uuid; made uuid[] := '{}'; ono bigint;
begin
  if uid is null then raise exception 'not allowed'; end if;
  if jsonb_typeof(p_choices) <> 'array' or jsonb_array_length(p_choices) = 0 then raise exception 'nothing chosen'; end if;
  for c in select * from jsonb_to_recordset(p_choices) as x(request uuid, quote uuid, mode text) loop
    perform 1 from public.requests r join public.quotes q on q.request_id = r.id
     where r.id = c.request and q.id = c.quote and r.customer_id = uid and r.status = 'open';
    if not found then raise exception 'cannot choose this quote'; end if;
  end loop;
  for s in
    select q.shop_id as shop, max(x.mode) as mode, sum(q.price * coalesce(r.qty, 1)) as total
      from jsonb_to_recordset(p_choices) as x(request uuid, quote uuid, mode text)
      join public.requests r on r.id = x.request
      join public.quotes q on q.id = x.quote and q.request_id = r.id
     group by q.shop_id
  loop
    if s.mode not in ('delivery', 'pickup') then raise exception 'bad mode'; end if;
    if s.mode = 'delivery' and not exists (select 1 from public.shops where id = s.shop and offers_delivery) then
      raise exception 'shop does not deliver';
    end if;
    insert into public.orders (customer_id, shop_id, delivery_mode, items_total, delivery_fee)
    values (uid, s.shop, s.mode, s.total, case when s.mode = 'delivery' then 60 else 0 end)
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

-- older entry points now create orders too
create or replace function public.choose_quotes(p_choices jsonb) returns void
language plpgsql security definer set search_path = ''
as $$ begin perform public.accept_offers(p_choices); end $$;
create or replace function public.choose_quote(p_request uuid, p_quote uuid, p_mode text)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  perform public.accept_offers(jsonb_build_array(jsonb_build_object('request', p_request, 'quote', p_quote, 'mode', p_mode)));
end $$;

-- ---------------------------------------------------------------- moving an order along
create or replace function public.set_order_status(p_order uuid, p_status text) returns void
language plpgsql security definer set search_path = ''
as $$
declare o record;
begin
  select * into o from public.orders where id = p_order for update;
  if o.id is null or auth.uid() is null or o.shop_id is distinct from auth.uid() then raise exception 'not allowed'; end if;
  if o.status in ('received', 'cancelled') then raise exception 'order closed'; end if;
  if p_status not in ('preparing', 'ready', 'out_for_delivery', 'delivered') then raise exception 'bad status'; end if;
  if (p_status = 'ready' and o.delivery_mode = 'delivery') or (p_status = 'out_for_delivery' and o.delivery_mode = 'pickup') then
    raise exception 'bad status for this delivery mode';
  end if;
  update public.orders set status = p_status, updated_at = now() where id = p_order;
  update public.requests set order_status = p_status where order_id = p_order;
end $$;

create or replace function public.receive_order(p_order uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare o record;
begin
  select * into o from public.orders where id = p_order for update;
  if o.id is null or auth.uid() is null or o.customer_id is distinct from auth.uid() then raise exception 'not allowed'; end if;
  if o.status in ('received', 'cancelled') then return; end if;
  update public.orders set status = 'received', received_at = now(), updated_at = now() where id = p_order;
  update public.requests set status = 'done', done_at = now(), order_status = 'delivered' where order_id = p_order;
end $$;

create or replace function public.rate_order(p_order uuid, p_rating int, p_review text default '') returns void
language plpgsql security definer set search_path = ''
as $$
declare o record;
begin
  if p_rating not between 1 and 5 then raise exception 'bad rating'; end if;
  select * into o from public.orders where id = p_order;
  if o.id is null or auth.uid() is null or o.customer_id is distinct from auth.uid() or o.status <> 'received' then raise exception 'cannot rate'; end if;
  update public.orders set rating = p_rating, review = left(coalesce(p_review, ''), 500), updated_at = now() where id = p_order;
  -- shop pages read ratings from the parts
  update public.requests set rating = p_rating, review = left(coalesce(p_review, ''), 500) where order_id = p_order;
end $$;

-- The customer can cancel while the shop is still preparing; the parts go back to choosing offers.
create or replace function public.cancel_order(p_order uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare o record;
begin
  select * into o from public.orders where id = p_order for update;
  if o.id is null or auth.uid() is null or o.customer_id is distinct from auth.uid() then raise exception 'not allowed'; end if;
  if o.status <> 'preparing' then raise exception 'too late to cancel'; end if;
  update public.orders set status = 'cancelled', updated_at = now() where id = p_order;
  update public.requests set status = 'open', chosen_quote_id = null, delivery_mode = null, chosen_at = null, order_status = null, order_id = null
   where order_id = p_order;
end $$;

grant execute on function public.accept_offers(jsonb), public.set_order_status(uuid, text), public.receive_order(uuid),
  public.rate_order(uuid, int, text), public.cancel_order(uuid) to authenticated;

-- ---------------------------------------------------------------- notifications: per order, not per part
create or replace function private.on_request_update() returns trigger language plpgsql security definer set search_path = ''
as $$
declare shop uuid;
begin
  if new.order_id is not null or old.order_id is not null then return new; end if; -- orders notify for their parts
  select q.shop_id into shop from public.quotes q where q.id = new.chosen_quote_id;
  if new.status = 'chosen' and old.status = 'open' and shop is not null then
    perform private.notify(shop, 'العميل اختار عرضك!', new.part, '/shop/' || new.id);
  end if;
  return new;
end $$;

create or replace function private.order_parts(p_order uuid) returns text language sql stable security definer set search_path = ''
as $$ select string_agg(part, '، ' order by num) from public.requests where order_id = p_order $$;


create or replace function private.on_order_update() returns trigger language plpgsql security definer set search_path = ''
as $$
declare parts text := coalesce(private.order_parts(new.id), 'أوردر #' || new.order_no);
begin
  if new.status is distinct from old.status then
    if new.status in ('ready', 'out_for_delivery', 'delivered') then
      perform private.notify(new.customer_id,
        case new.status when 'ready' then 'أوردرك جاهز للاستلام' when 'out_for_delivery' then 'أوردرك خرج للتوصيل' else 'المحل سلّم أوردرك' end,
        parts, '/order/' || new.id);
    elsif new.status = 'received' then
      perform private.notify(new.shop_id, 'العميل استلم أوردر #' || new.order_no, parts, '/shop/order/' || new.id);
    elsif new.status = 'cancelled' then
      perform private.notify(new.shop_id, 'العميل لغى أوردر #' || new.order_no, parts, '/shop/order/' || new.id);
    end if;
  end if;
  if new.rating is not null and new.rating is distinct from old.rating then
    perform private.notify(new.shop_id, 'وصلك تقييم ' || new.rating || ' من ٥', coalesce(nullif(new.review, ''), parts), '/shop/order/' || new.id);
  end if;
  return new;
end $$;
create trigger orders_notify_update after update on public.orders for each row execute function private.on_order_update();

-- ---------------------------------------------------------------- "not available" answers
alter table public.declines add column reason text not null default '' check (char_length(reason) <= 200);

-- the customer sees how many shops said a part isn't available (not which shops)
create or replace function public.decline_counts(p_requests uuid[])
returns table (request_id uuid, n bigint, reasons text[])
language sql stable security definer set search_path = ''
as $$
  select d.request_id, count(*), array_remove(array_agg(nullif(d.reason, '')), null)
  from public.declines d join public.requests r on r.id = d.request_id
  where r.id = any (p_requests) and (r.customer_id = (select auth.uid()) or private.is_staff())
  group by d.request_id
$$;
grant execute on function public.decline_counts(uuid[]) to authenticated;

-- ---------------------------------------------------------------- keeping contact details in the app
-- Before a deal, phone numbers, emails, links and social handles are replaced with ••• in chat and request notes.
create or replace function private.mask_contacts(t text) returns text language plpgsql immutable set search_path = ''
as $$
declare s text := coalesce(t, '');
begin
  s := regexp_replace(s, '[0-9٠-٩۰-۹](?:[\s\-\.\/\(\)]*[0-9٠-٩۰-۹]){6,}', '•••', 'g');
  s := regexp_replace(s, '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}', '•••', 'g');
  s := regexp_replace(s, '(https?://|www\.)\S+', '•••', 'gi');
  s := regexp_replace(s, '\m[A-Za-z0-9-]+\.(com|net|org|eg|me|ly|io|link)\M\S*', '•••', 'gi');
  s := regexp_replace(s, '(واتس\S*|وتس\S*|واطس\S*|whats\S*|wa\.me\S*|انستا\S*|إنستا\S*|insta\S*|فيسبوك|فيس بوك|facebook|fb\.com|تليجرام|تلجرام|telegram|سناب\S*|snapchat|تيك ?توك|tiktok|@[A-Za-z0-9_.]{3,})', '•••', 'gi');
  return s;
end $$;

alter table public.messages add column flagged boolean not null default false;

create or replace function private.guard_message() returns trigger language plpgsql security definer set search_path = ''
as $$
declare deal boolean; masked text;
begin
  select exists (
    select 1 from public.requests r join public.quotes q on q.id = r.chosen_quote_id
    where r.id = new.request_id and q.shop_id = new.shop_id and r.status in ('chosen', 'done')
  ) into deal;
  if not deal then
    masked := private.mask_contacts(new.body);
    if masked is distinct from coalesce(new.body, '') then
      new.body := masked;
      new.flagged := true;
    end if;
  end if;
  return new;
end $$;
create trigger messages_guard before insert on public.messages for each row execute function private.guard_message();

create or replace function private.guard_request_text() returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  new.notes := private.mask_contacts(new.notes);
  new.part := private.mask_contacts(new.part);
  return new;
end $$;
create trigger requests_guard_text before insert or update of notes, part on public.requests for each row execute function private.guard_request_text();

-- ---------------------------------------------------------------- chat: the customer can always answer a shop that wrote first
create or replace function private.shop_wrote(p_request uuid, p_shop uuid) returns boolean
language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.messages m where m.request_id = p_request and m.shop_id = p_shop and m.sender_id = p_shop) $$;
grant execute on function private.shop_wrote(uuid, uuid) to authenticated;

alter policy messages_insert on public.messages
  with check (
    sender_id = (select auth.uid()) and not private.is_blocked() and (
      (shop_id = (select auth.uid()) and private.is_approved_shop())
      or (private.request_customer(request_id) = (select auth.uid()) and (
            exists (select 1 from public.quotes q where q.request_id = messages.request_id and q.shop_id = messages.shop_id)
         or private.shop_wrote(request_id, shop_id)))
    ));

alter publication supabase_realtime add table public.orders;

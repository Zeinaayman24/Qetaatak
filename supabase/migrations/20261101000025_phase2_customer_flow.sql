-- Phase 2, customer flow (Product Register A13, A17, A19, A20, A21; changes 1.6, 1.8, 1.12-1.14, 1.20).

-- ---------------------------------------------------------------- requests: new states and fields
alter table public.requests drop constraint requests_status_check;
alter table public.requests add constraint requests_status_check check (status in ('open', 'chosen', 'done', 'cancelled', 'expired'));
alter table public.requests drop constraint requests_side_check;
alter table public.requests add constraint requests_side_check check (side in ('', 'right', 'left', 'both', 'front', 'rear'));
alter table public.requests
  add column if not exists tip_sent_at timestamptz,
  add column if not exists expiry_warned_at timestamptz,
  add column if not exists expired_at timestamptz;

-- A13: at most 20 requests a day per customer (a request with several parts counts once)
create or replace function private.request_daily_limit() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.batch_id is not null and exists (select 1 from public.requests where batch_id = new.batch_id) then return new; end if;
  if (select count(distinct coalesce(batch_id::text, id::text)) from public.requests
       where customer_id = new.customer_id and created_at > now() - interval '24 hours') >= 20 then
    raise exception 'daily limit';
  end if;
  return new;
end $$;
drop trigger if exists requests_daily_limit on public.requests;
create trigger requests_daily_limit before insert on public.requests for each row execute function private.request_daily_limit();

-- ---------------------------------------------------------------- A17: offers last 48 hours
alter table public.quotes add column if not exists expires_at timestamptz;
alter table public.quotes disable trigger quotes_guard;
alter table public.quotes disable trigger quotes_clean;
update public.quotes set expires_at = created_at + interval '48 hours' where expires_at is null;
alter table public.quotes enable trigger quotes_guard;
alter table public.quotes enable trigger quotes_clean;
alter table public.quotes alter column expires_at set default now() + interval '48 hours';
alter table public.quotes alter column expires_at set not null;

-- ---------------------------------------------------------------- A19: saved addresses and the address on each order
create table if not exists public.customer_addresses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  label text not null default 'البيت' check (char_length(label) <= 30),
  governorate text not null check (char_length(governorate) between 2 and 40),
  area text not null check (char_length(area) between 2 and 60),
  street text not null check (char_length(street) between 2 and 120),
  building text not null check (char_length(building) between 1 and 20),
  floor text not null check (char_length(floor) between 1 and 10),
  apartment text not null check (char_length(apartment) between 1 and 10),
  landmark text not null default '' check (char_length(landmark) <= 120),
  contact_phone text not null default '' check (contact_phone = '' or contact_phone ~ '^01[0-9]{9}$'),
  created_at timestamptz not null default now(),
  used_at timestamptz not null default now()
);
alter table public.customer_addresses enable row level security;
create policy customer_addresses_own on public.customer_addresses for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create index if not exists customer_addresses_owner_idx on public.customer_addresses (owner_id);
create or replace function private.addresses_max() returns trigger language plpgsql security definer set search_path = ''
as $$ begin
  if (select count(*) from public.customer_addresses where owner_id = new.owner_id) >= 5 then raise exception 'max addresses'; end if;
  return new;
end $$;
drop trigger if exists customer_addresses_max on public.customer_addresses;
create trigger customer_addresses_max before insert on public.customer_addresses for each row execute function private.addresses_max();

alter table public.orders
  add column if not exists delivery_address jsonb,
  add column if not exists refused_at timestamptz,
  add column if not exists refusal_reason text not null default '',
  add column if not exists refusal_photo text,
  add column if not exists customer_pay_reminded_at timestamptz,
  add column if not exists shop_confirm_reminded_at timestamptz,
  add column if not exists staff_alerted_at timestamptz,
  add column if not exists refund_due_at timestamptz,
  add column if not exists refund_alerted_at timestamptz,
  add column if not exists cancel_reason text not null default '';

-- ---------------------------------------------------------------- choosing offers: expired offers are refused
create or replace function public.accept_offers(p_choices jsonb) returns jsonb
language plpgsql security definer set search_path = ''
as $function$
declare uid uuid := auth.uid(); c record; s record; oid uuid; made uuid[] := '{}'; ono bigint; fee numeric;
begin
  if uid is null then raise exception 'not allowed'; end if;
  if jsonb_typeof(p_choices) <> 'array' or jsonb_array_length(p_choices) = 0 then raise exception 'nothing chosen'; end if;
  for c in select * from jsonb_to_recordset(p_choices) as x(request uuid, quote uuid, mode text) loop
    perform 1 from public.requests r join public.quotes q on q.request_id = r.id
     where r.id = c.request and q.id = c.quote and r.customer_id = uid and r.status = 'open';
    if not found then raise exception 'cannot choose this quote'; end if;
    perform 1 from public.quotes q where q.id = c.quote and q.expires_at > now();
    if not found then raise exception 'offer expired'; end if;
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
    perform private.notify(s.shop, 'العميل اختار عرضك', 'أوردر جديد #' || ono || coalesce(' · ' || private.order_parts(oid), ''), '/shop/order/' || oid);
    made := made || oid;
  end loop;
  return to_jsonb(made);
end $function$;

-- checkout with the delivery address (A19). Card stays off until switched on.
create or replace function public.place_order(p_choices jsonb, p_payment text, p_address jsonb default null) returns jsonb
language plpgsql security definer set search_path = ''
as $function$
declare made jsonb; need_addr boolean;
begin
  if auth.uid() is null then raise exception 'not allowed'; end if;
  if p_payment not in ('cash', 'shop', 'instapay', 'card') then raise exception 'bad payment method'; end if;
  if p_payment = 'shop' and exists (
    select 1 from jsonb_to_recordset(p_choices) as x(request uuid, quote uuid, mode text) where x.mode is distinct from 'pickup'
  ) then raise exception 'pay at shop needs pickup'; end if;
  if p_payment = 'instapay' and exists (
    select 1 from jsonb_to_recordset(p_choices) as x(request uuid, quote uuid, mode text)
      join public.quotes q on q.id = x.quote
      join public.shop_private sp on sp.id = q.shop_id
     where sp.instapay_address = '' and sp.wallet_number = ''
  ) then raise exception 'shop has no transfer details'; end if;
  need_addr := exists (select 1 from jsonb_to_recordset(p_choices) as x(request uuid, quote uuid, mode text) where x.mode = 'delivery');
  if need_addr and (p_address is null
      or coalesce(p_address->>'governorate', '') = '' or coalesce(p_address->>'area', '') = '' or coalesce(p_address->>'street', '') = ''
      or coalesce(p_address->>'building', '') = '' or coalesce(p_address->>'floor', '') = '' or coalesce(p_address->>'apartment', '') = '') then
    raise exception 'address needed';
  end if;
  made := public.accept_offers(p_choices);
  update public.orders
     set payment_method = p_payment,
         payment_status = case when p_payment in ('instapay', 'card') then 'awaiting' else 'unpaid' end,
         delivery_address = case when delivery_mode = 'delivery' then jsonb_build_object(
           'governorate', p_address->>'governorate', 'area', p_address->>'area', 'street', p_address->>'street',
           'building', p_address->>'building', 'floor', p_address->>'floor', 'apartment', p_address->>'apartment',
           'landmark', coalesce(p_address->>'landmark', ''), 'contact_phone', coalesce(p_address->>'contact_phone', '')) end
   where id in (select (jsonb_array_elements_text(made))::uuid);
  return made;
end $function$;
revoke execute on function public.place_order(jsonb, text, jsonb) from public, anon;
grant execute on function public.place_order(jsonb, text, jsonb) to authenticated;
drop function if exists public.place_order(jsonb, text);

-- ---------------------------------------------------------------- A20: received only when ready; refusing the part
create or replace function public.receive_order(p_order uuid) returns void
language plpgsql security definer set search_path = ''
as $function$
declare o record;
begin
  select * into o from public.orders where id = p_order for update;
  if o.id is null or auth.uid() is null or o.customer_id is distinct from auth.uid() then raise exception 'not allowed'; end if;
  if o.status in ('received', 'cancelled') then return; end if;
  if o.status = 'preparing' then raise exception 'not ready yet'; end if;
  update public.orders set status = 'received', received_at = now(), updated_at = now() where id = p_order;
  update public.requests set status = 'done', done_at = now(), order_status = 'delivered' where order_id = p_order;
end $function$;

create or replace function public.refuse_order(p_order uuid, p_reason text, p_photo text) returns void
language plpgsql security definer set search_path = ''
as $function$
declare o record;
begin
  select * into o from public.orders where id = p_order for update;
  if o.id is null or auth.uid() is null or o.customer_id is distinct from auth.uid() then raise exception 'not allowed'; end if;
  if o.status in ('received', 'cancelled') then raise exception 'order closed'; end if;
  if o.status = 'preparing' then raise exception 'not ready yet'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'reason needed'; end if;
  if p_photo is not null and split_part(p_photo, '/', 1) <> auth.uid()::text then raise exception 'bad photo'; end if;
  update public.orders set status = 'cancelled', refused_at = now(), refusal_reason = left(p_reason, 300), refusal_photo = p_photo,
         cancel_reason = 'refused', updated_at = now() where id = p_order;
  update public.requests set status = 'open', chosen_quote_id = null, delivery_mode = null, chosen_at = null, order_status = null, order_id = null
   where order_id = p_order;
  perform private.notify(o.shop_id, 'العميل رفض القطعة في أوردر #' || o.order_no, 'السبب: ' || left(p_reason, 120), '/shop/order/' || o.id);
end $function$;
revoke execute on function public.refuse_order(uuid, text, text) from public, anon;
grant execute on function public.refuse_order(uuid, text, text) to authenticated;

-- the refund clock starts when money becomes refund_due
create or replace function private.on_order_refund_clock() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.payment_status = 'refund_due' and old.payment_status is distinct from 'refund_due' then new.refund_due_at := now(); end if;
  return new;
end $$;
drop trigger if exists orders_refund_clock on public.orders;
create trigger orders_refund_clock before update on public.orders for each row execute function private.on_order_refund_clock();

-- ---------------------------------------------------------------- deadlines and reminders (every 5 minutes)
create or replace function private.run_deadlines() returns void
language plpgsql security definer set search_path = ''
as $$
declare o record; r record;
begin
  -- A21: customer pays by transfer within 2 hours (reminder at 1 hour)
  for o in select * from public.orders where payment_method = 'instapay' and payment_status in ('awaiting', 'failed')
             and status = 'preparing' and created_at < now() - interval '1 hour' and customer_pay_reminded_at is null loop
    update public.orders set customer_pay_reminded_at = now() where id = o.id;
    perform private.notify(o.customer_id, 'فاضل ساعة على دفع أوردر #' || o.order_no, 'حوّل وارفع الإيصال عشان المحل يبدأ يجهّز.', '/order/' || o.id);
  end loop;
  for o in select * from public.orders where payment_method = 'instapay' and payment_status in ('awaiting', 'failed')
             and status = 'preparing' and created_at < now() - interval '2 hours' loop
    update public.orders set status = 'cancelled', cancel_reason = 'unpaid', updated_at = now() where id = o.id;
    update public.requests set status = 'open', chosen_quote_id = null, delivery_mode = null, chosen_at = null, order_status = null, order_id = null
     where order_id = o.id;
    perform private.notify(o.customer_id, 'أوردر #' || o.order_no || ' اتلغى', 'ماحوّلتش خلال ساعتين. القطع رجعت للطلب.', '/order/' || o.id);
  end loop;

  -- A21: shop confirms a receipt within 2 hours (reminder at 1 hour, staff at 2)
  for o in select * from public.orders where payment_status = 'review' and updated_at < now() - interval '1 hour' and shop_confirm_reminded_at is null loop
    update public.orders set shop_confirm_reminded_at = now() where id = o.id;
    perform private.notify(o.shop_id, 'تذكير: العميل مستني تأكيد التحويل', 'أوردر #' || o.order_no || ' · فاضل ساعة', '/shop/order/' || o.id);
  end loop;
  for o in select * from public.orders where payment_status = 'review' and updated_at < now() - interval '2 hours' and staff_alerted_at is null loop
    update public.orders set staff_alerted_at = now() where id = o.id;
    perform private.notify_staff('تحويل ماتأكدش من المحل خلال ساعتين', 'أوردر #' || o.order_no, '/manage');
  end loop;
  -- A21: refund within 48 hours
  for o in select * from public.orders where payment_status = 'refund_due' and refund_due_at < now() - interval '48 hours' and refund_alerted_at is null loop
    update public.orders set refund_alerted_at = now() where id = o.id;
    perform private.notify_staff('استرجاع متأخر من المحل', 'أوردر #' || o.order_no || ' · ' || (o.items_total + o.delivery_fee) || ' ج.م', '/manage');
  end loop;

  -- A17/A23: tip after 2 hours with no offers
  for r in select * from public.requests q where status = 'open' and created_at < now() - interval '2 hours' and tip_sent_at is null
             and not exists (select 1 from public.quotes where request_id = q.id) loop
    update public.requests set tip_sent_at = now() where id = r.id;
    perform private.notify(r.customer_id, 'لسه مفيش عروض على ' || r.part, 'ضيف صورة أو اختار «جديد أو مستعمل» عشان توصلك عروض أكتر.', '/customer/' || r.id);
  end loop;
  -- A23: offers about to end (6 hours left)
  for r in select q.* from public.requests q where status = 'open' and expiry_warned_at is null
             and exists (select 1 from public.quotes where request_id = q.id and expires_at > now() and expires_at < now() + interval '6 hours') loop
    update public.requests set expiry_warned_at = now() where id = r.id;
    perform private.notify(r.customer_id, 'عروض ' || r.part || ' هتنتهي قريب', 'اختار عرض قبل ما تنتهي.', '/customer/' || r.id);
  end loop;
  -- A17: requests with no order close after 7 days
  for r in select * from public.requests where status = 'open' and created_at < now() - interval '7 days' loop
    update public.requests set status = 'expired', expired_at = now() where id = r.id;
    if r.batch_id is null or r.id = (select id from public.requests where batch_id = r.batch_id order by num limit 1) then
      perform private.notify(r.customer_id, 'طلب #' || r.num || ' انتهى', 'ماخترتش عرض. تقدر تطلب تاني في أي وقت.', '/customer/requests');
    end if;
  end loop;
end $$;

select cron.schedule('daghta-deadlines', '*/5 * * * *', 'select private.run_deadlines()');

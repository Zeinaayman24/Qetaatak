-- C03/C05: staff see masked phones and locked chats; reveals are recorded. Disputes, cancel on behalf.

-- ---------------------------------------------------------------- people, masked for staff
-- staff no longer read profiles or chats directly; they use the functions below
alter policy profiles_select on public.profiles using ((id = (select auth.uid())) or private.is_chosen_shop_of_customer(id));
alter policy messages_select on public.messages using ((shop_id = (select auth.uid())) or (private.request_customer(request_id) = (select auth.uid())));

create or replace function private.mask_phone(p text) returns text language sql immutable set search_path = ''
as $$ select case when coalesce(p, '') = '' then '' when length(p) < 6 then '••••' else left(p, 3) || '••••' || right(p, 2) end $$;

create or replace function public.staff_people() returns setof jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.is_staff() then raise exception 'not allowed'; end if;
  return query select (to_jsonb(p) - 'phone' - 'street' - 'building' - 'floor' - 'apartment' - 'landmark')
                      || jsonb_build_object('phone', private.mask_phone(p.phone),
                           'refused', (select count(*) from public.orders o where o.customer_id = p.id and o.refused_at is not null))
                 from public.profiles p order by p.member_no desc;
end $$;

-- «اعرض الرقم»: returns the number and records who looked
create or replace function public.staff_show_phone(p_user uuid) returns text
language plpgsql security definer set search_path = ''
as $$
begin
  if not private.is_staff() then raise exception 'not allowed'; end if;
  perform private.log_action('phone_shown', 'profiles', p_user::text, null, null, '');
  return (select phone from public.profiles where id = p_user);
end $$;

-- dispute columns (used by the customer page below)
alter table public.orders
  add column if not exists dispute_note text not null default '',
  add column if not exists dispute_at timestamptz,
  add column if not exists dispute_decision text check (dispute_decision in ('justified', 'unjustified')),
  add column if not exists dispute_message text not null default '',
  add column if not exists cancelled_by text;

-- customer page: addresses, cars, privacy, stats (full address only on this page, recorded)
create or replace function public.staff_customer(p_user uuid) returns jsonb
language plpgsql security definer set search_path = ''
as $$
begin
  if not private.is_staff() then raise exception 'not allowed'; end if;
  return jsonb_build_object(
    'addresses', (select coalesce(jsonb_agg(to_jsonb(a) - 'contact_phone' order by a.used_at desc), '[]'::jsonb) from public.customer_addresses a where a.owner_id = p_user),
    'cars', (select coalesce(jsonb_agg(to_jsonb(c)), '[]'::jsonb) from public.cars c where c.owner_id = p_user),
    'consent', (select jsonb_build_object('on', marketing_consent, 'at', marketing_consent_at, 'deleted_at', deleted_at) from public.profiles where id = p_user),
    'data_requests', (select coalesce(jsonb_agg(to_jsonb(d) order by d.created_at desc), '[]'::jsonb) from public.data_requests d where d.user_id = p_user),
    'spent', (select coalesce(sum(items_total + delivery_fee), 0) from public.orders where customer_id = p_user and status = 'received'),
    'refused', (select count(*) from public.orders where customer_id = p_user and refused_at is not null),
    'refused_unjustified', (select count(*) from public.orders where customer_id = p_user and dispute_decision = 'unjustified'),
    'cancelled', (select count(*) from public.orders where customer_id = p_user and cancel_reason = 'customer'),
    'block_reason', (select reason from public.staff_log where target_id = p_user::text and action = 'block customer' order by at desc limit 1));
end $$;

create or replace function public.staff_block(p_user uuid, p_on boolean, p_reason text) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not private.has_role('support') then raise exception 'not allowed'; end if;
  if p_on and coalesce(trim(p_reason), '') = '' then raise exception 'reason needed'; end if;
  update public.profiles set is_blocked = p_on where id = p_user;
  perform private.log_action(case when p_on then 'block customer' else 'unblock customer' end, 'profiles', p_user::text, null, null, coalesce(p_reason, ''));
end $$;

-- «افتح المحادثة»: needs a reason, recorded
create or replace function public.staff_open_chat(p_request uuid, p_shop uuid, p_reason text) returns setof public.messages
language plpgsql security definer set search_path = ''
as $$
begin
  if not private.has_role('support') then raise exception 'not allowed'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'reason needed'; end if;
  perform private.log_action('chat_opened', 'requests', p_request::text, null, jsonb_build_object('shop', p_shop), p_reason);
  return query select * from public.messages where request_id = p_request and (p_shop is null or shop_id = p_shop) order by created_at;
end $$;

-- ---------------------------------------------------------------- disputes on a refusal (B10 «اعترض», C05 decision)


create or replace function public.shop_dispute(p_order uuid, p_note text) returns void
language plpgsql security definer set search_path = ''
as $$
declare o record;
begin
  select * into o from public.orders where id = p_order for update;
  if o.id is null or o.shop_id is distinct from auth.uid() or o.refused_at is null then raise exception 'not allowed'; end if;
  if coalesce(trim(p_note), '') = '' then raise exception 'reason needed'; end if;
  update public.orders set dispute_note = left(trim(p_note), 600), dispute_at = now() where id = p_order;
  perform private.add_task('dispute', p_order::text, 'اعتراض محل على رفض عميل', '#' || o.order_no || ' · ' || left(trim(p_note), 60), '/orders/' || p_order, private.add_workdays(now(), 1));
end $$;

create or replace function public.staff_decide_dispute(p_order uuid, p_justified boolean, p_message text) returns void
language plpgsql security definer set search_path = ''
as $$
declare o record;
begin
  if not private.has_role('support') then raise exception 'not allowed'; end if;
  select * into o from public.orders where id = p_order for update;
  if o.id is null or o.refused_at is null then raise exception 'not allowed'; end if;
  update public.orders set dispute_decision = case when p_justified then 'justified' else 'unjustified' end, dispute_message = left(coalesce(p_message, ''), 600) where id = p_order;
  if coalesce(trim(p_message), '') <> '' then
    perform private.notify(o.shop_id, 'قرار ضغطة في أوردر #' || o.order_no, left(p_message, 140), '/shop/order/' || o.id);
    perform private.notify(o.customer_id, 'قرار ضغطة في أوردر #' || o.order_no, left(p_message, 140), '/order/' || o.id);
  end if;
  update public.staff_tasks set done_at = now(), done_by = auth.uid() where kind = 'dispute' and ref = p_order::text and done_at is null;
  perform private.log_action('dispute decided', 'orders', p_order::text, null, jsonb_build_object('justified', p_justified), p_message);
end $$;

-- ---------------------------------------------------------------- «الغي الأوردر بالنيابة»
create or replace function public.staff_cancel_order(p_order uuid, p_reason text, p_who text) returns void
language plpgsql security definer set search_path = ''
as $$
declare o record;
begin
  if not private.has_role('support') then raise exception 'not allowed'; end if;
  if p_who not in ('customer', 'shop', 'daghta') then raise exception 'bad input'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'reason needed'; end if;
  select * into o from public.orders where id = p_order for update;
  if o.id is null or o.status in ('received', 'cancelled') then raise exception 'not allowed'; end if;
  update public.orders set status = 'cancelled', cancel_reason = 'staff: ' || left(trim(p_reason), 200), cancelled_by = p_who, updated_at = now() where id = p_order;
  update public.requests set status = 'open', chosen_quote_id = null, delivery_mode = null, chosen_at = null, order_status = null, order_id = null where order_id = p_order;
  perform private.notify(o.customer_id, 'أوردر #' || o.order_no || ' اتلغى', left(p_reason, 140), '/order/' || o.id);
  perform private.notify(o.shop_id, 'أوردر #' || o.order_no || ' اتلغى', left(p_reason, 140), '/shop/order/' || o.id);
  perform private.log_action('cancel order', 'orders', p_order::text, jsonb_build_object('status', o.status), jsonb_build_object('who', p_who), p_reason);
end $$;

revoke execute on function public.staff_people(), public.staff_show_phone(uuid), public.staff_customer(uuid), public.staff_block(uuid, boolean, text),
  public.staff_open_chat(uuid, uuid, text), public.shop_dispute(uuid, text), public.staff_decide_dispute(uuid, boolean, text),
  public.staff_cancel_order(uuid, text, text) from public, anon;
grant execute on function public.staff_people(), public.staff_show_phone(uuid), public.staff_customer(uuid), public.staff_block(uuid, boolean, text),
  public.staff_open_chat(uuid, uuid, text), public.shop_dispute(uuid, text), public.staff_decide_dispute(uuid, boolean, text),
  public.staff_cancel_order(uuid, text, text) to authenticated;

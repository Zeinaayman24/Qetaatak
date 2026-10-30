-- Payments: the customer picks how to pay before an order is confirmed.
--   cash      : cash on delivery            -> unpaid until the customer confirms receipt, then paid
--   shop      : pay at the shop (pickup)    -> same as cash
--   instapay  : InstaPay / wallet transfer  -> awaiting -> (receipt uploaded) review -> paid | failed (re-upload)
--   card      : card via Paymob             -> awaiting -> paid | failed (set by the paymob edge function)
-- A paid online order that gets cancelled becomes refund_due for the team.

alter table public.orders
  add column if not exists payment_method text not null default 'cash',
  add column if not exists payment_status text not null default 'unpaid',
  add column if not exists payment_ref    text not null default '',
  add column if not exists payment_proof  text,
  add column if not exists payment_note   text not null default '',
  add column if not exists paid_at        timestamptz;
alter table public.orders add constraint orders_payment_method_chk check (payment_method in ('cash', 'shop', 'instapay', 'card'));
alter table public.orders add constraint orders_payment_status_chk check (payment_status in ('unpaid', 'awaiting', 'review', 'paid', 'failed', 'refund_due', 'refunded'));

-- ---------------------------------------------------------------- settings the team can edit (InstaPay account etc.)
create table if not exists public.app_settings (
  key        text primary key,
  value      text not null default '',
  updated_at timestamptz not null default now()
);
alter table public.app_settings enable row level security;
create policy app_settings_read on public.app_settings for select to authenticated using (true);
insert into public.app_settings (key, value) values
  ('instapay_address', ''), ('wallet_number', ''), ('account_name', ''), ('payment_note', '')
on conflict (key) do nothing;

create or replace function public.set_setting(p_key text, p_value text) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not private.is_admin() then raise exception 'not allowed'; end if;
  if p_key not in ('instapay_address', 'wallet_number', 'account_name', 'payment_note') then raise exception 'unknown setting'; end if;
  insert into public.app_settings (key, value, updated_at) values (p_key, coalesce(p_value, ''), now())
  on conflict (key) do update set value = excluded.value, updated_at = now();
end $$;

-- ---------------------------------------------------------------- helpers
create or replace function private.notify_staff(p_title text, p_body text, p_link text) returns void
language sql security definer set search_path = ''
as $$ insert into public.notifications (user_id, title, body, link)
      select id, p_title, p_body, p_link from public.profiles where is_admin or is_support $$;

-- ---------------------------------------------------------------- placing an order with a payment method
create or replace function public.place_order(p_choices jsonb, p_payment text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare made jsonb;
begin
  if auth.uid() is null then raise exception 'not allowed'; end if;
  if p_payment not in ('cash', 'shop', 'instapay', 'card') then raise exception 'bad payment method'; end if;
  if p_payment = 'shop' and exists (
    select 1 from jsonb_to_recordset(p_choices) as x(request uuid, quote uuid, mode text) where x.mode is distinct from 'pickup'
  ) then raise exception 'pay at shop needs pickup'; end if;
  made := public.accept_offers(p_choices);
  update public.orders
     set payment_method = p_payment,
         payment_status = case when p_payment in ('instapay', 'card') then 'awaiting' else 'unpaid' end
   where id in (select (jsonb_array_elements_text(made))::uuid);
  return made;
end $$;

-- the customer uploads the transfer receipt (InstaPay / wallet)
create or replace function public.submit_payment_proof(p_order uuid, p_path text, p_ref text) returns void
language plpgsql security definer set search_path = ''
as $$
declare o record;
begin
  select * into o from public.orders where id = p_order for update;
  if o.id is null or auth.uid() is null or o.customer_id is distinct from auth.uid() then raise exception 'not allowed'; end if;
  if o.payment_method <> 'instapay' then raise exception 'not a transfer order'; end if;
  if o.payment_status not in ('awaiting', 'failed', 'review') then raise exception 'payment already settled'; end if;
  if o.status = 'cancelled' then raise exception 'order closed'; end if;
  if p_path is null or split_part(p_path, '/', 1) <> auth.uid()::text then raise exception 'bad receipt'; end if;
  update public.orders
     set payment_proof = p_path, payment_ref = left(coalesce(p_ref, ''), 80), payment_status = 'review', payment_note = '', updated_at = now()
   where id = p_order;
  perform private.notify_staff('إيصال تحويل محتاج مراجعة', 'أوردر #' || o.order_no || ' · ' || (o.items_total + o.delivery_fee) || ' ج.م', '/manage');
end $$;

-- the team confirms or rejects a transfer
create or replace function public.review_payment(p_order uuid, p_ok boolean, p_note text) returns void
language plpgsql security definer set search_path = ''
as $$
declare o record;
begin
  if not private.is_staff() then raise exception 'not allowed'; end if;
  select * into o from public.orders where id = p_order for update;
  if o.id is null then raise exception 'not found'; end if;
  if o.payment_method <> 'instapay' or o.payment_status not in ('review', 'awaiting', 'failed') then raise exception 'nothing to review'; end if;
  if p_ok then
    update public.orders set payment_status = 'paid', paid_at = now(), payment_note = '', updated_at = now() where id = p_order;
  else
    update public.orders set payment_status = 'failed', payment_note = left(coalesce(p_note, ''), 300), updated_at = now() where id = p_order;
  end if;
end $$;

-- the team records that a refund was sent back to the customer
create or replace function public.mark_refunded(p_order uuid, p_note text) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not private.is_staff() then raise exception 'not allowed'; end if;
  update public.orders set payment_status = 'refunded', payment_note = left(coalesce(p_note, ''), 300), updated_at = now()
   where id = p_order and payment_status = 'refund_due';
  if not found then raise exception 'nothing to refund'; end if;
end $$;

-- the paymob edge function (service role only) reports a card result
create or replace function public.card_payment_result(p_order uuid, p_ok boolean, p_ref text, p_amount_cents bigint) returns void
language plpgsql security definer set search_path = ''
as $$
declare o record;
begin
  -- only the paymob edge function, which calls with the service-role key, may report card results
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then raise exception 'not allowed'; end if;
  select * into o from public.orders where id = p_order for update;
  if o.id is null or o.payment_method <> 'card' then return; end if;
  if o.payment_status = 'paid' then return; end if;
  if p_ok and p_amount_cents = round((o.items_total + o.delivery_fee) * 100) then
    update public.orders set payment_status = 'paid', paid_at = now(), payment_ref = left(coalesce(p_ref, ''), 80), payment_note = '', updated_at = now() where id = p_order;
  else
    update public.orders set payment_status = 'failed', payment_ref = left(coalesce(p_ref, ''), 80),
      payment_note = case when p_ok then 'المبلغ المدفوع مش مطابق' else 'العملية اترفضت' end, updated_at = now() where id = p_order;
  end if;
end $$;

-- ---------------------------------------------------------------- shops wait for online payments before preparing
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
  if o.payment_method in ('instapay', 'card') and o.payment_status <> 'paid' and p_status <> 'preparing' then
    raise exception 'payment pending';
  end if;
  update public.orders set status = p_status, updated_at = now() where id = p_order;
  update public.requests set order_status = p_status where order_id = p_order;
end $$;

-- ---------------------------------------------------------------- automatic payment states and notices
create or replace function private.on_order_payment() returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.status = 'received' and old.status is distinct from 'received' and new.payment_method in ('cash', 'shop') then
    new.payment_status := 'paid'; new.paid_at := coalesce(new.paid_at, now());
  end if;
  if new.status = 'cancelled' and old.status is distinct from 'cancelled' then
    if new.payment_status = 'paid' and new.payment_method in ('instapay', 'card') then
      new.payment_status := 'refund_due';
    elsif new.payment_status in ('awaiting', 'review', 'failed') then
      new.payment_status := 'unpaid';
    end if;
  end if;
  return new;
end $$;
create trigger orders_payment before update on public.orders for each row execute function private.on_order_payment();

create or replace function private.on_order_payment_notice() returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.payment_status is distinct from old.payment_status then
    if new.payment_status = 'paid' and new.payment_method in ('instapay', 'card') then
      perform private.notify(new.customer_id, 'الدفع اتأكد ✅', 'أوردر #' || new.order_no || ' · المحل بيجهّزه', '/order/' || new.id);
      perform private.notify(new.shop_id, 'العميل دفع أوردر #' || new.order_no, 'ابدأ جهّز القطع', '/shop/order/' || new.id);
    elsif new.payment_status = 'failed' then
      perform private.notify(new.customer_id, 'الدفع ماتمّش', coalesce(nullif(new.payment_note, ''), 'جرّب تاني من صفحة الأوردر'), '/order/' || new.id);
    elsif new.payment_status = 'refund_due' then
      perform private.notify_staff('أوردر مدفوع اتلغى · محتاج استرجاع', 'أوردر #' || new.order_no || ' · ' || (new.items_total + new.delivery_fee) || ' ج.م', '/manage');
    end if;
  end if;
  return new;
end $$;
create trigger orders_payment_notice after update on public.orders for each row execute function private.on_order_payment_notice();

-- ---------------------------------------------------------------- receipts: private bucket
insert into storage.buckets (id, name, public) values ('receipts', 'receipts', false) on conflict (id) do nothing;
create policy receipts_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'receipts' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy receipts_read on storage.objects for select to authenticated
  using (bucket_id = 'receipts' and ((storage.foldername(name))[1] = (select auth.uid())::text or (select private.is_staff())));

grant execute on function public.place_order(jsonb, text), public.submit_payment_proof(uuid, text, text),
  public.review_payment(uuid, boolean, text), public.mark_refunded(uuid, text), public.set_setting(text, text) to authenticated;

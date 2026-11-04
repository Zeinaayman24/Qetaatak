-- Pickup deposit (Product Register change 1.33).
--
-- A pickup order is reserved with a small deposit paid to Daghta. The deposit is Daghta's fee, so the shop pays
-- no commission on that order. The customer pays the quote minus the deposit to the shop at the counter.
--   * deposit: EGP 50 under EGP 1,000; 5% from EGP 1,000, at most EGP 500 (all in app_settings)
--   * the shop's phone and exact address show only after the deposit is paid
--   * once the part is ready, it is held for 48 hours; no show → deposit kept, half goes to the shop
--   * the customer refuses the part at the counter → the shop confirms → deposit refunded
--   * the customer cancels after paying → deposit kept (half to the shop); the shop cancels → deposit refunded
-- Delivery orders do not change. The whole feature is behind app_settings.deposits ('off' until switched on).

-- ---------------------------------------------------------------- settings
insert into public.app_settings (key, value) values
  ('deposits', 'off'), ('deposit_flat', '50'), ('deposit_threshold', '1000'), ('deposit_pct', '5'), ('deposit_cap', '500'),
  ('deposit_hold_hours', '48'), ('deposit_pay_hours', '2'), ('deposit_shop_share', '50')
on conflict (key) do nothing;

create or replace function private.setting_num(p_key text, p_default numeric) returns numeric
language sql stable security definer set search_path = ''
as $$ select coalesce((select nullif(value, '')::numeric from public.app_settings where key = p_key), p_default) $$;

create or replace function private.deposits_on() returns boolean
language sql stable security definer set search_path = ''
as $$ select coalesce((select value from public.app_settings where key = 'deposits'), 'off') = 'on' $$;

-- the deposit for a pickup order of this parts total
create or replace function public.deposit_for(p_total numeric) returns numeric
language sql stable security definer set search_path = ''
as $$
  select case when p_total < private.setting_num('deposit_threshold', 1000) then least(private.setting_num('deposit_flat', 50), p_total)
              else least(private.setting_num('deposit_cap', 500), round(p_total * private.setting_num('deposit_pct', 5) / 100)) end
$$;
grant execute on function public.deposit_for(numeric) to authenticated;

-- ---------------------------------------------------------------- order columns
alter table public.orders
  add column if not exists deposit numeric not null default 0,
  add column if not exists deposit_status text not null default 'none',
  add column if not exists deposit_method text not null default '',
  add column if not exists deposit_proof text,
  add column if not exists deposit_ref text not null default '',
  add column if not exists deposit_note text not null default '',
  add column if not exists deposit_paid_at timestamptz,
  add column if not exists deposit_closed_at timestamptz,
  add column if not exists hold_until timestamptz,
  add column if not exists deposit_reminded_at timestamptz,
  add column if not exists hold_warned_at timestamptz,
  add column if not exists refusal_answer_due timestamptz,
  add column if not exists shop_comp numeric not null default 0,
  add column if not exists shop_comp_paid_at timestamptz;
alter table public.orders drop constraint if exists orders_deposit_status_chk;
alter table public.orders add constraint orders_deposit_status_chk check (deposit_status in (
  'none',        -- no deposit (delivery, or deposits switched off)
  'awaiting',    -- to be paid
  'review',      -- InstaPay receipt sent, the team checks it
  'failed',      -- receipt or card payment not accepted; can try again
  'paid',        -- paid; the shop's contact shows and the part is reserved
  'used',        -- the customer collected the part: the deposit was Daghta's fee
  'forfeited',   -- no show, or the customer cancelled after paying: kept, part goes to the shop
  'refund_check',-- customer refused the part: the shop confirms within 24 hours
  'disputed',    -- the shop says the customer took the part: the team decides
  'refund_due',  -- to be refunded to the customer by the team
  'refunded',
  'void'));      -- order cancelled before anything was paid
alter table public.orders drop constraint if exists orders_deposit_method_chk;
alter table public.orders add constraint orders_deposit_method_chk check (deposit_method in ('', 'card', 'instapay'));
create index if not exists orders_deposit_open_idx on public.orders (deposit_status) where deposit_status not in ('none', 'used', 'refunded', 'void');

-- the shop's InstaPay receipt rule does not cover deposit receipts: those go to the team only (staff can already read receipts)

-- ---------------------------------------------------------------- the shop's contact shows only once the deposit is paid
create or replace function private.chose_shop(shop uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.requests r
      join public.quotes q on q.id = r.chosen_quote_id
      left join public.orders o on o.id = r.order_id
     where r.customer_id = auth.uid() and q.shop_id = shop
       and coalesce(o.deposit_status, 'none') not in ('awaiting', 'review', 'failed', 'void')
  )
$$;

-- ---------------------------------------------------------------- placing the order: pickup gets a deposit
create or replace function public.place_order(p_choices jsonb, p_payment text, p_address jsonb default null) returns jsonb
language plpgsql security definer set search_path = ''
as $function$
declare made jsonb; need_addr boolean; dep boolean := private.deposits_on(); all_pickup boolean;
begin
  if auth.uid() is null then raise exception 'not allowed'; end if;
  if p_payment not in ('cash', 'shop', 'instapay', 'card') then raise exception 'bad payment method'; end if;
  all_pickup := not exists (select 1 from jsonb_to_recordset(p_choices) as x(request uuid, quote uuid, mode text) where x.mode is distinct from 'pickup');
  -- with deposits on, pickup orders always pay the rest at the shop, so the payment choice is only for delivery
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
  update public.orders
     set payment_method = case when dep and delivery_mode = 'pickup' then 'shop' else p_payment end,
         payment_status = case when dep and delivery_mode = 'pickup' then 'unpaid' when p_payment in ('instapay', 'card') then 'awaiting' else 'unpaid' end,
         deposit = case when dep and delivery_mode = 'pickup' then public.deposit_for(items_total) else 0 end,
         deposit_status = case when dep and delivery_mode = 'pickup' then 'awaiting' else 'none' end,
         delivery_address = case when delivery_mode = 'delivery' then jsonb_build_object(
           'governorate', p_address->>'governorate', 'area', p_address->>'area', 'street', p_address->>'street',
           'building', p_address->>'building', 'floor', p_address->>'floor', 'apartment', p_address->>'apartment',
           'landmark', coalesce(p_address->>'landmark', ''), 'contact_phone', coalesce(p_address->>'contact_phone', '')) end
   where id in (select (jsonb_array_elements_text(made))::uuid);
  return made;
end $function$;
revoke execute on function public.place_order(jsonb, text, jsonb) from public, anon;
grant execute on function public.place_order(jsonb, text, jsonb) to authenticated;

-- ---------------------------------------------------------------- paying the deposit
-- shared by the card result and the team's receipt check
create or replace function private.deposit_paid(p_order uuid, p_method text, p_ref text) returns void
language plpgsql security definer set search_path = ''
as $$
declare o record;
begin
  select * into o from public.orders where id = p_order for update;
  if o.id is null or o.deposit_status not in ('awaiting', 'review', 'failed') then return; end if;
  update public.orders
     set deposit_status = 'paid', deposit_method = p_method, deposit_paid_at = now(), deposit_note = '',
         deposit_ref = case when coalesce(p_ref, '') <> '' then left(p_ref, 80) else deposit_ref end,
         hold_until = case when o.status = 'ready' then now() + make_interval(hours => private.setting_num('deposit_hold_hours', 48)::int) end,
         updated_at = now()
   where id = p_order;
  perform private.notify(o.customer_id, 'العربون وصل، القطعة محجوزة باسمك',
    'رقم المحل وعنوانه ظهروا في صفحة الأوردر. الباقي ' || (o.items_total - o.deposit) || ' ج.م تدفعه في المحل.', '/order/' || o.id);
  perform private.notify(o.shop_id, 'العميل دفع العربون · أوردر #' || o.order_no,
    'جهّز القطعة. العميل هيدفعلك ' || (o.items_total - o.deposit) || ' ج.م وهو بيستلم.', '/shop/order/' || o.id);
end $$;

-- the customer sends a screenshot of the InstaPay / wallet transfer to Daghta's account
create or replace function public.submit_deposit_proof(p_order uuid, p_path text, p_ref text) returns void
language plpgsql security definer set search_path = ''
as $$
declare o record;
begin
  select * into o from public.orders where id = p_order for update;
  if o.id is null or auth.uid() is null or o.customer_id is distinct from auth.uid() then raise exception 'not allowed'; end if;
  if o.status = 'cancelled' then raise exception 'order closed'; end if;
  if o.deposit_status not in ('awaiting', 'failed', 'review') then raise exception 'payment already settled'; end if;
  if p_path is null or split_part(p_path, '/', 1) <> auth.uid()::text then raise exception 'bad receipt'; end if;
  update public.orders
     set deposit_proof = p_path, deposit_ref = left(coalesce(p_ref, ''), 80), deposit_method = 'instapay', deposit_status = 'review', deposit_note = '', updated_at = now()
   where id = p_order;
  perform private.notify_staff('إيصال عربون محتاج مراجعة', 'أوردر #' || o.order_no || ' · ' || o.deposit || ' ج.م', '/manage');
end $$;

-- the finance team checks the transfer arrived in Daghta's account
create or replace function public.staff_review_deposit(p_order uuid, p_ok boolean, p_note text) returns void
language plpgsql security definer set search_path = ''
as $$
declare o record;
begin
  if not private.has_role('finance') then raise exception 'not allowed'; end if;
  select * into o from public.orders where id = p_order for update;
  if o.id is null or o.deposit_status <> 'review' then raise exception 'nothing to review'; end if;
  if p_ok then
    perform private.deposit_paid(p_order, 'instapay', null);
  else
    if coalesce(trim(p_note), '') = '' then raise exception 'reason needed'; end if;
    update public.orders set deposit_status = 'failed', deposit_note = left(trim(p_note), 300), updated_at = now() where id = p_order;
    perform private.notify(o.customer_id, 'العربون ماوصلناش · أوردر #' || o.order_no, left(trim(p_note), 120), '/order/' || o.id);
  end if;
  insert into public.staff_log (staff_id, action, target_type, target_id, after, reason)
  values (auth.uid(), case when p_ok then 'deposit accepted' else 'deposit rejected' end, 'order', p_order::text, jsonb_build_object('deposit', o.deposit), coalesce(p_note, ''));
end $$;

-- card results from Paymob: a pickup order with an open deposit is paying the deposit, not the whole order
create or replace function public.card_payment_result(p_order uuid, p_ok boolean, p_ref text, p_amount_cents bigint) returns void
language plpgsql security definer set search_path = ''
as $$
declare o record;
begin
  -- only the paymob edge function, which calls with the service-role key, may report card results
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then raise exception 'not allowed'; end if;
  select * into o from public.orders where id = p_order for update;
  if o.id is null then return; end if;
  if o.deposit_status in ('awaiting', 'failed', 'review') then
    if p_ok and p_amount_cents = round(o.deposit * 100) then
      perform private.deposit_paid(p_order, 'card', p_ref);
    else
      update public.orders set deposit_status = 'failed', deposit_method = 'card', deposit_ref = left(coalesce(p_ref, ''), 80),
        deposit_note = case when p_ok then 'المبلغ المدفوع مش مطابق' else 'العملية اترفضت' end, updated_at = now() where id = p_order;
    end if;
    return;
  end if;
  if o.payment_method <> 'card' then return; end if;
  if o.payment_status = 'paid' then return; end if;
  if p_ok and p_amount_cents = round((o.items_total + o.delivery_fee) * 100) then
    update public.orders set payment_status = 'paid', paid_at = now(), payment_ref = left(coalesce(p_ref, ''), 80), payment_note = '', updated_at = now() where id = p_order;
  else
    update public.orders set payment_status = 'failed', payment_ref = left(coalesce(p_ref, ''), 80),
      payment_note = case when p_ok then 'المبلغ المدفوع مش مطابق' else 'العملية اترفضت' end, updated_at = now() where id = p_order;
  end if;
end $$;

-- ---------------------------------------------------------------- the shop: no preparing on an unpaid deposit; the hold starts at ready
create or replace function public.set_order_status(p_order uuid, p_status text) returns void
language plpgsql security definer set search_path = ''
as $$
declare o record;
begin
  select * into o from public.orders where id = p_order for update;
  if o.id is null or auth.uid() is null or o.shop_id is distinct from auth.uid() then raise exception 'not allowed'; end if;
  if o.status in ('received', 'cancelled') then raise exception 'order closed'; end if;
  if p_status not in ('preparing', 'ready') then raise exception 'bad status'; end if;
  if p_status = 'ready' and o.payment_method in ('instapay', 'card') and o.payment_status <> 'paid' then raise exception 'payment pending'; end if;
  if p_status = 'ready' and o.deposit_status in ('awaiting', 'review', 'failed') then raise exception 'deposit pending'; end if;
  update public.orders
     set status = p_status, updated_at = now(),
         hold_until = case when p_status = 'ready' and o.deposit_status = 'paid' and o.hold_until is null
                           then now() + make_interval(hours => private.setting_num('deposit_hold_hours', 48)::int) else hold_until end
   where id = p_order;
  update public.requests set order_status = p_status where order_id = p_order;
end $$;

-- the receipt code at the counter: an unpaid deposit blocks handover
create or replace function private.guard_deposit_handover() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.status = 'received' and old.status is distinct from 'received' then
    if old.deposit_status in ('awaiting', 'review', 'failed') then raise exception 'deposit pending'; end if;
    if old.deposit_status = 'paid' then
      new.deposit_status := 'used'; new.deposit_closed_at := now();
    end if;
  end if;
  if new.status = 'cancelled' and old.status is distinct from 'cancelled' then
    if old.deposit_status in ('awaiting', 'failed') then
      new.deposit_status := 'void'; new.deposit_closed_at := now();
    elsif old.deposit_status = 'review' then
      -- a receipt was sent but not checked yet: the team checks the money and refunds it
      new.deposit_status := 'refund_due';
    elsif old.deposit_status = 'paid' then
      if new.cancel_reason in ('customer', 'no_show') then
        new.deposit_status := 'forfeited'; new.deposit_closed_at := now();
        new.shop_comp := round(old.deposit * private.setting_num('deposit_shop_share', 50) / 100);
      elsif new.cancel_reason = 'refused' then
        new.deposit_status := 'refund_check';
        new.refusal_answer_due := now() + interval '24 hours';
      else
        new.deposit_status := 'refund_due';   -- the shop or the team cancelled
      end if;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists orders_deposit_guard on public.orders;
create trigger orders_deposit_guard before update of status on public.orders for each row execute function private.guard_deposit_handover();

-- deposit notices that the status triggers don't send
create or replace function private.on_deposit_change() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.deposit_status is not distinct from old.deposit_status then return new; end if;
  if new.deposit_status = 'forfeited' then
    perform private.notify(new.customer_id, 'العربون مش هيرجع · أوردر #' || new.order_no,
      case when new.cancel_reason = 'no_show' then 'ماجيتش تستلم القطعة في المعاد، فالحجز اتلغى.' else 'لغيت الأوردر بعد دفع العربون.' end, '/order/' || new.id);
    perform private.notify(new.shop_id, 'ليك ' || new.shop_comp || ' ج.م تعويض · أوردر #' || new.order_no,
      'العميل ماستلمش القطعة. التعويض هيتحوّلك من ضغطة.', '/shop/balance');
  elsif new.deposit_status = 'refund_check' then
    perform private.notify(new.shop_id, 'العميل رفض القطعة · أوردر #' || new.order_no,
      'أكّد إنه ماخدهاش عشان يرجعله العربون، خلال ٢٤ ساعة.', '/shop/order/' || new.id);
  elsif new.deposit_status = 'refund_due' then
    perform private.notify(new.customer_id, 'هنرجّعلك العربون · أوردر #' || new.order_no, new.deposit || ' ج.م على نفس طريقة الدفع خلال ٣ أيام عمل.', '/order/' || new.id);
    perform private.notify_staff('عربون لازم يرجع', 'أوردر #' || new.order_no || ' · ' || new.deposit || ' ج.م', '/manage');
  elsif new.deposit_status = 'disputed' then
    perform private.notify_staff('خلاف على عربون', 'أوردر #' || new.order_no || ': المحل بيقول العميل استلم', '/manage');
  elsif new.deposit_status = 'refunded' then
    perform private.notify(new.customer_id, 'العربون رجعلك · أوردر #' || new.order_no, new.deposit || ' ج.م', '/order/' || new.id);
  end if;
  return new;
end $$;
drop trigger if exists orders_deposit_notice on public.orders;
-- no column list: the deposit often changes inside the guard trigger, which a column-specific trigger would miss
create trigger orders_deposit_notice after update on public.orders for each row execute function private.on_deposit_change();

-- ---------------------------------------------------------------- refusal: the shop confirms the customer didn't take the part
create or replace function public.shop_answer_refusal(p_order uuid, p_agree boolean, p_note text) returns void
language plpgsql security definer set search_path = ''
as $$
declare o record;
begin
  select * into o from public.orders where id = p_order for update;
  if o.id is null or auth.uid() is null or o.shop_id is distinct from auth.uid() then raise exception 'not allowed'; end if;
  if o.deposit_status <> 'refund_check' then raise exception 'nothing to answer'; end if;
  if not p_agree and coalesce(trim(p_note), '') = '' then raise exception 'reason needed'; end if;
  update public.orders
     set deposit_status = case when p_agree then 'refund_due' else 'disputed' end,
         deposit_note = case when p_agree then deposit_note else left(trim(p_note), 300) end, updated_at = now()
   where id = p_order;
end $$;

-- ---------------------------------------------------------------- the team: refunds, disputes, paying shops their share
create or replace function public.staff_settle_deposit(p_order uuid, p_action text, p_note text) returns void
language plpgsql security definer set search_path = ''
as $$
declare o record;
begin
  if not private.has_role('finance') then raise exception 'not allowed'; end if;
  select * into o from public.orders where id = p_order for update;
  if o.id is null then raise exception 'not found'; end if;
  if p_action = 'refunded' and o.deposit_status = 'refund_due' then
    update public.orders set deposit_status = 'refunded', deposit_closed_at = now(), deposit_note = left(coalesce(p_note, ''), 300), updated_at = now() where id = p_order;
  elsif p_action = 'refund' and o.deposit_status in ('disputed', 'refund_check') then
    update public.orders set deposit_status = 'refund_due', updated_at = now() where id = p_order;
  elsif p_action = 'keep' and o.deposit_status in ('disputed', 'refund_check') then
    -- the shop is right: the customer took the part, so the deposit counts as Daghta's fee
    update public.orders set deposit_status = 'used', deposit_closed_at = now(), deposit_note = left(coalesce(p_note, ''), 300), updated_at = now() where id = p_order;
  else
    raise exception 'not possible now';
  end if;
  insert into public.staff_log (staff_id, action, target_type, target_id, before, after, reason)
  values (auth.uid(), 'deposit ' || p_action, 'order', p_order::text, jsonb_build_object('deposit_status', o.deposit_status), jsonb_build_object('deposit', o.deposit), coalesce(p_note, ''));
end $$;

create or replace function public.staff_pay_shop_comp(p_shop uuid, p_note text) returns numeric
language plpgsql security definer set search_path = ''
as $$
declare total numeric;
begin
  if not private.has_role('finance') then raise exception 'not allowed'; end if;
  select coalesce(sum(shop_comp), 0) into total from public.orders
   where shop_id = p_shop and deposit_status = 'forfeited' and shop_comp > 0 and shop_comp_paid_at is null;
  if total = 0 then raise exception 'nothing owed'; end if;
  update public.orders set shop_comp_paid_at = now()
   where shop_id = p_shop and deposit_status = 'forfeited' and shop_comp > 0 and shop_comp_paid_at is null;
  perform private.notify(p_shop, 'حوّلنالك ' || total || ' ج.م تعويض عربون', coalesce(nullif(trim(p_note), ''), 'تعويض الأوردرات اللي العميل ماستلمهاش.'), '/shop/balance');
  insert into public.staff_log (staff_id, action, target_type, target_id, after, reason)
  values (auth.uid(), 'paid shop deposit share', 'shop', p_shop::text, jsonb_build_object('amount', total), coalesce(p_note, ''));
  return total;
end $$;

-- ---------------------------------------------------------------- commission: a pickup order paid by deposit carries no shop commission
create or replace function private.order_commission(o public.orders) returns numeric
language sql stable security definer set search_path = ''
as $$
  select case when o.status <> 'received' or o.returned_at is not null or o.received_at < private.shop_free_until(o.shop_id)
                or o.deposit_status = 'used' then 0
              else round(o.items_total * private.rate_at(o.received_at) / 100) end;
$$;

-- the shop's balance: add what Daghta owes the shop from kept deposits
create or replace function public.my_deposit_share() returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'owed', coalesce((select sum(shop_comp) from public.orders where shop_id = auth.uid() and deposit_status = 'forfeited' and shop_comp_paid_at is null), 0),
    'paid', coalesce((select sum(shop_comp) from public.orders where shop_id = auth.uid() and deposit_status = 'forfeited' and shop_comp_paid_at is not null), 0),
    'rows', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'order_no', o.order_no, 'at', o.deposit_closed_at, 'amount', o.shop_comp,
                         'paid_at', o.shop_comp_paid_at, 'parts', private.order_parts(o.id)) order by o.deposit_closed_at desc)
                      from public.orders o where o.shop_id = auth.uid() and o.deposit_status = 'forfeited' and o.shop_comp > 0), '[]'::jsonb))
$$;

-- ---------------------------------------------------------------- deadlines (every 5 minutes)
create or replace function private.run_deposit_deadlines() returns void
language plpgsql security definer set search_path = ''
as $$
declare o record; pay_h numeric := private.setting_num('deposit_pay_hours', 2);
begin
  -- pay the deposit in time (reminder half-way)
  for o in select * from public.orders where deposit_status in ('awaiting', 'failed') and status <> 'cancelled'
             and created_at < now() - make_interval(mins => (pay_h * 30)::int) and deposit_reminded_at is null loop
    update public.orders set deposit_reminded_at = now() where id = o.id;
    perform private.notify(o.customer_id, 'ادفع العربون عشان تحجز القطعة', 'أوردر #' || o.order_no || ' · ' || o.deposit || ' ج.م', '/order/' || o.id);
  end loop;
  for o in select * from public.orders where deposit_status in ('awaiting', 'failed') and status <> 'cancelled'
             and created_at < now() - make_interval(mins => (pay_h * 60)::int) loop
    update public.orders set status = 'cancelled', cancel_reason = 'unpaid', updated_at = now() where id = o.id;
    update public.requests set status = 'open', chosen_quote_id = null, delivery_mode = null, chosen_at = null, order_status = null, order_id = null
     where order_id = o.id;
    perform private.notify(o.customer_id, 'أوردر #' || o.order_no || ' اتلغى', 'العربون مااتدفعش في المعاد. القطع رجعت للطلب.', '/order/' || o.id);
  end loop;

  -- the hold: a reminder 6 hours before it ends, then no show
  for o in select * from public.orders where deposit_status = 'paid' and status = 'ready' and hold_until is not null
             and hold_until < now() + interval '6 hours' and hold_warned_at is null loop
    update public.orders set hold_warned_at = now() where id = o.id;
    perform private.notify(o.customer_id, 'فاضل أقل من ٦ ساعات على حجز القطعة',
      'أوردر #' || o.order_no || ': لو مالحقتش تستلمها، العربون مش هيرجع.', '/order/' || o.id);
  end loop;
  for o in select * from public.orders where deposit_status = 'paid' and status = 'ready' and hold_until < now() loop
    update public.orders set status = 'cancelled', cancel_reason = 'no_show', updated_at = now() where id = o.id;
    update public.requests set status = 'open', chosen_quote_id = null, delivery_mode = null, chosen_at = null, order_status = null, order_id = null
     where order_id = o.id;
  end loop;

  -- the shop didn't answer a refusal in 24 hours: the customer gets the deposit back
  for o in select * from public.orders where deposit_status = 'refund_check' and refusal_answer_due < now() loop
    update public.orders set deposit_status = 'refund_due', updated_at = now() where id = o.id;
  end loop;
end $$;

do $$ begin
  perform cron.unschedule('daghta-deposits') where exists (select 1 from cron.job where jobname = 'daghta-deposits');
  perform cron.schedule('daghta-deposits', '*/5 * * * *', 'select private.run_deposit_deadlines()');
end $$;

-- ---------------------------------------------------------------- access
revoke execute on function public.submit_deposit_proof(uuid, text, text), public.staff_review_deposit(uuid, boolean, text),
  public.shop_answer_refusal(uuid, boolean, text), public.staff_settle_deposit(uuid, text, text), public.staff_pay_shop_comp(uuid, text),
  public.my_deposit_share(), public.card_payment_result(uuid, boolean, text, bigint), public.set_order_status(uuid, text) from public, anon;
grant execute on function public.submit_deposit_proof(uuid, text, text), public.staff_review_deposit(uuid, boolean, text),
  public.shop_answer_refusal(uuid, boolean, text), public.staff_settle_deposit(uuid, text, text), public.staff_pay_shop_comp(uuid, text),
  public.my_deposit_share(), public.set_order_status(uuid, text) to authenticated;
grant execute on function public.card_payment_result(uuid, boolean, text, bigint) to service_role;

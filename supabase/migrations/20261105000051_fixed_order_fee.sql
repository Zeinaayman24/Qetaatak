-- Change 1.36: Daghta's fee is a fixed amount per order (100 EGP), not a percentage.
--  * Cash at the shop (hidden shop): the customer pays the fee as the pickup deposit; the shop collects the rest.
--  * Any other way (visible shop, delivery, InstaPay/wallet/card): the same fee goes on the shop's monthly statement.
--  * Free months drop from 6 to 3. During them a deposit the customer paid is passed on to the shop.
--  * Visible (subscribed) shops still pay the fee; the subscription buys visibility and the featured badge.
--  * No limit on how many offers a shop sends for one part.

-- ---------------------------------------------------------------- the fee, with a dated history
alter table public.commission_rates add column if not exists amount numeric;
insert into public.commission_rates (starts_at, pct, amount) values (now(), 0, 100);
insert into public.app_settings (key, value) values ('order_fee', '100') on conflict (key) do update set value = '100';
update public.app_settings set value = '3' where key = 'free_months';

create or replace function private.fee_at(t timestamptz) returns numeric
language sql stable security definer set search_path = ''
as $$
  select coalesce((select amount from public.commission_rates where amount is not null and starts_at <= coalesce(t, now()) order by starts_at desc limit 1),
                  private.setting_num('order_fee', 100))
$$;

create or replace function private.order_commission(o public.orders) returns numeric
language sql stable security definer set search_path = ''
as $$
  select case when o.status <> 'received' or o.returned_at is not null or o.received_at < private.shop_free_until(o.shop_id)
                or o.deposit_status = 'used' then 0   -- a used deposit already was the fee
              else private.fee_at(o.received_at) end;
$$;

create or replace function private.order_fee(p_total numeric) returns numeric
language sql stable security definer set search_path = ''
as $$ select private.fee_at(now()) $$;

-- the pickup deposit is the fee itself
create or replace function public.deposit_for(p_total numeric) returns numeric
language sql stable security definer set search_path = ''
as $$ select least(private.fee_at(now()), p_total) $$;

create or replace function private.shop_free_until(p_shop uuid) returns timestamptz
language sql stable security definer set search_path = ''
as $$
  select coalesce(approved_at, created_at) + make_interval(months => private.setting_num('free_months', 3)::int)
    from public.shops where id = p_shop;
$$;

-- ---------------------------------------------------------------- free months: the deposit goes to the shop
create or replace function private.guard_deposit_handover() returns trigger
language plpgsql security definer set search_path = ''
as $function$
begin
  if new.status = 'received' and old.status is distinct from 'received' then
    if old.deposit_status in ('awaiting', 'review', 'failed') then raise exception 'deposit pending'; end if;
    if old.deposit_status = 'paid' then
      new.deposit_status := 'used'; new.deposit_closed_at := now();
      if now() < private.shop_free_until(new.shop_id) then new.shop_comp := old.deposit; end if;
    end if;
  end if;
  if new.status = 'cancelled' and old.status is distinct from 'cancelled' then
    if old.deposit_status in ('awaiting', 'failed') then
      new.deposit_status := 'void'; new.deposit_closed_at := now();
    elsif old.deposit_status = 'review' then
      new.deposit_status := 'refund_due';
    elsif old.deposit_status = 'paid' then
      if new.cancel_reason in ('customer', 'no_show') then
        new.deposit_status := 'forfeited'; new.deposit_closed_at := now();
        new.shop_comp := round(old.deposit * private.setting_num('deposit_shop_share', 50) / 100);
      elsif new.cancel_reason = 'refused' then
        new.deposit_status := 'refund_check';
        new.refusal_answer_due := now() + interval '24 hours';
      else
        new.deposit_status := 'refund_due';
      end if;
    end if;
  end if;
  return new;
end $function$;

create or replace function private.on_deposit_change() returns trigger
language plpgsql security definer set search_path = ''
as $function$
begin
  if new.deposit_status is not distinct from old.deposit_status then return new; end if;
  if new.deposit_status = 'forfeited' then
    perform private.notify(new.customer_id, 'العربون مش هيرجع · أوردر #' || new.order_no,
      case when new.cancel_reason = 'no_show' then 'ماجيتش تستلم القطعة في المعاد، فالحجز اتلغى.' else 'لغيت الأوردر بعد دفع العربون.' end, '/order/' || new.id);
    perform private.notify(new.shop_id, 'ليك ' || new.shop_comp || ' ج.م تعويض · أوردر #' || new.order_no,
      'العميل ماستلمش القطعة. التعويض هيتحوّلك من ضغطة.', '/shop/balance');
  elsif new.deposit_status = 'used' and new.shop_comp > 0 then
    perform private.notify(new.shop_id, 'ليك ' || new.shop_comp || ' ج.م · أوردر #' || new.order_no,
      'إنت في الفترة المجانية، فالعربون اللي العميل دفعه لضغطة هيتحوّلك.', '/shop/balance');
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
end $function$;

create or replace function public.staff_pay_shop_comp(p_shop uuid, p_note text) returns numeric
language plpgsql security definer set search_path = ''
as $function$
declare total numeric;
begin
  if not private.has_role('finance') then raise exception 'not allowed'; end if;
  select coalesce(sum(shop_comp), 0) into total from public.orders
   where shop_id = p_shop and deposit_status in ('forfeited', 'used') and shop_comp > 0 and shop_comp_paid_at is null;
  if total = 0 then raise exception 'nothing owed'; end if;
  update public.orders set shop_comp_paid_at = now()
   where shop_id = p_shop and deposit_status in ('forfeited', 'used') and shop_comp > 0 and shop_comp_paid_at is null;
  perform private.notify(p_shop, 'حوّلنالك ' || total || ' ج.م من العربون', coalesce(nullif(trim(p_note), ''), 'تعويض عدم الحضور وعربون الفترة المجانية.'), '/shop/balance');
  insert into public.staff_log (staff_id, action, target_type, target_id, after, reason)
  values (auth.uid(), 'paid shop deposit share', 'shop', p_shop::text, jsonb_build_object('amount', total), coalesce(p_note, ''));
  return total;
end $function$;

create or replace function public.my_deposit_share() returns jsonb
language sql stable security definer set search_path = ''
as $function$
  select jsonb_build_object(
    'owed', coalesce((select sum(shop_comp) from public.orders where shop_id = auth.uid() and deposit_status in ('forfeited', 'used') and shop_comp_paid_at is null), 0),
    'paid', coalesce((select sum(shop_comp) from public.orders where shop_id = auth.uid() and deposit_status in ('forfeited', 'used') and shop_comp_paid_at is not null), 0),
    'rows', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'order_no', o.order_no, 'at', o.deposit_closed_at, 'amount', o.shop_comp,
                         'kind', o.deposit_status, 'paid_at', o.shop_comp_paid_at, 'parts', private.order_parts(o.id)) order by o.deposit_closed_at desc)
                      from public.orders o where o.shop_id = auth.uid() and o.deposit_status in ('forfeited', 'used') and o.shop_comp > 0), '[]'::jsonb))
$function$;

-- ---------------------------------------------------------------- balances and reports read the fixed fee
create or replace function public.my_balance() returns jsonb
language plpgsql stable security definer set search_path = ''
as $function$
declare uid uuid := auth.uid(); lim numeric; fees numeric; paid numeric; rows jsonb; fu timestamptz;
begin
  if uid is null or not exists (select 1 from public.shops where id = uid) then raise exception 'not allowed'; end if;
  lim := private.setting_num('owed_limit', 500);
  fu := private.shop_free_until(uid);
  select coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'order_no', o.order_no, 'at', o.received_at, 'total', o.items_total,
           'fee', private.order_commission(o),
           'state', case when o.returned_at is not null then 'returned' when o.received_at < fu then 'free' when o.deposit_status = 'used' then 'deposit' else 'fee' end,
           'parts', private.order_parts(o.id)) order by o.received_at desc), '[]'::jsonb),
         coalesce(sum(private.order_commission(o)), 0)
    into rows, fees
    from public.orders o where o.shop_id = uid and o.status = 'received';
  select coalesce(sum(amount), 0) into paid from public.shop_settlements where shop_id = uid and status = 'confirmed';
  return jsonb_build_object('free_until', fu, 'free', now() < fu, 'fee', private.fee_at(now()), 'limit', lim, 'fees', fees, 'paid', paid,
    'owed', greatest(fees - paid, 0), 'due_at', private.shop_due_at(uid), 'orders', rows,
    'statements', coalesce((select jsonb_agg(jsonb_build_object('month', month, 'amount', amount) order by month desc) from private.shop_statements(uid)), '[]'::jsonb),
    'payments', coalesce((select jsonb_agg(to_jsonb(s) order by s.created_at desc) from public.shop_settlements s where s.shop_id = uid), '[]'::jsonb));
end $function$;

create or replace function public.staff_balances()
returns table (shop_id uuid, name text, orders bigint, commission numeric, removed numeric, paid numeric, owed numeric, free_until timestamptz)
language plpgsql stable security definer set search_path = ''
as $function$
begin
  if not private.has_role('finance') then raise exception 'not allowed'; end if;
  return query
  select s.id, sp.name,
         (select count(*) from public.orders o where o.shop_id = s.id and o.status = 'received'),
         coalesce((select sum(private.order_commission(o)) from public.orders o where o.shop_id = s.id and o.status = 'received'), 0),
         coalesce((select sum(private.fee_at(o.received_at)) from public.orders o
                    where o.shop_id = s.id and o.status = 'received' and o.returned_at is not null and o.received_at >= private.shop_free_until(s.id)), 0),
         coalesce((select sum(amount) from public.shop_settlements x where x.shop_id = s.id and x.status = 'confirmed'), 0),
         private.shop_owed(s.id), private.shop_free_until(s.id)
    from public.shops s left join public.shop_private sp on sp.id = s.id
   where s.status not in ('draft');
end $function$;

create or replace function private.check_shop_billing() returns void
language plpgsql security definer set search_path = ''
as $function$
declare s record; due timestamptz;
begin
  for s in select sh.id, sh.free_end_told_at, sp.name from public.shops sh join public.shop_private sp on sp.id = sh.id where sh.status = 'approved' loop
    due := private.shop_due_at(s.id);
    if due is not null and due < now() - interval '30 days' then
      perform private.notify_staff('محل عدّى ٣٠ يوم على عمولة مستحقة', s.name || ' · ' || private.shop_owed(s.id) || ' ج.م', '/manage');
    end if;
    if s.free_end_told_at is null and private.shop_free_until(s.id) between now() and now() + interval '30 days' then
      update public.shops set free_end_told_at = now() where id = s.id;
      perform private.notify(s.id, 'الفترة المجانية بتخلص قريب',
        'بعدها ضغطة بتاخد ' || private.fee_at(now()) || ' ج.م ثابتة على كل أوردر بيتسلّم.', '/shop/balance');
    end if;
  end loop;
end $function$;

-- ---------------------------------------------------------------- settings: the fee replaces the %
create or replace function public.set_setting(p_key text, p_value text) returns void
language plpgsql security definer set search_path = ''
as $function$
declare old text;
begin
  if not private.is_admin() then raise exception 'not allowed'; end if;
  if p_key not in ('instapay_address', 'wallet_number', 'account_name', 'bank_account', 'payment_note', 'order_fee', 'owed_limit', 'free_months', 'statement_day', 'pay_days',
                   'deposits', 'deposit_hold_hours', 'deposit_pay_hours', 'deposit_shop_share', 'visible_price')
    then raise exception 'unknown setting'; end if;
  if p_key in ('order_fee', 'owed_limit', 'free_months', 'statement_day', 'pay_days', 'deposit_hold_hours', 'deposit_pay_hours', 'deposit_shop_share', 'visible_price')
     and (p_value !~ '^[0-9]+(\.[0-9]+)?$') then raise exception 'bad number'; end if;
  if p_key = 'deposits' and p_value not in ('on', 'off') then raise exception 'bad mode'; end if;
  if p_key in ('deposit_hold_hours', 'deposit_pay_hours') and p_value::numeric < 1 then raise exception 'bad number'; end if;
  if p_key = 'deposit_shop_share' and p_value::numeric > 100 then raise exception 'bad number'; end if;
  if p_key = 'deposits' and p_value = 'on'
     and coalesce((select value from public.app_settings where key = 'instapay_address'), '') = ''
     and coalesce((select value from public.app_settings where key = 'wallet_number'), '') = ''
    then raise exception 'no way to pay deposits'; end if;
  select value into old from public.app_settings where key = p_key;
  if old is not distinct from coalesce(p_value, '') then return; end if;
  if p_key = 'order_fee' then
    -- a new fee starts 14 days after shops are told
    insert into public.commission_rates (starts_at, pct, amount, created_by) values (now() + interval '14 days', 0, p_value::numeric, auth.uid());
    insert into public.notifications (user_id, title, body, link)
    select id, 'عمولة ضغطة هتتغيّر', 'من ' || to_char((now() + interval '14 days') at time zone 'Africa/Cairo', 'DD/MM') || ' العمولة هتبقى ' || p_value || ' ج.م على كل أوردر.', '/shop/balance'
      from public.shops where status in ('approved', 'suspended');
  end if;
  insert into public.app_settings (key, value, updated_at) values (p_key, coalesce(p_value, ''), now())
  on conflict (key) do update set value = excluded.value, updated_at = now();
  perform private.log_action('setting changed', 'app_settings', p_key, to_jsonb(old), to_jsonb(p_value), '');
end $function$;

-- ---------------------------------------------------------------- the subscription = visible + featured
create or replace function public.set_shop_public(p_shop uuid, p_days int, p_note text) returns timestamptz
language plpgsql security definer set search_path = ''
as $$
declare until timestamptz;
begin
  if not private.has_role('finance') then raise exception 'not allowed'; end if;
  update public.shops
     set public_until = case when p_days > 0 then greatest(coalesce(public_until, now()), now()) + make_interval(days => p_days) end
   where id = p_shop returning public_until into until;
  update public.shops set featured_until = until where id = p_shop;
  perform private.notify(p_shop,
    case when until is not null then 'محلك ظاهر ومميّز للعملاء' else 'محلك رجع مخفي' end,
    case when until is not null then 'اسمك ورقمك وصورتك وعلامة «محل مميز» بيظهروا على كل عروضك لحد ' || to_char(until at time zone 'Africa/Cairo', 'DD/MM') || '.'
         else 'العملاء بيشوفوا اسمك ورقمك بعد ما يدفعوا العربون.' end, '/shop/balance');
  insert into public.staff_log (staff_id, action, target_type, target_id, after, reason)
  values (auth.uid(), 'shop visibility', 'shop', p_shop::text, jsonb_build_object('days', p_days, 'until', until), coalesce(p_note, ''));
  return until;
end $$;

-- ---------------------------------------------------------------- no limit on offers per part
create or replace function private.clean_quote() returns trigger
language plpgsql security definer set search_path = ''
as $function$
begin
  new.brand := left(private.mask_contacts(coalesce(new.brand, '')), 60);
  new.note := left(private.mask_contacts(coalesce(new.note, '')), 200);
  if tg_op = 'INSERT' and private.shop_owed(new.shop_id) >= private.setting_num('owed_limit', 500) then
    raise exception 'balance due';
  end if;
  return new;
end $function$;

delete from public.app_settings where key in ('commission_pct', 'deposit_flat', 'deposit_threshold', 'deposit_pct', 'deposit_cap');

-- shops already visible get the featured badge for the same time
update public.shops set featured_until = public_until where public_until > now() and (featured_until is null or featured_until < public_until);

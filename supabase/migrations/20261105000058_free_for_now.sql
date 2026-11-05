-- Owner's decision (5 Nov 2026): for now Daghta takes no money from customers or shops, and no shop is hidden.
-- Everything stays configurable, so charging or hiding can come back later from settings, without code changes:
--   order_fee   0   → no fee on new orders (dated history in commission_rates; orders before now keep their old fee)
--   deposits    off → no pickup deposit
--   hide_shops  off → every shop's name, photo and contact show on offers (change 1.35 switched off)
insert into public.commission_rates (starts_at, pct, amount) values (now(), 0, 0);
insert into public.app_settings (key, value) values ('order_fee', '0') on conflict (key) do update set value = '0', updated_at = now();
insert into public.app_settings (key, value) values ('deposits', 'off') on conflict (key) do update set value = 'off', updated_at = now();
insert into public.app_settings (key, value) values ('hide_shops', 'off') on conflict (key) do update set value = 'off', updated_at = now();

-- a shop is visible when hiding is off, or when it subscribed to be visible
create or replace function private.shop_visible(p_shop uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((select value from public.app_settings where key = 'hide_shops'), 'off') <> 'on'
      or coalesce((select public_until > now() from public.shops where id = p_shop), false)
$$;

-- don't tell shops "the free period is ending" while there is no fee to start
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
    if private.fee_at(now()) > 0 and s.free_end_told_at is null and private.shop_free_until(s.id) between now() and now() + interval '30 days' then
      update public.shops set free_end_told_at = now() where id = s.id;
      perform private.notify(s.id, 'الفترة المجانية بتخلص قريب',
        'بعدها ضغطة بتاخد ' || private.fee_at(now()) || ' ج.م ثابتة على كل أوردر بيتسلّم.', '/shop/balance');
    end if;
  end loop;
end $function$;

-- the team can switch hiding back on from settings
create or replace function public.set_setting(p_key text, p_value text) returns void
language plpgsql security definer set search_path = ''
as $function$
declare old text;
begin
  if not private.is_admin() then raise exception 'not allowed'; end if;
  if p_key not in ('instapay_address', 'wallet_number', 'account_name', 'bank_account', 'payment_note', 'order_fee', 'owed_limit', 'free_months', 'statement_day', 'pay_days',
                   'deposits', 'deposit_hold_hours', 'deposit_pay_hours', 'deposit_shop_share', 'visible_price', 'hide_shops')
    then raise exception 'unknown setting'; end if;
  if p_key in ('order_fee', 'owed_limit', 'free_months', 'statement_day', 'pay_days', 'deposit_hold_hours', 'deposit_pay_hours', 'deposit_shop_share', 'visible_price')
     and (p_value !~ '^[0-9]+(\.[0-9]+)?$') then raise exception 'bad number'; end if;
  if p_key in ('deposits', 'hide_shops') and p_value not in ('on', 'off') then raise exception 'bad mode'; end if;
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

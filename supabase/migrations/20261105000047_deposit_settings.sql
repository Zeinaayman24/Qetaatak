-- The team sets the pickup deposit rules from the management app (change 1.33). Admin only, every change recorded.
create or replace function public.set_setting(p_key text, p_value text) returns void
language plpgsql security definer set search_path = ''
as $function$
declare old text;
begin
  if not private.is_admin() then raise exception 'not allowed'; end if;
  if p_key not in ('instapay_address', 'wallet_number', 'account_name', 'bank_account', 'payment_note', 'commission_pct', 'owed_limit', 'free_months', 'statement_day', 'pay_days',
                   'deposits', 'deposit_flat', 'deposit_threshold', 'deposit_pct', 'deposit_cap', 'deposit_hold_hours', 'deposit_pay_hours', 'deposit_shop_share')
    then raise exception 'unknown setting'; end if;
  if p_key in ('commission_pct', 'owed_limit', 'free_months', 'statement_day', 'pay_days',
               'deposit_flat', 'deposit_threshold', 'deposit_pct', 'deposit_cap', 'deposit_hold_hours', 'deposit_pay_hours', 'deposit_shop_share')
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

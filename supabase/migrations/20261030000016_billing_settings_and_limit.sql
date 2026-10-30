-- Admins can switch billing between "free" and "owed" and set the commission % and the owed limit.
-- In "owed" mode a shop over the limit can't send new offers until it settles.
create or replace function public.set_setting(p_key text, p_value text) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not private.is_admin() then raise exception 'not allowed'; end if;
  if p_key not in ('instapay_address', 'wallet_number', 'account_name', 'payment_note', 'billing_mode', 'commission_pct', 'owed_limit') then raise exception 'unknown setting'; end if;
  if p_key = 'billing_mode' and p_value not in ('free', 'owed') then raise exception 'bad mode'; end if;
  if p_key in ('commission_pct', 'owed_limit') and (p_value !~ '^[0-9]+(\.[0-9]+)?$') then raise exception 'bad number'; end if;
  insert into public.app_settings (key, value, updated_at) values (p_key, coalesce(p_value, ''), now())
  on conflict (key) do update set value = excluded.value, updated_at = now();
end $$;

create or replace function private.shop_owed(p_shop uuid) returns numeric language sql stable security definer set search_path = ''
as $$
  select case when coalesce((select value from public.app_settings where key = 'billing_mode'), 'free') <> 'owed' then 0 else greatest(
    (select coalesce(sum(private.order_fee(o.items_total)), 0) from public.orders o where o.shop_id = p_shop and o.status = 'received')
    - (select coalesce(sum(amount), 0) from public.shop_settlements x where x.shop_id = p_shop and x.status = 'confirmed'), 0) end
$$;

create or replace function private.clean_quote() returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  new.brand := left(private.mask_contacts(coalesce(new.brand, '')), 60);
  new.note := left(private.mask_contacts(coalesce(new.note, '')), 200);
  if tg_op = 'INSERT' then
    if (select count(*) from public.quotes where request_id = new.request_id and shop_id = new.shop_id) >= 5 then
      raise exception 'too many offers';
    end if;
    if private.shop_owed(new.shop_id) >= coalesce((select value::numeric from public.app_settings where key = 'owed_limit'), 500) then
      raise exception 'balance due';
    end if;
  end if;
  return new;
end $$;

-- B16 «حسابك مع ضغطة»: each shop is free for N months from its own approval (6 for now; app setting 'free_months'),
-- then commission is a % of the parts price (not delivery), charged when the customer receives.
-- A returned order (marked by staff) has its commission removed. Monthly statement, pay within 7 days.

insert into public.app_settings (key, value) values ('free_months', '6') on conflict (key) do nothing;
alter table public.orders add column if not exists returned_at timestamptz;

create or replace function private.shop_free_until(p_shop uuid) returns timestamptz
language sql stable security definer set search_path = ''
as $$
  select coalesce(approved_at, created_at)
         + make_interval(months => coalesce((select value::int from public.app_settings where key = 'free_months'), 6))
    from public.shops where id = p_shop;
$$;

-- commission on one received order (0 in the free period or when returned)
create or replace function private.order_commission(o public.orders) returns numeric
language sql stable security definer set search_path = ''
as $$
  select case when o.status <> 'received' or o.returned_at is not null or o.received_at < private.shop_free_until(o.shop_id) then 0
              else private.order_fee(o.items_total) end;
$$;

create or replace function private.shop_owed(p_shop uuid) returns numeric
language sql stable security definer set search_path = ''
as $$
  select greatest(
    coalesce((select sum(private.order_commission(o)) from public.orders o where o.shop_id = p_shop and o.status = 'received'), 0)
    - coalesce((select sum(amount) from public.shop_settlements where shop_id = p_shop and status = 'confirmed'), 0), 0);
$$;

-- monthly statements (Cairo months) and when the oldest unpaid one is due (7 days after the month ends)
create or replace function private.shop_statements(p_shop uuid) returns table (month date, amount numeric)
language sql stable security definer set search_path = ''
as $$
  select date_trunc('month', o.received_at at time zone 'Africa/Cairo')::date, sum(private.order_commission(o))
    from public.orders o where o.shop_id = p_shop and o.status = 'received'
   group by 1 having sum(private.order_commission(o)) > 0 order by 1;
$$;

create or replace function private.shop_due_at(p_shop uuid) returns timestamptz
language plpgsql stable security definer set search_path = ''
as $$
declare paid numeric; m record;
begin
  select coalesce(sum(amount), 0) into paid from public.shop_settlements where shop_id = p_shop and status = 'confirmed';
  for m in select * from private.shop_statements(p_shop) loop
    if paid >= m.amount then paid := paid - m.amount;
    else return ((m.month + interval '1 month' + interval '7 days')::timestamp) at time zone 'Africa/Cairo';
    end if;
  end loop;
  return null;
end $$;

create or replace function public.my_balance() returns jsonb
language plpgsql stable security definer set search_path = ''
as $function$
declare uid uuid := auth.uid(); pct numeric; lim numeric; fees numeric; paid numeric; rows jsonb; fu timestamptz;
begin
  if uid is null or not exists (select 1 from public.shops where id = uid) then raise exception 'not allowed'; end if;
  pct := coalesce((select value::numeric from public.app_settings where key = 'commission_pct'), 5);
  lim := coalesce((select value::numeric from public.app_settings where key = 'owed_limit'), 500);
  fu := private.shop_free_until(uid);
  select coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'order_no', o.order_no, 'at', o.received_at, 'total', o.items_total,
           'fee', private.order_commission(o),
           'state', case when o.returned_at is not null then 'returned' when o.received_at < fu then 'free' else 'fee' end,
           'parts', private.order_parts(o.id)) order by o.received_at desc), '[]'::jsonb),
         coalesce(sum(private.order_commission(o)), 0)
    into rows, fees
    from public.orders o where o.shop_id = uid and o.status = 'received';
  select coalesce(sum(amount), 0) into paid from public.shop_settlements where shop_id = uid and status = 'confirmed';
  return jsonb_build_object('free_until', fu, 'free', now() < fu, 'pct', pct, 'limit', lim, 'fees', fees, 'paid', paid,
    'owed', greatest(fees - paid, 0), 'due_at', private.shop_due_at(uid), 'orders', rows,
    'statements', coalesce((select jsonb_agg(jsonb_build_object('month', month, 'amount', amount) order by month desc) from private.shop_statements(uid)), '[]'::jsonb),
    'payments', coalesce((select jsonb_agg(to_jsonb(s) order by s.created_at desc) from public.shop_settlements s where s.shop_id = uid), '[]'::jsonb));
end $function$;

-- daily: commission 30 days past due → staff decide the pause; free period ends in 30 days → tell the shop once
alter table public.shops add column if not exists free_end_told_at timestamptz;
create or replace function private.check_shop_billing() returns void
language plpgsql security definer set search_path = ''
as $$
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
        'بعدها العمولة ' || coalesce((select value from public.app_settings where key = 'commission_pct'), '5') || '٪ من سعر القطع بس.', '/shop/balance');
    end if;
  end loop;
end $$;
select cron.schedule('daghta-shop-billing', '17 7 * * *', 'select private.check_shop_billing()');

-- C07/C13: money settings (admin only, recorded), commission rate history (a new % applies 14 days
-- after shops are told and never changes past orders), balances, statements and reports.

-- ---------------------------------------------------------------- commission rate history
create table if not exists public.commission_rates (
  id bigint generated always as identity primary key,
  starts_at timestamptz not null,
  pct numeric not null check (pct >= 0 and pct <= 50),
  created_by uuid, created_at timestamptz not null default now()
);
alter table public.commission_rates enable row level security;
create policy commission_rates_read on public.commission_rates for select to authenticated using (private.is_staff());
insert into public.commission_rates (starts_at, pct)
select '2020-01-01', coalesce((select value::numeric from public.app_settings where key = 'commission_pct'), 5)
 where not exists (select 1 from public.commission_rates);

create or replace function private.rate_at(t timestamptz) returns numeric
language sql stable security definer set search_path = ''
as $$ select coalesce((select pct from public.commission_rates where starts_at <= coalesce(t, now()) order by starts_at desc limit 1), 5) $$;

create or replace function private.order_commission(o public.orders) returns numeric
language sql stable security definer set search_path = ''
as $$
  select case when o.status <> 'received' or o.returned_at is not null or o.received_at < private.shop_free_until(o.shop_id) then 0
              else round(o.items_total * private.rate_at(o.received_at) / 100) end;
$$;

-- ---------------------------------------------------------------- settings (admin only, every change recorded)
insert into public.app_settings (key, value) values ('statement_day', '1'), ('pay_days', '7'), ('bank_account', '') on conflict (key) do nothing;

create or replace function public.set_setting(p_key text, p_value text) returns void
language plpgsql security definer set search_path = ''
as $function$
declare old text;
begin
  if not private.is_admin() then raise exception 'not allowed'; end if;
  if p_key not in ('instapay_address', 'wallet_number', 'account_name', 'bank_account', 'payment_note', 'commission_pct', 'owed_limit', 'free_months', 'statement_day', 'pay_days')
    then raise exception 'unknown setting'; end if;
  if p_key in ('commission_pct', 'owed_limit', 'free_months', 'statement_day', 'pay_days') and (p_value !~ '^[0-9]+(\.[0-9]+)?$') then raise exception 'bad number'; end if;
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

-- ---------------------------------------------------------------- balances per shop (finance)
create or replace function public.staff_balances() returns table (shop_id uuid, name text, orders bigint, commission numeric, removed numeric, paid numeric, owed numeric, free_until timestamptz)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.has_role('finance') then raise exception 'not allowed'; end if;
  return query
  select s.id, sp.name,
         (select count(*) from public.orders o where o.shop_id = s.id and o.status = 'received'),
         coalesce((select sum(private.order_commission(o)) from public.orders o where o.shop_id = s.id and o.status = 'received'), 0),
         coalesce((select sum(round(o.items_total * private.rate_at(o.received_at) / 100)) from public.orders o
                    where o.shop_id = s.id and o.status = 'received' and o.returned_at is not null and o.received_at >= private.shop_free_until(s.id)), 0),
         coalesce((select sum(amount) from public.shop_settlements x where x.shop_id = s.id and x.status = 'confirmed'), 0),
         private.shop_owed(s.id), private.shop_free_until(s.id)
    from public.shops s left join public.shop_private sp on sp.id = s.id
   where s.status not in ('draft');
end $$;

-- monthly statements across shops: due, paid (oldest month first), late
create or replace function public.staff_statements() returns table (month date, shops bigint, due numeric, paid numeric, late numeric)
language plpgsql security definer set search_path = ''
as $$
declare sh record; m record; left_ numeric; pay_days int := coalesce((select value::int from public.app_settings where key = 'pay_days'), 7);
begin
  if not private.has_role('finance') then raise exception 'not allowed'; end if;
  create temp table if not exists _st (month date, shop uuid, due numeric, paid numeric) on commit drop;
  delete from _st;
  for sh in select id from public.shops loop
    select coalesce(sum(amount), 0) into left_ from public.shop_settlements where shop_id = sh.id and status = 'confirmed';
    for m in select * from private.shop_statements(sh.id) loop
      insert into _st values (m.month, sh.id, m.amount, least(left_, m.amount));
      left_ := greatest(left_ - m.amount, 0);
    end loop;
  end loop;
  return query select s.month, count(distinct s.shop), sum(s.due), sum(s.paid),
    sum(case when (s.month + interval '1 month' + make_interval(days => pay_days)) < now() then s.due - s.paid else 0 end)
    from _st s group by s.month order by s.month desc;
end $$;

-- statement lines for one month (Excel export)
create or replace function public.staff_statement_lines(p_month date) returns table (shop text, amount numeric, owed_now numeric)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.has_role('finance') then raise exception 'not allowed'; end if;
  return query select sp.name, st.amount, private.shop_owed(s.id)
    from public.shops s join public.shop_private sp on sp.id = s.id
    cross join lateral private.shop_statements(s.id) st where st.month = p_month order by st.amount desc;
end $$;

create or replace function public.staff_send_statements() returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not private.has_role('finance') then raise exception 'not allowed'; end if;
  perform private.send_statements();
  perform private.log_action('statements sent', 'statements', to_char(now(), 'YYYY-MM'), null, null, '');
end $$;

-- ---------------------------------------------------------------- reports (C13)
alter table public.ads add column if not exists amount numeric not null default 0 check (amount >= 0),
  add column if not exists advertiser_phone text not null default '',
  add column if not exists advertiser_business text not null default '';

create or replace function public.staff_report(p_from timestamptz, p_to timestamptz) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.has_role('finance') then raise exception 'not allowed'; end if;
  return (
  with o as (select * from public.orders where created_at >= p_from and created_at < p_to),
       rcv as (select * from o where status = 'received'),
       r as (select * from public.requests where created_at >= p_from and created_at < p_to),
       firsts as (select r.id, (select min(q.created_at) from public.quotes q where q.request_id = r.id) - r.created_at as wait from r)
  select jsonb_build_object(
    'income', jsonb_build_object(
      'commission', (select coalesce(sum(private.order_commission(x)), 0) from public.orders x where x.status = 'received' and x.received_at >= p_from and x.received_at < p_to),
      'featured', (select coalesce(sum(amount), 0) from public.featured_payments where created_at >= p_from and created_at < p_to),
      'ads', (select coalesce(sum(amount), 0) from public.ads where created_at >= p_from and created_at < p_to)),
    'market', jsonb_build_object(
      'sales', (select coalesce(sum(items_total), 0) from rcv),
      'orders', (select count(*) from o),
      'avg_order', (select round(avg(items_total)) from rcv),
      'with_offer_pct', (select case when count(*) = 0 then null else round(100.0 * count(*) filter (where wait is not null) / count(*)) end from firsts),
      'to_order_pct', (select case when count(*) = 0 then null else round(100.0 * count(*) filter (where status in ('chosen', 'done')) / count(*)) end from r),
      'refusal_pct', (select case when count(*) = 0 then null else round(100.0 * count(*) filter (where refused_at is not null) / count(*)) end from o where status <> 'preparing'),
      'first_reply_median_min', (select round(extract(epoch from percentile_cont(0.5) within group (order by wait)) / 60) from firsts where wait is not null)),
    'by_governorate', (select coalesce(jsonb_agg(jsonb_build_object('k', k, 'orders', n, 'sales', v) order by v desc), '[]'::jsonb) from (
        select s.governorate k, count(*) n, sum(rcv.items_total) v from rcv join public.shops s on s.id = rcv.shop_id group by 1) t),
    'by_make', (select coalesce(jsonb_agg(jsonb_build_object('k', k, 'requests', n) order by n desc), '[]'::jsonb) from (
        select car_make k, count(*) n from r group by 1) t),
    'by_part', (select coalesce(jsonb_agg(jsonb_build_object('k', k, 'requests', n) order by n desc), '[]'::jsonb) from (
        select part k, count(*) n from r group by 1 order by 2 desc limit 15) t),
    'top_shops', (select coalesce(jsonb_agg(jsonb_build_object('k', k, 'orders', n, 'sales', v) order by v desc), '[]'::jsonb) from (
        select sp.name k, count(*) n, sum(rcv.items_total) v from rcv join public.shop_private sp on sp.id = rcv.shop_id group by 1 order by 3 desc limit 10) t)));
end $$;

revoke execute on function public.staff_balances(), public.staff_statements(), public.staff_statement_lines(date), public.staff_send_statements(),
  public.staff_report(timestamptz, timestamptz) from public, anon;
grant execute on function public.staff_balances(), public.staff_statements(), public.staff_statement_lines(date), public.staff_send_statements(),
  public.staff_report(timestamptz, timestamptz) to authenticated;

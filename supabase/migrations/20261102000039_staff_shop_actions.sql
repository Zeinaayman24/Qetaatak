-- C04/C06: staff shop actions with reasons, roles and the change log.

create table if not exists public.featured_payments (
  id bigint generated always as identity primary key,
  shop_id uuid not null references public.shops(id) on delete cascade,
  starts_on date not null, ends_on date not null, amount numeric not null default 0 check (amount >= 0),
  created_by uuid, created_at timestamptz not null default now()
);
alter table public.featured_payments enable row level security;
create policy featured_payments_read on public.featured_payments for select to authenticated using (private.is_staff());

-- the shop page for staff: measures, money, documents (paths), history
create or replace function public.staff_shop(p_shop uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.is_staff() then raise exception 'not allowed'; end if;
  return jsonb_build_object(
    'metrics', private.shop_metrics(p_shop),
    'owed', private.shop_owed(p_shop),
    'limit', coalesce((select value::numeric from public.app_settings where key = 'owed_limit'), 500),
    'free_until', private.shop_free_until(p_shop),
    'last_payment', (select jsonb_build_object('amount', amount, 'at', created_at) from public.shop_settlements where shop_id = p_shop and status = 'confirmed' order by created_at desc limit 1),
    'docs', (select jsonb_build_object('id_front', doc_id_front, 'id_back', doc_id_back, 'register', doc_register, 'tax', doc_tax, 'payout_name', payout_name) from public.shop_private where id = p_shop),
    'featured', (select coalesce(jsonb_agg(to_jsonb(f) order by f.created_at desc), '[]'::jsonb) from public.featured_payments f where f.shop_id = p_shop),
    'history', (select coalesce(jsonb_agg(jsonb_build_object('at', l.at, 'who', p.full_name, 'action', l.action, 'reason', l.reason, 'after', l.after) order by l.at desc), '[]'::jsonb)
                  from (select * from public.staff_log where target_id = p_shop::text order by at desc limit 50) l left join public.profiles p on p.id = l.staff_id));
end $$;

-- decisions on a new shop (shop review role)
create or replace function public.staff_shop_decide(p_shop uuid, p_decision text, p_reason text) returns void
language plpgsql security definer set search_path = ''
as $$
declare s record;
begin
  if not private.has_role('review') then raise exception 'not allowed'; end if;
  select * into s from public.shops where id = p_shop for update;
  if s.id is null then raise exception 'not allowed'; end if;
  if p_decision = 'approve' then
    update public.shops set status = 'approved', review_note = '' where id = p_shop;
  elsif p_decision = 'changes' then
    if coalesce(trim(p_reason), '') = '' then raise exception 'reason needed'; end if;
    update public.shops set status = 'changes', review_note = left(p_reason, 500) where id = p_shop;
    perform private.notify(p_shop, 'محتاجين تعديل في بيانات المحل', left(p_reason, 140), '/shop-setup');
  elsif p_decision = 'reject' then
    if coalesce(trim(p_reason), '') = '' then raise exception 'reason needed'; end if;
    update public.shops set status = 'closed', accepting = false, review_note = 'اترفض: ' || left(p_reason, 480) where id = p_shop;
  else raise exception 'bad decision'; end if;
  perform private.log_action('shop ' || p_decision, 'shops', p_shop::text, jsonb_build_object('status', s.status), null, p_reason);
end $$;

-- pause / reopen / close / warn on a working shop
create or replace function public.staff_shop_status(p_shop uuid, p_action text, p_reason text, p_reopen_step text) returns void
language plpgsql security definer set search_path = ''
as $$
declare s record;
begin
  if p_action = 'close' then
    if not private.is_admin() then raise exception 'not allowed'; end if;
  elsif not private.has_role('review') then raise exception 'not allowed'; end if;
  select * into s from public.shops where id = p_shop for update;
  if s.id is null then raise exception 'not allowed'; end if;
  if p_action = 'pause' then
    if coalesce(trim(p_reason), '') = '' then raise exception 'reason needed'; end if;
    update public.shops set status = 'suspended', suspend_reason = left(p_reason, 300), reopen_step = left(coalesce(p_reopen_step, ''), 300) where id = p_shop;
  elsif p_action = 'reopen' then
    update public.shops set status = 'approved' where id = p_shop and status = 'suspended';
  elsif p_action = 'close' then
    if coalesce(trim(p_reason), '') = '' then raise exception 'reason needed'; end if;
    update public.shops set status = 'closed', accepting = false, review_note = left(p_reason, 500) where id = p_shop;
    perform private.notify(p_shop, 'المحل اتقفل', 'المحل اتقفل بسبب مخالفة اتفاقية التاجر. لو شايف إن ده غلط، اكتبلنا.', '/shop/performance');
  elsif p_action = 'warn' then
    if coalesce(trim(p_reason), '') = '' then raise exception 'reason needed'; end if;
    perform private.notify(p_shop, 'تنبيه على أداء المحل', left(p_reason, 200), '/shop/performance');
    update public.shops set perf_warned_at = now() where id = p_shop;
  else raise exception 'bad action'; end if;
  update public.staff_tasks set done_at = now(), done_by = auth.uid() where kind = 'shop_pause' and ref = p_shop::text and done_at is null and p_action in ('pause', 'warn', 'close');
  perform private.log_action('shop ' || p_action, 'shops', p_shop::text, jsonb_build_object('status', s.status), null, coalesce(p_reason, '') || coalesce(' · ' || nullif(p_reopen_step, ''), ''));
end $$;

-- featured shop with dates and the amount paid (finance)
create or replace function public.staff_set_featured(p_shop uuid, p_from date, p_to date, p_amount numeric) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not private.has_role('finance') then raise exception 'not allowed'; end if;
  if p_to is null then
    update public.shops set featured_until = null where id = p_shop;
    perform private.log_action('featured removed', 'shops', p_shop::text, null, null, '');
    return;
  end if;
  if p_from is null or p_to < p_from or coalesce(p_amount, -1) < 0 then raise exception 'bad input'; end if;
  insert into public.featured_payments (shop_id, starts_on, ends_on, amount, created_by) values (p_shop, p_from, p_to, p_amount, auth.uid());
  update public.shops set featured_until = ((p_to + 1)::timestamp at time zone 'Africa/Cairo') where id = p_shop;
  perform private.log_action('featured set', 'shops', p_shop::text, null, jsonb_build_object('from', p_from, 'to', p_to, 'amount', p_amount), '');
end $$;

-- «نبّه المحلات»: re-notify the shops for this make about a request waiting over 30 minutes (support)
create or replace function public.staff_nudge_shops(p_request uuid) returns int
language plpgsql security definer set search_path = ''
as $$
declare r record; n int;
begin
  if not private.has_role('support') then raise exception 'not allowed'; end if;
  select * into r from public.requests where id = p_request and status = 'open';
  if r.id is null then raise exception 'request is closed'; end if;
  insert into public.notifications (user_id, title, body, link)
  select s.id, 'طلب جديد: ' || r.part, r.car_make || ' ' || r.car_model || ' ' || r.car_year || ' · ' || r.area, '/shop/' || r.id
    from public.shops s
   where s.status = 'approved' and s.accepting and (r.car_make = any (s.brands) or cardinality(s.brands) = 0)
     and not exists (select 1 from public.quotes q where q.request_id = r.id and q.shop_id = s.id)
     and not exists (select 1 from public.declines d where d.request_id = r.id and d.shop_id = s.id);
  get diagnostics n = row_count;
  perform private.log_action('nudge shops', 'requests', p_request::text, null, jsonb_build_object('shops', n), '');
  return n;
end $$;

-- shop list numbers for staff: commission due and recent warning
create or replace function public.staff_shop_numbers() returns table (shop_id uuid, owed numeric, warned boolean)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.is_staff() then raise exception 'not allowed'; end if;
  return query select s.id, private.shop_owed(s.id), coalesce(s.perf_warned_at > now() - interval '30 days', false) from public.shops s;
end $$;

revoke execute on function public.staff_shop(uuid), public.staff_shop_decide(uuid, text, text), public.staff_shop_status(uuid, text, text, text),
  public.staff_set_featured(uuid, date, date, numeric), public.staff_nudge_shops(uuid), public.staff_shop_numbers() from public, anon;
grant execute on function public.staff_shop(uuid), public.staff_shop_decide(uuid, text, text), public.staff_shop_status(uuid, text, text, text),
  public.staff_set_featured(uuid, date, date, numeric), public.staff_nudge_shops(uuid), public.staff_shop_numbers() to authenticated;

-- Phase 4 (C01, C02, C10, C11): staff roles, two-step login required on the server,
-- a change log that can't be edited, and the «المهام» queue.

-- ---------------------------------------------------------------- roles
alter table public.profiles add column if not exists staff_role text
  check (staff_role in ('admin', 'support', 'review', 'finance'));
update public.profiles set staff_role = case when is_admin then 'admin' when is_support then 'support' end
 where staff_role is null and (is_admin or is_support);

-- staff powers need a staff role (the two-step sign-in requirement is switched on in migration 37,
-- after the management app's new sign-in is live)
create or replace function private.is_staff() returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((select is_admin or is_support or staff_role is not null from public.profiles where id = auth.uid()), false);
$$;
create or replace function private.is_admin() returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((select is_admin or staff_role = 'admin' from public.profiles where id = auth.uid()), false);
$$;
create or replace function private.has_role(p_role text) returns boolean
language sql stable security definer set search_path = ''
as $$
  select private.is_staff() and coalesce((select is_admin or staff_role in ('admin', p_role) from public.profiles where id = auth.uid()), false);
$$;
-- the app reads its own role (any signed-in user, own row only)
create or replace function public.my_staff_role() returns text
language sql stable security definer set search_path = ''
as $$ select case when is_admin then 'admin' else staff_role end from public.profiles where id = auth.uid() $$;

-- ---------------------------------------------------------------- change log (append-only)
create table if not exists public.staff_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  staff_id uuid,
  action text not null,
  target_type text not null default '',
  target_id text not null default '',
  before jsonb,
  after jsonb,
  reason text not null default ''
);
alter table public.staff_log enable row level security;
create policy staff_log_admin_read on public.staff_log for select to authenticated using (private.is_admin());
revoke insert, update, delete, truncate on public.staff_log from authenticated, anon;
create index if not exists staff_log_at_idx on public.staff_log (at desc);
create index if not exists staff_log_target_idx on public.staff_log (target_type, target_id);

create or replace function private.log_action(p_action text, p_type text, p_id text, p_before jsonb, p_after jsonb, p_reason text)
returns void language sql security definer set search_path = ''
as $$ insert into public.staff_log (staff_id, action, target_type, target_id, before, after, reason)
      values (auth.uid(), p_action, coalesce(p_type, ''), coalesce(p_id, ''), p_before, p_after, coalesce(p_reason, '')) $$;

-- staff record things they look at (chat opened, phone shown, document opened)
create or replace function public.staff_log_view(p_action text, p_type text, p_id text, p_reason text) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not private.is_staff() then raise exception 'not allowed'; end if;
  if p_action not in ('phone_shown', 'chat_opened', 'document_opened') then raise exception 'bad action'; end if;
  perform private.log_action(p_action, p_type, p_id, null, null, p_reason);
end $$;

-- every change a staff member makes to someone else's data is recorded automatically
create or replace function private.audit_row() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare owner uuid; b jsonb; a jsonb; k text;
begin
  if auth.uid() is null or not private.is_staff() then return coalesce(new, old); end if;
  b := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  a := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  owner := case when tg_table_name in ('profiles', 'shops', 'shop_private') then (coalesce(a, b) ->> 'id')::uuid end;
  if owner = auth.uid() then return coalesce(new, old); end if;
  -- keep only the fields that changed
  if b is not null and a is not null then
    for k in select jsonb_object_keys(a) loop
      if a -> k = b -> k then a := a - k; b := b - k; end if;
    end loop;
    if a = '{}'::jsonb then return new; end if;
  end if;
  perform private.log_action(lower(tg_op) || ' ' || tg_table_name, tg_table_name, coalesce(a ->> 'id', b ->> 'id', a ->> 'key', b ->> 'key', ''), b, a, '');
  return coalesce(new, old);
end $$;
do $$
declare t text;
begin
  foreach t in array array['profiles', 'shops', 'shop_private', 'orders', 'app_settings', 'ads', 'shop_settlements', 'reports'] loop
    execute format('create or replace trigger %I after insert or update or delete on public.%I for each row execute function private.audit_row()', 'audit_' || t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------- working days (Egypt: Friday and Saturday off)
create or replace function private.add_workdays(t timestamptz, n int) returns timestamptz
language plpgsql stable set search_path = ''
as $$
declare d timestamptz := t; left_ int := n;
begin
  while left_ > 0 loop
    d := d + interval '1 day';
    if extract(dow from d at time zone 'Africa/Cairo') not in (5, 6) then left_ := left_ - 1; end if;
  end loop;
  return d;
end $$;

-- ---------------------------------------------------------------- tasks
-- event tasks (pause level, payment details changed, disputes, fraud flags…); deadline-driven ones are computed live
create table if not exists public.staff_tasks (
  id bigint generated always as identity primary key,
  kind text not null,
  ref text not null,
  title text not null,
  details text not null default '',
  link text not null default '',
  due_at timestamptz not null,
  created_at timestamptz not null default now(),
  done_at timestamptz,
  done_by uuid
);
create unique index if not exists staff_tasks_open_uq on public.staff_tasks (kind, ref) where done_at is null;
alter table public.staff_tasks enable row level security;
create policy staff_tasks_read on public.staff_tasks for select to authenticated using (private.is_staff());

create table if not exists public.task_claims (
  kind text not null, ref text not null, staff_id uuid not null references public.profiles(id) on delete cascade,
  at timestamptz not null default now(), primary key (kind, ref)
);
alter table public.task_claims enable row level security;
create policy task_claims_read on public.task_claims for select to authenticated using (private.is_staff());

create or replace function private.add_task(p_kind text, p_ref text, p_title text, p_details text, p_link text, p_due timestamptz)
returns void language sql security definer set search_path = ''
as $$ insert into public.staff_tasks (kind, ref, title, details, link, due_at) values (p_kind, p_ref, p_title, coalesce(p_details, ''), coalesce(p_link, ''), p_due)
      on conflict (kind, ref) where done_at is null do nothing $$;

create or replace function public.staff_task_list() returns table (
  kind text, ref text, title text, details text, link text, due_at timestamptz, assigned_to uuid, assigned_name text, task_id bigint)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.is_staff() then raise exception 'not allowed'; end if;
  return query
  with t as (
    select 'chat'::text k, r.id::text rf, 'محادثة مستنية موظف'::text ti, ('T-' || r.ticket_no || ' · ' || left(r.body, 60)) dt, ('/tickets/' || r.id) ln,
           coalesce(r.escalated_at, r.created_at) + interval '15 minutes' du, r.assigned_to asg, null::bigint tid
      from public.reports r where r.status = 'open'
    union all
    select 'transfer', o.id::text, 'تحويل مااتأكدش من المحل', '#' || o.order_no || ' · ' || (o.items_total + o.delivery_fee) || ' ج.م', '/orders/' || o.id,
           o.updated_at + interval '2 hours', null, null from public.orders o where o.payment_status = 'review'
    union all
    select 'refund', o.id::text, 'استرجاع متأخر من المحل', '#' || o.order_no || ' · ' || (o.items_total + o.delivery_fee) || ' ج.م', '/orders/' || o.id,
           coalesce(o.refund_due_at, o.updated_at) + interval '48 hours', null, null from public.orders o where o.payment_status = 'refund_due'
    union all
    select 'shop_review', s.id::text, 'محل مستني مراجعة', coalesce(sp.name, '') || ' · ' || s.area, '/shops/' || s.id,
           private.add_workdays(coalesce(s.submitted_at, s.created_at), 2), null, null
      from public.shops s left join public.shop_private sp on sp.id = s.id where s.status = 'pending'
    union all
    select 'settlement', st.id::text, 'دفع عمولة مستني تأكيد', coalesce(sp.name, '') || ' · ' || st.amount || ' ج.م', '/payments',
           private.add_workdays(st.created_at, 1), null, null
      from public.shop_settlements st left join public.shop_private sp on sp.id = st.shop_id where st.status = 'pending'
    union all
    select 'data_copy', d.id::text, 'طلب نسخة بيانات', coalesce(p.full_name, ''), '/customers/' || d.user_id, d.due_at, null, null
      from public.data_requests d left join public.profiles p on p.id = d.user_id where d.kind = 'copy' and d.status = 'open'
    union all
    select x.kind, x.ref, x.title, x.details, x.link, x.due_at, null, x.id from public.staff_tasks x where x.done_at is null
  )
  select t.k, t.rf, t.ti, t.dt, t.ln, t.du, coalesce(t.asg, c.staff_id), p.full_name, t.tid
    from t left join public.task_claims c on c.kind = t.k and c.ref = t.rf
    left join public.profiles p on p.id = coalesce(t.asg, c.staff_id)
   order by t.du;
end $$;

create or replace function public.claim_task(p_kind text, p_ref text) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not private.is_staff() then raise exception 'not allowed'; end if;
  insert into public.task_claims (kind, ref, staff_id) values (p_kind, p_ref, auth.uid())
  on conflict (kind, ref) do update set staff_id = excluded.staff_id, at = now();
  perform private.log_action('claim task', p_kind, p_ref, null, null, '');
end $$;

create or replace function public.finish_task(p_id bigint, p_note text) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not private.is_staff() then raise exception 'not allowed'; end if;
  update public.staff_tasks set done_at = now(), done_by = auth.uid() where id = p_id and done_at is null;
  perform private.log_action('finish task', 'task', p_id::text, null, null, p_note);
end $$;

-- «النهارده» strip on the tasks page
create or replace function public.staff_today() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare day0 timestamptz := (date_trunc('day', now() at time zone 'Africa/Cairo')) at time zone 'Africa/Cairo';
begin
  if not private.is_staff() then raise exception 'not allowed'; end if;
  return jsonb_build_object(
    'requests', (select count(distinct coalesce(batch_id::text, id::text)) from public.requests where created_at >= day0),
    'orders', (select count(*) from public.orders where created_at >= day0),
    'sales', (select coalesce(sum(items_total), 0) from public.orders where status = 'received' and received_at >= day0),
    'commission', (select coalesce(sum(private.order_commission(o)), 0) from public.orders o where o.status = 'received' and o.received_at >= day0),
    'with_offer_pct', (select case when count(*) = 0 then null else round(100.0 * count(*) filter (where exists (select 1 from public.quotes q where q.request_id = r.id)) / count(*)) end
                         from public.requests r where r.created_at >= day0),
    'shops_open', (select count(*) from public.shops s where s.status = 'approved' and s.accepting and private.shop_next_open(s.id, now()) = now()));
end $$;

-- event tasks from the rules built in Phase 3
do $do$
declare d text;
begin
  d := pg_get_functiondef('private.check_shop_performance()'::regprocedure);
  d := replace(d, 'perform private.notify_staff(''محل وصل لحد الإيقاف'', s.name || '' · '' || pause, ''/manage'');',
    'perform private.notify_staff(''محل وصل لحد الإيقاف'', s.name || '' · '' || pause, ''/manage'');
      perform private.add_task(''shop_pause'', s.id::text, ''محل وصل لحد الإيقاف'', s.name || '' · '' || pause, ''/shops/'' || s.id, private.add_workdays(now(), 1));');
  execute d;
  d := pg_get_functiondef('private.on_payout_change()'::regprocedure);
  d := replace(d, 'perform private.notify_staff(''محل غيّر بيانات التحويل'', new.name, ''/manage'');',
    'perform private.notify_staff(''محل غيّر بيانات التحويل'', new.name, ''/manage'');
    perform private.add_task(''payout_changed'', new.id::text || '':'' || extract(epoch from now())::bigint, ''غيّر بيانات التحويل'', new.name, ''/shops/'' || new.id,
      ((date_trunc(''day'', now() at time zone ''Africa/Cairo'') + interval ''22 hours'') at time zone ''Africa/Cairo''));');
  execute d;
end $do$;

revoke execute on function public.staff_log_view(text, text, text, text), public.staff_task_list(), public.claim_task(text, text),
  public.finish_task(bigint, text), public.staff_today(), public.my_staff_role() from public, anon;
grant execute on function public.staff_log_view(text, text, text, text), public.staff_task_list(), public.claim_task(text, text),
  public.finish_task(bigint, text), public.staff_today(), public.my_staff_role() to authenticated;

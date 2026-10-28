-- Management system: member IDs, staff (admin + customer service), blocking, ticketing.

-- ---------------------------------------------------------------- IDs and staff flags
alter table public.profiles
  add column member_no  bigint generated always as identity (start with 10001),
  add column is_support boolean not null default false,
  add column is_blocked boolean not null default false;
create unique index profiles_member_no_idx on public.profiles (member_no);

create or replace function private.is_staff()
returns boolean language sql stable security definer set search_path = ''
as $$ select coalesce((select is_admin or is_support from public.profiles where id = auth.uid()), false) $$;

create or replace function private.is_blocked()
returns boolean language sql stable security definer set search_path = ''
as $$ select coalesce((select is_blocked from public.profiles where id = auth.uid()), false) $$;

-- only admins change staff/admin/blocked flags
create or replace function public.guard_profile()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if current_user = 'authenticated' and not private.is_admin() and (
       new.is_admin is distinct from old.is_admin
    or new.is_support is distinct from old.is_support
    or new.is_blocked is distinct from old.is_blocked) then
    raise exception 'not allowed';
  end if;
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------- staff can read (customer service needs the full picture)
drop policy profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or private.is_staff() or private.is_chosen_shop_of_customer(id));

drop policy shop_private_select on public.shop_private;
create policy shop_private_select on public.shop_private for select to authenticated
  using (id = (select auth.uid()) or private.is_staff() or private.chose_shop(id));

drop policy requests_select on public.requests;
create policy requests_select on public.requests for select to authenticated
  using (customer_id = (select auth.uid()) or private.is_approved_shop() or private.is_staff());

drop policy quotes_select on public.quotes;
create policy quotes_select on public.quotes for select to authenticated
  using (shop_id = (select auth.uid()) or private.request_customer(request_id) = (select auth.uid()) or private.is_staff());

drop policy messages_select on public.messages;
create policy messages_select on public.messages for select to authenticated
  using (shop_id = (select auth.uid()) or private.request_customer(request_id) = (select auth.uid()) or private.is_staff());

create policy cars_staff_select on public.cars for select to authenticated using (private.is_staff());

-- blocked accounts can't create requests, quotes or messages
drop policy requests_insert on public.requests;
create policy requests_insert on public.requests for insert to authenticated
  with check (customer_id = (select auth.uid()) and status = 'open' and chosen_quote_id is null and rating is null
              and not private.is_blocked()
              and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.is_customer));
drop policy quotes_insert on public.quotes;
create policy quotes_insert on public.quotes for insert to authenticated
  with check (shop_id = (select auth.uid()) and private.is_approved_shop() and not private.is_blocked());
drop policy messages_insert on public.messages;
create policy messages_insert on public.messages for insert to authenticated
  with check (
    sender_id = (select auth.uid()) and not private.is_blocked() and (
      (shop_id = (select auth.uid()) and private.is_approved_shop())
      or (private.request_customer(request_id) = (select auth.uid())
          and exists (select 1 from public.quotes q where q.request_id = messages.request_id and q.shop_id = messages.shop_id))
    ));

-- ---------------------------------------------------------------- tickets (reports)
alter table public.reports drop constraint reports_status_check;
alter table public.reports
  add column ticket_no   bigint generated always as identity (start with 1001),
  add column priority    text not null default 'normal' check (priority in ('low', 'normal', 'high')),
  add column assigned_to uuid references public.profiles (id) on delete set null,
  add column updated_at  timestamptz not null default now(),
  add constraint reports_status_check check (status in ('open', 'in_progress', 'resolved'));
create unique index reports_ticket_no_idx on public.reports (ticket_no);

drop policy reports_select on public.reports;
create policy reports_select on public.reports for select to authenticated
  using (reporter_id = (select auth.uid()) or private.is_staff());
drop policy reports_admin_update on public.reports;
create policy reports_staff_update on public.reports for update to authenticated
  using (private.is_staff()) with check (private.is_staff());

create table public.ticket_messages (
  id         uuid primary key default gen_random_uuid(),
  report_id  uuid not null references public.reports (id) on delete cascade,
  sender_id  uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  body       text not null check (char_length(body) between 1 and 2000),
  internal   boolean not null default false,
  created_at timestamptz not null default now()
);
create index ticket_messages_report_idx on public.ticket_messages (report_id, created_at);
alter table public.ticket_messages enable row level security;

create or replace function private.report_owner(rep uuid)
returns uuid language sql stable security definer set search_path = ''
as $$ select reporter_id from public.reports where id = rep $$;

create policy ticket_messages_select on public.ticket_messages for select to authenticated
  using (private.is_staff() or (private.report_owner(report_id) = (select auth.uid()) and not internal));
create policy ticket_messages_insert on public.ticket_messages for insert to authenticated
  with check (sender_id = (select auth.uid()) and (
    private.is_staff() or (private.report_owner(report_id) = (select auth.uid()) and not internal)));

-- notifications for customer service
create or replace function private.on_report_insert() returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.notifications (user_id, title, body, link)
  select p.id, 'شكوى جديدة T-' || new.ticket_no, left(new.body, 120), '' from public.profiles p where p.is_admin or p.is_support;
  return new;
end $$;
create trigger reports_notify_insert after insert on public.reports for each row execute function private.on_report_insert();

create or replace function private.on_ticket_message() returns trigger language plpgsql security definer set search_path = ''
as $$
declare rep record;
begin
  select * into rep from public.reports where id = new.report_id;
  update public.reports set updated_at = now() where id = new.report_id;
  if new.internal then return new; end if;
  if new.sender_id = rep.reporter_id then
    -- the customer or shop replied: tell the assigned agent, or all staff, and reopen if resolved
    if rep.status = 'resolved' then update public.reports set status = 'open', resolved_at = null where id = rep.id; end if;
    insert into public.notifications (user_id, title, body, link)
    select p.id, 'ردّ على T-' || rep.ticket_no, left(new.body, 120), '' from public.profiles p
    where (rep.assigned_to is not null and p.id = rep.assigned_to) or (rep.assigned_to is null and (p.is_admin or p.is_support));
  else
    perform private.notify(rep.reporter_id, 'ردّ خدمة العملاء · T-' || rep.ticket_no, left(new.body, 120), '/support');
  end if;
  return new;
end $$;
create trigger ticket_messages_notify after insert on public.ticket_messages for each row execute function private.on_ticket_message();

-- old single-reply notification no longer needed (replies are ticket messages now)
drop trigger reports_notify on public.reports;

create or replace function private.on_report_status() returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.status = 'resolved' and old.status <> 'resolved' then
    perform private.notify(new.reporter_id, 'شكوتك T-' || new.ticket_no || ' اتحلّت', 'لو المشكلة لسه موجودة رد على الشكوى.', '/support');
  end if;
  return new;
end $$;
create trigger reports_notify_status after update of status on public.reports for each row execute function private.on_report_status();

-- the reporter may write in the app; staff threads stay on staff tools
revoke execute on all functions in schema private from public, anon;
grant execute on function private.is_admin(), private.is_staff(), private.is_blocked(), private.is_approved_shop(),
  private.is_chosen_shop_of_customer(uuid), private.chose_shop(uuid), private.request_customer(uuid), private.report_owner(uuid) to authenticated;

alter publication supabase_realtime add table public.reports, public.ticket_messages;

-- One conversation per complaint: the assistant handles it first, and when it can't solve it,
-- hands the same chat to a customer-service agent, who continues it until the chat is ended.
--
-- Ticket status:  bot (assistant handling) → open (escalated, waiting for an agent)
--                 → in_progress (an agent took the chat) → resolved (chat ended)
-- Message kind:   user (a person: the reporter or an agent) · bot (the assistant) · system (events)

alter table public.reports drop constraint reports_status_check;
alter table public.reports
  add constraint reports_status_check check (status in ('bot', 'open', 'in_progress', 'resolved')),
  add column escalated_at timestamptz,
  add column resolved_by text check (resolved_by in ('bot', 'agent', 'customer'));

alter table public.ticket_messages
  add column kind text not null default 'user' check (kind in ('user', 'bot', 'system'));

create or replace function private.report_status(rep uuid)
returns text language sql stable security definer set search_path = ''
as $$ select status from public.reports where id = rep $$;
revoke execute on function private.report_status(uuid) from public, anon;
grant execute on function private.report_status(uuid) to authenticated;

-- Reporters open a chat with the assistant ('bot') or straight to people ('open').
drop policy reports_insert on public.reports;
create policy reports_insert on public.reports for insert to authenticated
  with check (reporter_id = (select auth.uid()) and status in ('bot', 'open') and admin_reply = ''
              and assigned_to is null and resolved_by is null and not private.is_blocked());

-- Reporters write while the chat is live; the assistant's lines are only accepted while it is handling the chat.
drop policy ticket_messages_insert on public.ticket_messages;
create policy ticket_messages_insert on public.ticket_messages for insert to authenticated
  with check (sender_id = (select auth.uid()) and (
    (private.is_staff() and kind in ('user', 'system'))
    or (private.report_owner(report_id) = (select auth.uid()) and not internal
        and private.report_status(report_id) <> 'resolved'
        and (kind = 'user' or (kind = 'bot' and private.report_status(report_id) = 'bot')))));

-- Staff hear about a ticket when it reaches people, not while the assistant is handling it.
create or replace function private.on_report_insert() returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.status = 'open' then
    insert into public.notifications (user_id, title, body, link)
    select p.id, 'شكوى جديدة T-' || new.ticket_no, left(new.body, 120), '' from public.profiles p where p.is_admin or p.is_support;
  end if;
  return new;
end $$;

create or replace function private.on_ticket_message() returns trigger language plpgsql security definer set search_path = ''
as $$
declare rep record;
begin
  select * into rep from public.reports where id = new.report_id;
  update public.reports set updated_at = now() where id = new.report_id;
  if new.internal or new.kind = 'bot' then return new; end if;
  if new.sender_id = rep.reporter_id then
    if new.kind = 'user' and rep.status in ('open', 'in_progress') then
      insert into public.notifications (user_id, title, body, link)
      select p.id, 'رسالة في T-' || rep.ticket_no, left(new.body, 120), '' from public.profiles p
      where (rep.assigned_to is not null and p.id = rep.assigned_to) or (rep.assigned_to is null and (p.is_admin or p.is_support));
    end if;
  elsif new.kind = 'user' then
    perform private.notify(rep.reporter_id, 'خدمة العملاء ردّت · T-' || rep.ticket_no, left(new.body, 120), '/assistant?ticket=' || rep.id);
  end if;
  return new;
end $$;

create or replace function private.on_report_status() returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.status = 'resolved' and old.status <> 'resolved' and coalesce(new.resolved_by, 'agent') = 'agent' then
    perform private.notify(new.reporter_id, 'محادثة T-' || new.ticket_no || ' انتهت', 'شكراً لتواصلك مع قطعتك.', '/assistant?ticket=' || new.id);
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------- actions
-- The assistant couldn't solve it (or the customer asked for a person): hand the chat to people.
create or replace function public.escalate_ticket(p_report uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare rep record;
begin
  select * into rep from public.reports where id = p_report for update;
  if rep.id is null or rep.reporter_id <> (select auth.uid()) then raise exception 'not allowed'; end if;
  if rep.status <> 'bot' then return; end if;
  update public.reports set status = 'open', escalated_at = now() where id = p_report;
  insert into public.ticket_messages (report_id, sender_id, body, kind)
  values (p_report, rep.reporter_id, 'المساعد حوّل المحادثة لخدمة العملاء', 'system');
  insert into public.notifications (user_id, title, body, link)
  select p.id, 'محادثة محتاجة موظف · T-' || rep.ticket_no, left(rep.body, 120), '' from public.profiles p where p.is_admin or p.is_support;
end $$;

-- The customer says the problem is solved (with the assistant, or while waiting).
create or replace function public.customer_resolve_ticket(p_report uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare rep record;
begin
  select * into rep from public.reports where id = p_report for update;
  if rep.id is null or rep.reporter_id <> (select auth.uid()) then raise exception 'not allowed'; end if;
  if rep.status = 'resolved' then return; end if;
  insert into public.ticket_messages (report_id, sender_id, body, kind)
  values (p_report, rep.reporter_id, case when rep.status = 'bot' then 'المشكلة اتحلّت مع المساعد' else 'العميل قفل المحادثة: المشكلة اتحلّت' end, 'system');
  update public.reports set status = 'resolved', resolved_at = now(),
    resolved_by = case when rep.status = 'bot' then 'bot' else 'customer' end where id = p_report;
end $$;

-- An agent takes over the chat (from the assistant or from the waiting queue).
create or replace function public.take_ticket(p_report uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare rep record; who text;
begin
  if not private.is_staff() then raise exception 'not allowed'; end if;
  select * into rep from public.reports where id = p_report for update;
  if rep.id is null then raise exception 'not found'; end if;
  select coalesce(nullif(split_part(full_name, ' ', 1), ''), 'موظف') into who from public.profiles where id = (select auth.uid());
  update public.reports set status = 'in_progress', assigned_to = (select auth.uid()), resolved_at = null, resolved_by = null,
    escalated_at = coalesce(escalated_at, now()) where id = p_report;
  if rep.assigned_to is distinct from (select auth.uid()) or rep.status <> 'in_progress' then
    insert into public.ticket_messages (report_id, sender_id, body, kind)
    values (p_report, (select auth.uid()), who || ' من خدمة العملاء دخل المحادثة', 'system');
    perform private.notify(rep.reporter_id, who || ' من خدمة العملاء معاك دلوقتي', 'كمّل المحادثة في T-' || rep.ticket_no, '/assistant?ticket=' || rep.id);
  end if;
end $$;

-- The agent ends the chat.
create or replace function public.close_ticket(p_report uuid) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not private.is_staff() then raise exception 'not allowed'; end if;
  insert into public.ticket_messages (report_id, sender_id, body, kind)
  values (p_report, (select auth.uid()), 'المحادثة انتهت. شكراً لتواصلك مع قطعتك 🙏', 'system');
  update public.reports set status = 'resolved', resolved_at = now(), resolved_by = 'agent' where id = p_report;
end $$;

revoke execute on function public.escalate_ticket(uuid), public.customer_resolve_ticket(uuid), public.take_ticket(uuid), public.close_ticket(uuid) from public, anon;
grant execute on function public.escalate_ticket(uuid), public.customer_resolve_ticket(uuid), public.take_ticket(uuid), public.close_ticket(uuid) to authenticated;

-- each row gets its own time, so a chat transcript saved in one insert keeps its order
alter table public.ticket_messages alter column created_at set default clock_timestamp();

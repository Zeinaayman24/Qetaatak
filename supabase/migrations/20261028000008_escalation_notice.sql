-- The "needs an agent" notification carries a one-line brief: type of problem, the order, and the customer's words.
create or replace function public.escalate_ticket(p_report uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare rep record; label text; part text;
begin
  select * into rep from public.reports where id = p_report for update;
  if rep.id is null or rep.reporter_id <> (select auth.uid()) then raise exception 'not allowed'; end if;
  if rep.status <> 'bot' then return; end if;
  update public.reports set status = 'open', escalated_at = now() where id = p_report;
  insert into public.ticket_messages (report_id, sender_id, body, kind)
  values (p_report, rep.reporter_id, 'المساعد حوّل المحادثة لخدمة العملاء', 'system');
  label := case rep.category when 'order' then 'مشكلة في طلب' when 'shop' then 'شكوى من محل' when 'customer' then 'شكوى من عميل'
                             when 'app' then 'مشكلة في التطبيق' else 'حاجة تانية' end;
  select '#' || num || ' ' || r.part into part from public.requests r where r.id = rep.request_id;
  insert into public.notifications (user_id, title, body, link)
  select p.id, 'محادثة محتاجة موظف · T-' || rep.ticket_no,
         left(label || coalesce(' · ' || part, '') || ' — «' || rep.body || '»', 160), ''
  from public.profiles p where p.is_admin or p.is_support;
end $$;

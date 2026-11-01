-- B17, B18, B21: shop performance (last 30 days), complaints about the shop, and pauses.
-- Thresholds are the approved table: warning → the shop is told; pause level → staff are told (staff decide).

alter table public.shops
  add column if not exists suspend_reason text not null default '',
  add column if not exists reopen_step text not null default '',
  add column if not exists suspended_at timestamptz,
  add column if not exists perf_warned_at timestamptz;

create or replace function private.on_shop_approved_at() returns trigger language plpgsql security definer set search_path = ''
as $$ begin
  if new.status = 'approved' and old.status is distinct from 'approved' and new.approved_at is null then new.approved_at := now(); end if;
  if new.status = 'suspended' and old.status is distinct from 'suspended' then new.suspended_at := now(); end if;
  if new.status = 'approved' and old.status = 'suspended' then new.suspend_reason := ''; new.reopen_step := ''; end if;
  return new;
end $$;

-- the measures, one place for the page and the daily check
create or replace function private.shop_metrics(p_shop uuid) returns jsonb
language sql stable security definer set search_path = ''
as $$
  with s as (select * from public.shops where id = p_shop),
  seen as (  -- requests this shop could answer in the last 30 days
    select r.id, r.created_at from public.requests r, s
     where r.created_at > now() - interval '30 days' and r.created_at > coalesce(s.approved_at, s.created_at)
       and (r.car_make = any (s.brands) or cardinality(s.brands) = 0) and r.customer_id <> p_shop),
  first_reply as (
    select seen.id, least(
      (select min(q.created_at) from public.quotes q where q.request_id = seen.id and q.shop_id = p_shop),
      (select min(d.created_at) from public.declines d where d.request_id = seen.id and d.shop_id = p_shop)) - seen.created_at as wait
      from seen),
  o as (select * from public.orders where shop_id = p_shop and created_at > now() - interval '30 days'),
  q as (select * from public.quotes where shop_id = p_shop and created_at > now() - interval '30 days')
  select jsonb_build_object(
    'reply_min', (select round(extract(epoch from avg(wait)) / 60) from first_reply where wait is not null),
    'answered_pct', (select case when count(*) = 0 then null else round(100.0 * count(wait) / count(*)) end from first_reply),
    'offers', (select count(*) from q),
    'sold', (select count(*) from q join public.requests r on r.chosen_quote_id = q.id),
    'cancels', (select count(*) from o where cancel_reason like 'shop:%'),
    'refusal_pct', (select case when count(*) = 0 then null else round(100.0 * count(*) filter (where refused_at is not null) / count(*)) end
                      from o where status <> 'preparing' and (status <> 'cancelled' or refused_at is not null)),
    'late_confirms', (select count(*) from o where staff_alerted_at is not null),
    'late_refunds', (select count(*) from public.orders where shop_id = p_shop and refund_alerted_at > now() - interval '30 days'),
    'rating', (select round(avg(rating)::numeric, 1) from public.orders where shop_id = p_shop and rating is not null),
    'ratings', (select count(*) from public.orders where shop_id = p_shop and rating is not null)
  );
$$;

create or replace function public.shop_performance() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not exists (select 1 from public.shops where id = auth.uid()) then raise exception 'not allowed'; end if;
  return private.shop_metrics(auth.uid());
end $$;

-- complaints about orders with this shop (no customer details)
create or replace function public.shop_complaints() returns table (id uuid, ticket_no bigint, order_no bigint, category text, status text, created_at timestamptz, replied boolean)
language sql stable security definer set search_path = ''
as $$
  select rp.id, rp.ticket_no, o.order_no, rp.category, rp.status, rp.created_at,
         exists (select 1 from public.ticket_messages m where m.report_id = rp.id and m.sender_id = auth.uid())
    from public.reports rp
    join public.requests r on r.id = rp.request_id
    join public.orders o on o.id = r.order_id
   where o.shop_id = auth.uid() and rp.category in ('shop', 'order') and rp.reporter_id <> auth.uid()
   order by rp.created_at desc limit 50;
$$;

-- the shop's reply goes to the Daghta team only (internal note on the ticket)
create or replace function public.reply_complaint(p_report uuid, p_body text, p_photo text) returns void
language plpgsql security definer set search_path = ''
as $$
declare ok boolean; t bigint;
begin
  select true, rp.ticket_no into ok, t from public.reports rp
    join public.requests r on r.id = rp.request_id join public.orders o on o.id = r.order_id
   where rp.id = p_report and o.shop_id = auth.uid();
  if ok is null then raise exception 'not allowed'; end if;
  if coalesce(trim(p_body), '') = '' then raise exception 'reason needed'; end if;
  if p_photo is not null and split_part(p_photo, '/', 1) <> auth.uid()::text then raise exception 'bad photo'; end if;
  insert into public.ticket_messages (report_id, sender_id, body, kind, internal)
  values (p_report, auth.uid(), 'ردّ المحل: ' || left(trim(p_body), 1800) || coalesce(E'\n[صورة] ' || p_photo, ''), 'user', true);
  perform private.notify_staff('المحل ردّ على شكوى #' || t, left(trim(p_body), 120), '/manage');
end $$;

-- daily: warn the shop at warning level (at most once a week); tell staff at pause level
create or replace function private.check_shop_performance() returns void
language plpgsql security definer set search_path = ''
as $$
declare s record; m jsonb; warn text; pause text;
begin
  for s in select sh.id, sh.perf_warned_at, sp.name from public.shops sh join public.shop_private sp on sp.id = sh.id where sh.status = 'approved' loop
    m := private.shop_metrics(s.id);
    warn := null; pause := null;
    if (m->>'cancels')::int >= 3 then pause := 'إلغاءات منك'; elsif (m->>'cancels')::int = 2 then warn := 'إلغاءات منك'; end if;
    if (m->>'refusal_pct')::numeric > 10 then pause := coalesce(pause, 'رفض العملاء'); elsif (m->>'refusal_pct')::numeric >= 5 then warn := coalesce(warn, 'رفض العملاء'); end if;
    if (m->>'late_confirms')::int >= 3 then pause := coalesce(pause, 'تأكيد التحويلات'); elsif (m->>'late_confirms')::int >= 1 then warn := coalesce(warn, 'تأكيد التحويلات'); end if;
    if (m->>'late_refunds')::int >= 1 then pause := coalesce(pause, 'رجوع فلوس العملاء'); end if;
    if (m->>'rating')::numeric < 3 and (m->>'ratings')::int >= 10 then pause := coalesce(pause, 'التقييم');
    elsif (m->>'rating')::numeric < 3.5 then warn := coalesce(warn, 'التقييم'); end if;
    if (m->>'reply_min')::numeric > 60 then warn := coalesce(warn, 'متوسط وقت الرد'); end if;
    if pause is not null then
      perform private.notify_staff('محل وصل لحد الإيقاف', s.name || ' · ' || pause, '/manage');
    end if;
    if coalesce(warn, pause) is not null and (s.perf_warned_at is null or s.perf_warned_at < now() - interval '7 days') then
      update public.shops set perf_warned_at = now() where id = s.id;
      perform private.notify(s.id, 'تنبيه: ' || coalesce(warn, pause) || ' محتاج تحسين',
        'لو فضل كده، المحل ممكن يتوقف مؤقتاً.', '/shop/performance');
    end if;
  end loop;
end $$;

select cron.schedule('daghta-shop-performance', '7 7 * * *', 'select private.check_shop_performance()');  -- 9:07 Cairo

revoke execute on function public.shop_performance(), public.shop_complaints(), public.reply_complaint(uuid, text, text) from public, anon;
grant execute on function public.shop_performance(), public.shop_complaints(), public.reply_complaint(uuid, text, text) to authenticated;

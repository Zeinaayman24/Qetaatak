-- B05 «مستقبل طلبات / مقفول دلوقتي»: a shop can stop new requests; active orders are not affected.
alter table public.shops add column if not exists accepting boolean not null default true;

create or replace function private.on_request_insert() returns trigger
language plpgsql security definer set search_path = ''
as $function$
declare n int; first_num bigint;
begin
  if new.batch_id is not null then
    select count(*), min(num) into n, first_num from public.requests where batch_id = new.batch_id;
    if new.num <> first_num then return new; end if;
  else n := 1; end if;
  insert into public.notifications (user_id, title, body, link)
  select s.id,
         case when n > 1 then 'طلب جديد: ' || n || ' قطع' else 'طلب جديد في تخصصك' end,
         case when n > 1 then (select string_agg(part, '، ' order by num) from public.requests where batch_id = new.batch_id)
              else new.part end || ' · ' || new.car_make || ' ' || new.car_model,
         '/shop/' || new.id
  from public.shops s
  where s.status = 'approved' and s.accepting and (new.car_make = any (s.brands) or cardinality(s.brands) = 0) and s.id <> new.customer_id;
  return new;
end $function$;

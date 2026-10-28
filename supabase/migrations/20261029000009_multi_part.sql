-- Several parts in one request. Each part stays its own row in `requests` (own quotes, chosen shop, tracking,
-- rating, commission); parts sent together share a `batch_id`, and the apps show them as one request.
alter table public.requests
  add column batch_id uuid,
  add column qty int not null default 1 check (qty between 1 and 20);
create index requests_batch_idx on public.requests (batch_id) where batch_id is not null;

-- Shops get one "new request" alert per batch, not one per part.
create or replace function private.on_request_insert() returns trigger language plpgsql security definer set search_path = ''
as $$
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
  from public.shops s where s.status = 'approved' and (new.car_make = any (s.brands) or cardinality(s.brands) = 0) and s.id <> new.customer_id;
  return new;
end $$;

-- Choose several offers at once, one per part; parts may come from different shops.
create or replace function public.choose_quotes(p_choices jsonb) returns void
language plpgsql security definer set search_path = ''
as $$
declare c record;
begin
  if jsonb_typeof(p_choices) <> 'array' or jsonb_array_length(p_choices) = 0 then raise exception 'nothing chosen'; end if;
  for c in select * from jsonb_to_recordset(p_choices) as x(request uuid, quote uuid, mode text) loop
    perform public.choose_quote(c.request, c.quote, c.mode);
  end loop;
end $$;
revoke execute on function public.choose_quotes(jsonb) from public, anon;
grant execute on function public.choose_quotes(jsonb) to authenticated;

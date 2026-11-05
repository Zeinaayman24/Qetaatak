-- A shop that only installs doesn't need specialties or brands to be submitted,
-- and doesn't get "new part request" notifications.
create or replace function public.submit_shop()
 returns void language plpgsql security definer set search_path to ''
as $function$
declare s record; p record;
begin
  select * into s from public.shops where id = auth.uid();
  select * into p from public.shop_private where id = auth.uid();
  if s.id is null or p.id is null then raise exception 'no shop'; end if;
  if s.status not in ('draft', 'changes', 'pending') then raise exception 'not allowed'; end if;
  if trim(p.name) = '' then raise exception 'need: name'; end if;
  if array_length(regexp_split_to_array(trim(p.owner_name), '\s+'), 1) < 2 then raise exception 'need: owner'; end if;
  if trim(s.area) = '' or trim(p.street) = '' then raise exception 'need: address'; end if;
  if s.lat is null then raise exception 'need: map'; end if;
  if s.sells and coalesce(array_length(s.specialties, 1), 0) = 0 then raise exception 'need: specialty'; end if;
  if s.sells and coalesce(array_length(s.brands, 1), 0) = 0 then raise exception 'need: brand'; end if;
  if s.offers_delivery and (s.fee_area is null or s.fee_city is null) then raise exception 'need: fees'; end if;
  if (p.instapay_address <> '' or p.wallet_number <> '') and trim(p.payout_name) = '' then raise exception 'need: payout name'; end if;
  if p.doc_id_front is null or p.doc_id_back is null or p.doc_register is null then raise exception 'need: documents'; end if;
  if s.agreement_at is null then raise exception 'need: agreement'; end if;
  perform set_config('daghta.submit', 'on', true);
  update public.shops set status = 'pending', submitted_at = now(), review_note = '' where id = s.id;
  perform set_config('daghta.submit', 'off', true);
  if s.status <> 'pending' then perform private.notify_staff('محل جديد للمراجعة', p.name || ' · ' || s.area, '/manage'); end if;
end $function$;

create or replace function private.on_request_insert() returns trigger
language plpgsql security definer set search_path = ''
as $function$
declare n int; first_num bigint; parts text;
begin
  if new.batch_id is not null then
    select count(*), min(num), string_agg(part, '، ' order by num) into n, first_num, parts from public.requests where batch_id = new.batch_id;
    if new.num <> first_num then return new; end if;
  else n := 1; parts := new.part; end if;
  insert into public.notifications (user_id, title, body, link)
  select s.id, 'طلب جديد: ' || parts,
         new.car_make || ' ' || new.car_model || ' ' || new.car_year || ' · ' || new.area,
         '/shop/' || new.id
  from public.shops s
  where s.status = 'approved' and s.accepting and s.sells and (new.car_make = any (s.brands) or cardinality(s.brands) = 0) and s.id <> new.customer_id;
  return new;
end $function$;

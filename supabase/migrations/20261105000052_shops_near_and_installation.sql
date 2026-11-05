-- Shops near you, shop service capabilities, buy-and-install, and installation for parts the
-- customer already has (install requests → quotes → bookings). Existing rows are untouched;
-- every new column has a safe default.

-- ---------------------------------------------------------------- shops: what they do and how they look
alter table public.shops
  add column sells    boolean not null default true,     -- sells spare parts
  add column installs boolean not null default false,    -- installs parts (with a sale, or the customer's own)
  add column about    text not null default '' check (char_length(about) <= 600),
  add column photos   text[] not null default '{}' check (cardinality(photos) <= 8);
alter table public.shops add constraint shops_sells_or_installs check (sells or installs);
create index shops_approved_latlng_idx on public.shops (lat, lng) where status = 'approved';

-- ---------------------------------------------------------------- installation service catalogue (admin-managed)
create table public.install_services (
  id        text primary key check (id ~ '^[a-z0-9-]{2,40}$'),
  name_ar   text not null check (char_length(name_ar) between 1 and 60),
  name_en   text not null default '' check (char_length(name_en) <= 60),
  category  text not null default '',
  sort      int not null default 100,
  active    boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.install_services enable row level security;
create policy install_services_read on public.install_services for select to authenticated using (true);
create policy install_services_admin on public.install_services for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

insert into public.install_services (id, name_ar, name_en, category, sort) values
  ('brake-pads', 'تركيب تيل فرامل', 'Brake pads', 'فرامل', 1),
  ('brake-discs', 'تركيب ديسكات فرامل', 'Brake discs', 'فرامل', 2),
  ('suspension', 'تركيب قطع عفشة', 'Suspension parts', 'عفشة', 3),
  ('shocks', 'تغيير مساعدين', 'Shock absorbers', 'عفشة', 4),
  ('battery', 'تركيب بطارية', 'Battery', 'كهرباء', 5),
  ('alternator', 'تغيير دينامو', 'Alternator', 'كهرباء', 6),
  ('starter', 'تغيير مارش', 'Starter motor', 'كهرباء', 7),
  ('radiator', 'تغيير رديتر', 'Radiator', 'تبريد', 8),
  ('ac-parts', 'تركيب قطع تكييف', 'A/C parts', 'تكييف', 9),
  ('engine-mounts', 'تغيير قواعد موتور', 'Engine mounts', 'موتور', 10),
  ('filters', 'تغيير فلاتر', 'Filters', 'صيانة', 11),
  ('sensors', 'تركيب حساسات', 'Sensors', 'كهرباء', 12),
  ('lights', 'تركيب فوانيس ومرايات', 'Lights and mirrors', 'صاج', 13),
  ('body', 'تركيب صاج (رفرف، اكصدام، كبوت)', 'Body panels', 'صاج', 14),
  ('clutch', 'تغيير طقم دبرياج', 'Clutch kit', 'دبرياج', 15),
  ('other', 'تركيب حاجة تانية', 'Something else', '', 99)
on conflict (id) do nothing;

-- what each shop installs, and for how much
create table public.shop_install_services (
  shop_id          uuid not null references public.shops (id) on delete cascade,
  service_id       text not null references public.install_services (id) on update cascade,
  price_from       numeric check (price_from is null or price_from >= 0),
  price_to         numeric check (price_to is null or price_to >= 0),
  needs_inspection boolean not null default false,
  minutes          int check (minutes is null or minutes between 5 and 2880),
  note             text not null default '' check (char_length(note) <= 200),
  created_at       timestamptz not null default now(),
  primary key (shop_id, service_id)
);
alter table public.shop_install_services enable row level security;
create policy sis_read on public.shop_install_services for select to authenticated using (true);
create policy sis_own on public.shop_install_services for all to authenticated
  using (shop_id = (select auth.uid())) with check (shop_id = (select auth.uid()));

-- ---------------------------------------------------------------- buy a part with installation
alter table public.quotes
  add column install_available        boolean not null default false,
  add column install_fee              numeric check (install_fee is null or install_fee >= 0),  -- null + available = price after inspection
  add column install_needs_inspection boolean not null default false;
alter table public.requests add column with_install boolean not null default false;
alter table public.orders
  add column install_fee    numeric not null default 0 check (install_fee >= 0),
  add column install_at     timestamptz,
  add column install_status text not null default '' check (install_status in ('', 'requested', 'confirmed', 'in_progress', 'done'));

-- ---------------------------------------------------------------- installation for a part the customer already has
create table public.install_requests (
  id           uuid primary key default gen_random_uuid(),
  num          bigint generated always as identity (start with 3001),
  customer_id  uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  service_id   text not null references public.install_services (id) on update cascade,
  car_make     text not null, car_model text not null default '', car_year int, powertrain text not null default '',
  vin          text not null default '',
  part_desc    text not null check (char_length(part_desc) between 2 and 300),
  photo_path   text,
  notes        text not null default '' check (char_length(notes) <= 500),
  governorate  text not null default '', area text not null default '',
  lat double precision, lng double precision,
  target_shop  uuid references public.shops (id) on delete set null,   -- sent to one shop only (from its page)
  status       text not null default 'open' check (status in ('open', 'booked', 'cancelled', 'expired')),
  created_at   timestamptz not null default now()
);
create index install_requests_customer_idx on public.install_requests (customer_id, created_at desc);
create index install_requests_open_idx on public.install_requests (status, service_id) where status = 'open';

create table public.install_quotes (
  id               uuid primary key default gen_random_uuid(),
  request_id       uuid not null references public.install_requests (id) on delete cascade,
  shop_id          uuid not null references public.shops (id) on delete cascade,
  price            numeric check (price is null or price >= 0),
  price_max        numeric check (price_max is null or price_max >= 0),
  needs_inspection boolean not null default false,
  note             text not null default '' check (char_length(note) <= 300),
  earliest         text not null default '' check (char_length(earliest) <= 60),
  created_at       timestamptz not null default now(),
  unique (request_id, shop_id)
);

create table public.bookings (
  id               uuid primary key default gen_random_uuid(),
  num              bigint generated always as identity (start with 7001),
  request_id       uuid references public.install_requests (id) on delete set null,
  quote_id         uuid references public.install_quotes (id) on delete set null,
  order_id         uuid references public.orders (id) on delete set null,
  shop_id          uuid not null references public.shops (id),
  customer_id      uuid not null references public.profiles (id),
  appointment_at   timestamptz not null,
  price            numeric,
  status           text not null default 'pending'
                   check (status in ('pending', 'confirmed', 'in_progress', 'ready', 'done', 'cancelled', 'disputed')),
  price_change     numeric check (price_change is null or price_change >= 0),
  price_change_note text not null default '',
  cancel_note      text not null default '',
  dispute_note     text not null default '',
  cancelled_by     text not null default '' check (cancelled_by in ('', 'customer', 'shop', 'staff')),
  rating           int check (rating between 1 and 5),
  review           text not null default '' check (char_length(review) <= 500),
  rated_at         timestamptz,
  done_at          timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index bookings_shop_idx on public.bookings (shop_id, appointment_at desc);
create index bookings_customer_idx on public.bookings (customer_id, created_at desc);

alter table public.install_requests enable row level security;
alter table public.install_quotes enable row level security;
alter table public.bookings enable row level security;

-- can this shop see this open install request?
create or replace function private.shop_can_install(p_shop uuid, p_service text, p_target uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.shops s where s.id = p_shop and s.status = 'approved' and s.installs)
     and (p_target is null or p_target = p_shop)
     and (p_service = 'other' or p_target = p_shop
          or exists (select 1 from public.shop_install_services x where x.shop_id = p_shop and x.service_id in (p_service, 'other'))
          or not exists (select 1 from public.shop_install_services x where x.shop_id = p_shop))
$$;
grant execute on function private.shop_can_install(uuid, text, uuid) to authenticated;

-- helpers that read the other table without its policy (avoids policy recursion)
create or replace function private.install_quoted(p_request uuid, p_shop uuid) returns boolean
language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.install_quotes q where q.request_id = p_request and q.shop_id = p_shop) $$;
create or replace function private.install_owner(p_request uuid) returns uuid
language sql stable security definer set search_path = ''
as $$ select customer_id from public.install_requests where id = p_request $$;
grant execute on function private.install_quoted(uuid, uuid), private.install_owner(uuid) to authenticated;

create policy ir_customer on public.install_requests for select to authenticated
  using (customer_id = (select auth.uid()) or (select private.is_staff())
         or (status = 'open' and private.shop_can_install((select auth.uid()), service_id, target_shop))
         or private.install_quoted(id, (select auth.uid())));
create policy ir_insert on public.install_requests for insert to authenticated
  with check (customer_id = (select auth.uid()) and status = 'open');
create policy iq_read on public.install_quotes for select to authenticated
  using (shop_id = (select auth.uid()) or (select private.is_staff())
         or private.install_owner(request_id) = (select auth.uid()));
create policy bk_read on public.bookings for select to authenticated
  using (customer_id = (select auth.uid()) or shop_id = (select auth.uid()) or (select private.is_staff()));

-- new install request → tell matching shops
create or replace function private.on_install_request() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare s record; svc text;
begin
  select name_ar into svc from public.install_services where id = new.service_id;
  for s in select sh.id from public.shops sh where sh.status = 'approved' and sh.installs
             and private.shop_can_install(sh.id, new.service_id, new.target_shop)
             and (new.target_shop is not null or new.governorate = '' or sh.governorate = new.governorate) loop
    perform private.notify(s.id, 'طلب تركيب جديد', coalesce(svc, 'تركيب') || ' · ' || new.car_make || ' ' || new.car_model, '/shop/install/' || new.id);
  end loop;
  return new;
end $$;
create trigger install_request_created after insert on public.install_requests
  for each row execute function private.on_install_request();

-- shop answers an install request
create or replace function public.send_install_quote(p_request uuid, p_price numeric, p_price_max numeric, p_needs_inspection boolean, p_note text, p_earliest text)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare uid uuid := auth.uid(); r public.install_requests; qid uuid;
begin
  select * into r from public.install_requests where id = p_request;
  if r.id is null or r.status <> 'open' then raise exception 'request is closed'; end if;
  if not private.shop_can_install(uid, r.service_id, r.target_shop) then raise exception 'not allowed'; end if;
  if p_price is null and not coalesce(p_needs_inspection, false) then raise exception 'price needed'; end if;
  if p_price_max is not null and p_price is not null and p_price_max < p_price then raise exception 'bad price range'; end if;
  insert into public.install_quotes (request_id, shop_id, price, price_max, needs_inspection, note, earliest)
  values (p_request, uid, p_price, p_price_max, coalesce(p_needs_inspection, false), left(coalesce(p_note, ''), 300), left(coalesce(p_earliest, ''), 60))
  on conflict (request_id, shop_id) do update
    set price = excluded.price, price_max = excluded.price_max, needs_inspection = excluded.needs_inspection,
        note = excluded.note, earliest = excluded.earliest, created_at = now()
  returning id into qid;
  perform private.notify(r.customer_id, 'وصلك عرض تركيب', 'طلب تركيب #' || r.num, '/install/' || r.id);
  return qid;
end $$;

-- customer books one quote at a time and date
create or replace function public.book_install(p_quote uuid, p_at timestamptz)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare uid uuid := auth.uid(); q public.install_quotes; r public.install_requests; bid uuid; bno bigint;
begin
  select * into q from public.install_quotes where id = p_quote;
  select * into r from public.install_requests where id = q.request_id;
  if r.id is null or r.customer_id <> uid then raise exception 'not allowed'; end if;
  if r.status <> 'open' then raise exception 'request is closed'; end if;
  if p_at is null or p_at < now() + interval '30 minutes' or p_at > now() + interval '60 days' then raise exception 'bad appointment time'; end if;
  insert into public.bookings (request_id, quote_id, shop_id, customer_id, appointment_at, price)
  values (r.id, q.id, q.shop_id, uid, p_at, q.price)
  returning id, num into bid, bno;
  update public.install_requests set status = 'booked' where id = r.id;
  perform private.notify(q.shop_id, 'حجز تركيب جديد', 'حجز #' || bno || ' · أكّد المعاد', '/shop/booking/' || bid);
  return bid;
end $$;

-- every booking step, for the customer and the shop
create or replace function public.booking_action(p_booking uuid, p_action text, p_value numeric default null, p_note text default '')
returns void language plpgsql security definer set search_path = ''
as $$
declare uid uuid := auth.uid(); b public.bookings; is_shop boolean; is_cust boolean; note text := left(coalesce(p_note, ''), 300);
begin
  select * into b from public.bookings where id = p_booking for update;
  if b.id is null then raise exception 'not allowed'; end if;
  is_shop := b.shop_id = uid; is_cust := b.customer_id = uid;
  if not (is_shop or is_cust) then raise exception 'not allowed'; end if;

  if is_shop and p_action = 'confirm' and b.status = 'pending' then
    update public.bookings set status = 'confirmed', updated_at = now() where id = b.id;
    perform private.notify(b.customer_id, 'المحل أكّد معاد التركيب', 'حجز #' || b.num, '/booking/' || b.id);
  elsif is_shop and p_action = 'start' and b.status = 'confirmed' then
    update public.bookings set status = 'in_progress', updated_at = now() where id = b.id;
    perform private.notify(b.customer_id, 'بدأ التركيب', 'حجز #' || b.num, '/booking/' || b.id);
  elsif is_shop and p_action = 'finish' and b.status = 'in_progress' then
    if b.price_change is not null then raise exception 'price change pending'; end if;
    update public.bookings set status = 'ready', updated_at = now() where id = b.id;
    perform private.notify(b.customer_id, 'التركيب خلص', 'أكّد إن كل حاجة تمام · حجز #' || b.num, '/booking/' || b.id);
  elsif is_shop and p_action = 'propose_price' and b.status in ('pending', 'confirmed', 'in_progress') then
    if p_value is null or p_value < 0 or note = '' then raise exception 'reason needed'; end if;
    update public.bookings set price_change = p_value, price_change_note = note, updated_at = now() where id = b.id;
    perform private.notify(b.customer_id, 'المحل عايز يغيّر السعر', 'حجز #' || b.num || ' · وافق أو ارفض', '/booking/' || b.id);
  elsif is_cust and p_action = 'accept_price' and b.price_change is not null then
    update public.bookings set price = b.price_change, price_change = null, updated_at = now() where id = b.id;
    perform private.notify(b.shop_id, 'العميل وافق على السعر الجديد', 'حجز #' || b.num, '/shop/booking/' || b.id);
  elsif is_cust and p_action = 'reject_price' and b.price_change is not null then
    update public.bookings set price_change = null, price_change_note = '', updated_at = now() where id = b.id;
    perform private.notify(b.shop_id, 'العميل رفض السعر الجديد', 'حجز #' || b.num || ' · كمّل بالسعر الأول أو الغي', '/shop/booking/' || b.id);
  elsif is_cust and p_action = 'confirm_done' and b.status = 'ready' then
    update public.bookings set status = 'done', done_at = now(), updated_at = now() where id = b.id;
    perform private.notify(b.shop_id, 'العميل أكّد إن التركيب تمام', 'حجز #' || b.num, '/shop/booking/' || b.id);
  elsif is_cust and p_action = 'dispute' and b.status in ('in_progress', 'ready') then
    if note = '' then raise exception 'reason needed'; end if;
    update public.bookings set status = 'disputed', dispute_note = note, updated_at = now() where id = b.id;
    perform private.notify(b.shop_id, 'العميل عنده مشكلة في التركيب', 'حجز #' || b.num, '/shop/booking/' || b.id);
    perform private.notify_staff('مشكلة في تركيب', 'حجز #' || b.num || ': ' || note, '/bookings/' || b.id);
  elsif p_action = 'cancel' and b.status in ('pending', 'confirmed') then
    if is_shop and note = '' then raise exception 'reason needed'; end if;
    update public.bookings set status = 'cancelled', cancelled_by = case when is_shop then 'shop' else 'customer' end,
           cancel_note = note, updated_at = now() where id = b.id;
    -- the request opens again so other shops' offers can be booked
    update public.install_requests set status = 'open' where id = b.request_id and status = 'booked';
    perform private.notify(case when is_shop then b.customer_id else b.shop_id end, 'الحجز اتلغى',
      'حجز #' || b.num || case when note <> '' then ' · ' || note else '' end,
      case when is_shop then '/booking/' else '/shop/booking/' end || b.id);
  else
    raise exception 'not allowed';
  end if;
end $$;

create or replace function public.rate_booking(p_booking uuid, p_rating int, p_review text)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  update public.bookings set rating = p_rating, review = left(coalesce(p_review, ''), 500), rated_at = now()
   where id = p_booking and customer_id = auth.uid() and status = 'done' and rated_at is null and p_rating between 1 and 5;
  if not found then raise exception 'not allowed'; end if;
end $$;

-- the shop moves the installation part of a parts order along
create or replace function public.set_order_install(p_order uuid, p_status text)
returns void language plpgsql security definer set search_path = ''
as $$
declare o public.orders;
begin
  select * into o from public.orders where id = p_order and shop_id = auth.uid();
  if o.id is null or o.install_status = '' then raise exception 'not allowed'; end if;
  if not ((o.install_status = 'requested' and p_status = 'confirmed') or (o.install_status = 'confirmed' and p_status = 'in_progress')
       or (o.install_status = 'in_progress' and p_status = 'done')) then raise exception 'not allowed'; end if;
  update public.orders set install_status = p_status, updated_at = now() where id = o.id;
  perform private.notify(o.customer_id,
    case p_status when 'confirmed' then 'المحل أكّد معاد التركيب' when 'in_progress' then 'بدأ تركيب القطعة' else 'التركيب خلص' end,
    'أوردر #' || o.order_no, '/order/' || o.id);
end $$;

-- ---------------------------------------------------------------- place_order: carry the installation choice
create or replace function public.place_order(p_choices jsonb, p_payment text, p_address jsonb default null)
returns jsonb language plpgsql security definer set search_path = ''
as $function$
declare made jsonb; need_addr boolean; dep boolean := private.deposits_on(); all_pickup boolean;
begin
  if auth.uid() is null then raise exception 'not allowed'; end if;
  if p_payment not in ('cash', 'shop', 'instapay', 'card') then raise exception 'bad payment method'; end if;
  -- installation happens at the shop: only offered installs, picked up, with a sensible time
  if exists (select 1 from jsonb_to_recordset(p_choices) as x(request uuid, quote uuid, mode text, install boolean, install_at timestamptz)
               join public.quotes q on q.id = x.quote
              where coalesce(x.install, false) and (not q.install_available or x.mode is distinct from 'pickup'
                    or x.install_at is null or x.install_at < now() or x.install_at > now() + interval '60 days')) then
    raise exception 'install not offered';
  end if;
  all_pickup := not exists (select 1 from jsonb_to_recordset(p_choices) as x(request uuid, quote uuid, mode text) where x.mode is distinct from 'pickup');
  if dep and all_pickup then p_payment := 'shop'; end if;
  if p_payment = 'shop' and not all_pickup then raise exception 'pay at shop needs pickup'; end if;
  if p_payment = 'instapay' and exists (
    select 1 from jsonb_to_recordset(p_choices) as x(request uuid, quote uuid, mode text)
      join public.quotes q on q.id = x.quote
      join public.shop_private sp on sp.id = q.shop_id
     where sp.instapay_address = '' and sp.wallet_number = '' and (not dep or x.mode = 'delivery')
  ) then raise exception 'shop has no transfer details'; end if;
  need_addr := exists (select 1 from jsonb_to_recordset(p_choices) as x(request uuid, quote uuid, mode text) where x.mode = 'delivery');
  if need_addr and (p_address is null
      or coalesce(p_address->>'governorate', '') = '' or coalesce(p_address->>'area', '') = '' or coalesce(p_address->>'street', '') = ''
      or coalesce(p_address->>'building', '') = '' or coalesce(p_address->>'floor', '') = '' or coalesce(p_address->>'apartment', '') = '') then
    raise exception 'address needed';
  end if;
  made := public.accept_offers(p_choices);
  update public.requests r set with_install = true
    from jsonb_to_recordset(p_choices) as x(request uuid, quote uuid, mode text, install boolean)
   where r.id = x.request and coalesce(x.install, false);
  update public.orders o
     set payment_method = case when dep and o.delivery_mode = 'pickup' then 'shop' else p_payment end,
         payment_status = case when dep and o.delivery_mode = 'pickup' then 'unpaid' when p_payment in ('instapay', 'card') then 'awaiting' else 'unpaid' end,
         deposit = case when dep and o.delivery_mode = 'pickup' and not private.shop_visible(o.shop_id) then public.deposit_for(o.items_total) else 0 end,
         deposit_status = case when dep and o.delivery_mode = 'pickup' and not private.shop_visible(o.shop_id) then 'awaiting' else 'none' end,
         delivery_address = case when o.delivery_mode = 'delivery' then jsonb_build_object(
           'governorate', p_address->>'governorate', 'area', p_address->>'area', 'street', p_address->>'street',
           'building', p_address->>'building', 'floor', p_address->>'floor', 'apartment', p_address->>'apartment',
           'landmark', coalesce(p_address->>'landmark', ''), 'contact_phone', coalesce(p_address->>'contact_phone', '')) end,
         install_fee = coalesce((select sum(coalesce(q.install_fee, 0)) from public.requests r join public.quotes q on q.id = r.chosen_quote_id
                                  where r.order_id = o.id and r.with_install), 0),
         install_status = case when exists (select 1 from public.requests r where r.order_id = o.id and r.with_install) then 'requested' else '' end,
         install_at = (select max(x.install_at) from jsonb_to_recordset(p_choices) as x(request uuid, quote uuid, mode text, install boolean, install_at timestamptz)
                        join public.requests r on r.id = x.request where r.order_id = o.id and coalesce(x.install, false))
   where o.id in (select (jsonb_array_elements_text(made))::uuid);
  return made;
end $function$;

-- ---------------------------------------------------------------- shops near you
create or replace function public.shops_near(p_lat double precision default null, p_lng double precision default null, p_km double precision default null)
returns table (id uuid, name text, area text, governorate text, address text, phone text, phone2 text, lat double precision, lng double precision,
               km double precision, photo_path text, photos text[], about text, hours jsonb, sells boolean, installs boolean,
               offers_delivery boolean, brands text[], specialties text[], shop_type text, rating numeric, ratings bigint, sales bigint,
               featured boolean, services text[])
language sql stable security definer set search_path = ''
as $$
  select * from (
    select s.id, coalesce(nullif(sp.name, ''), 'محل في ' || s.area) as name, s.area, s.governorate,
      concat_ws('، ', nullif(sp.street, ''), case when coalesce(sp.building, '') <> '' then 'عمارة ' || sp.building end,
                nullif(sp.landmark, ''), nullif(s.area, ''), nullif(s.governorate, '')),
      coalesce(sp.phone, ''), coalesce(sp.phone2, ''), s.lat, s.lng,
      case when p_lat is null or p_lng is null or s.lat is null or s.lng is null then null
           else 6371 * 2 * asin(sqrt(power(sin(radians(s.lat - p_lat) / 2), 2)
                + cos(radians(p_lat)) * cos(radians(s.lat)) * power(sin(radians(s.lng - p_lng) / 2), 2))) end as km,
      s.photo_path, s.photos, s.about, s.hours, s.sells, s.installs, s.offers_delivery, s.brands, s.specialties, s.shop_type,
      (select round(avg(x.r)::numeric, 1) from (
         select o.rating as r from public.orders o where o.shop_id = s.id and o.rating is not null
         union all select b.rating from public.bookings b where b.shop_id = s.id and b.rating is not null) x),
      (select count(*) from public.orders o where o.shop_id = s.id and o.rating is not null)
        + (select count(*) from public.bookings b where b.shop_id = s.id and b.rating is not null),
      (select count(*) from public.orders o where o.shop_id = s.id and o.status = 'received')
        + (select count(*) from public.bookings b where b.shop_id = s.id and b.status = 'done'),
      coalesce(s.featured_until > now(), false),
      coalesce((select array_agg(x.service_id order by x.service_id) from public.shop_install_services x where x.shop_id = s.id), '{}')
    from public.shops s left join public.shop_private sp on sp.id = s.id
    where s.status = 'approved' and auth.uid() is not null
  ) t
  where p_km is null or (t.km is not null and t.km <= p_km)
  order by t.km nulls last, t.name
  limit 500
$$;
revoke execute on function public.shops_near(double precision, double precision, double precision) from public, anon;
grant execute on function public.shops_near(double precision, double precision, double precision) to authenticated;

-- reviews on a shop's page now include installation bookings
create or replace function public.shop_reviews(p_shop uuid)
returns table (rating int, review text, part text, at timestamptz, first_name text, kind text)
language sql stable security definer set search_path = ''
as $$
  select * from (
    select o.rating, o.review, coalesce(private.order_parts(o.id), '') as part, o.received_at as at, split_part(p.full_name, ' ', 1) as first_name, 'part' as kind
      from public.orders o join public.profiles p on p.id = o.customer_id
     where o.shop_id = p_shop and o.rating is not null
    union all
    select b.rating, b.review, coalesce(sv.name_ar, 'تركيب'), b.rated_at, split_part(p.full_name, ' ', 1), 'install'
      from public.bookings b join public.profiles p on p.id = b.customer_id
      left join public.install_requests r on r.id = b.request_id left join public.install_services sv on sv.id = r.service_id
     where b.shop_id = p_shop and b.rating is not null
  ) x where auth.uid() is not null order by x.at desc nulls last limit 30
$$;

revoke execute on function public.send_install_quote(uuid, numeric, numeric, boolean, text, text), public.book_install(uuid, timestamptz),
  public.booking_action(uuid, text, numeric, text), public.rate_booking(uuid, int, text), public.set_order_install(uuid, text),
  public.shop_reviews(uuid) from public, anon;
grant execute on function public.send_install_quote(uuid, numeric, numeric, boolean, text, text), public.book_install(uuid, timestamptz),
  public.booking_action(uuid, text, numeric, text), public.rate_booking(uuid, int, text), public.set_order_install(uuid, text),
  public.shop_reviews(uuid) to authenticated;

alter publication supabase_realtime add table public.install_requests, public.install_quotes, public.bookings;

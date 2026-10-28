-- One role per account, cars, richer requests, chat, notifications, order tracking,
-- reviews, favorites and support reports.

-- ---------------------------------------------------------------- one role per account
update public.profiles set is_customer = false where is_customer and is_shop;  -- existing test account kept as a shop
alter table public.profiles add constraint profiles_one_role check (not (is_customer and is_shop));

drop policy shops_insert on public.shops;
create policy shops_insert on public.shops for insert to authenticated
  with check (id = (select auth.uid()) and not exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.is_customer));

drop policy requests_insert on public.requests;
create policy requests_insert on public.requests for insert to authenticated
  with check (customer_id = (select auth.uid()) and status = 'open' and chosen_quote_id is null and rating is null
              and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.is_customer));

-- ---------------------------------------------------------------- extra cars
create table public.cars (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  make       text not null,
  model      text not null,
  year       int not null check (year between 1960 and 2100),
  vin        text not null default '',
  created_at timestamptz not null default now()
);
create index cars_owner_idx on public.cars (owner_id);
alter table public.cars enable row level security;
create policy cars_own on public.cars for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

alter table public.profiles add column car_vin text not null default '';

-- ---------------------------------------------------------------- richer requests + tracking + reviews
alter table public.requests
  add column vin          text not null default '',
  add column side         text not null default '' check (side in ('', 'right', 'left', 'front', 'rear')),
  add column urgency      text not null default 'normal' check (urgency in ('normal', 'today', 'urgent')),
  add column budget       int check (budget is null or budget > 0),
  add column order_status text check (order_status in ('preparing', 'ready', 'out_for_delivery', 'delivered')),
  add column review       text not null default '' check (char_length(review) <= 500);

create or replace function public.choose_quote(p_request uuid, p_quote uuid, p_mode text)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if p_mode not in ('delivery', 'pickup') then raise exception 'bad mode'; end if;
  if p_mode = 'delivery' and not exists (
    select 1 from public.quotes q join public.shops s on s.id = q.shop_id where q.id = p_quote and s.offers_delivery
  ) then raise exception 'shop does not deliver'; end if;
  update public.requests r
     set status = 'chosen', chosen_quote_id = p_quote, delivery_mode = p_mode, chosen_at = now(), order_status = 'preparing'
   where r.id = p_request and r.customer_id = auth.uid() and r.status = 'open'
     and exists (select 1 from public.quotes q where q.id = p_quote and q.request_id = p_request);
  if not found then raise exception 'cannot choose this quote'; end if;
end $$;

create or replace function public.mark_received(p_request uuid)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  update public.requests set status = 'done', done_at = now(), order_status = 'delivered'
   where id = p_request and customer_id = auth.uid() and status = 'chosen';
  if not found then raise exception 'cannot update'; end if;
end $$;

drop function public.rate_request(uuid, int);
create function public.rate_request(p_request uuid, p_rating int, p_review text default '')
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if p_rating not between 1 and 5 then raise exception 'bad rating'; end if;
  update public.requests set rating = p_rating, review = left(coalesce(p_review, ''), 500)
   where id = p_request and customer_id = auth.uid() and status = 'done';
  if not found then raise exception 'cannot rate'; end if;
end $$;

-- the chosen shop moves the order along
create or replace function public.update_order_status(p_request uuid, p_status text)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if p_status not in ('preparing', 'ready', 'out_for_delivery', 'delivered') then raise exception 'bad status'; end if;
  update public.requests r set order_status = p_status
   where r.id = p_request and r.status = 'chosen'
     and exists (select 1 from public.quotes q where q.id = r.chosen_quote_id and q.shop_id = auth.uid());
  if not found then raise exception 'cannot update'; end if;
end $$;

-- public shop page: stats and reviews, without name or phone
create or replace function public.shop_profile(p_shop uuid)
returns json language sql stable security definer set search_path = ''
as $$
  select json_build_object(
    'shop', (select json_build_object('id', s.id, 'area', s.area, 'governorate', s.governorate, 'shop_type', s.shop_type,
              'specialties', s.specialties, 'brands', s.brands, 'offers_delivery', s.offers_delivery, 'since', s.created_at)
             from public.shops s where s.id = p_shop and s.status = 'approved'),
    'sales', (select count(*) from public.requests r join public.quotes q on q.id = r.chosen_quote_id where q.shop_id = p_shop and r.status in ('chosen', 'done')),
    'rating', (select round(avg(r.rating)::numeric, 1) from public.requests r join public.quotes q on q.id = r.chosen_quote_id where q.shop_id = p_shop and r.rating is not null),
    'ratings', (select count(r.rating) from public.requests r join public.quotes q on q.id = r.chosen_quote_id where q.shop_id = p_shop),
    'reviews', coalesce((select json_agg(x order by x.at desc) from (
        select r.rating, r.review, r.part, r.done_at as at, split_part(p.full_name, ' ', 1) as first_name
        from public.requests r join public.quotes q on q.id = r.chosen_quote_id join public.profiles p on p.id = r.customer_id
        where q.shop_id = p_shop and r.rating is not null order by r.done_at desc limit 20) x), '[]'::json)
  )
$$;

revoke execute on function public.rate_request(uuid, int, text), public.update_order_status(uuid, text), public.shop_profile(uuid) from public, anon;
grant execute on function public.rate_request(uuid, int, text), public.update_order_status(uuid, text), public.shop_profile(uuid) to authenticated;

-- ---------------------------------------------------------------- chat
create table public.messages (
  id         uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.requests (id) on delete cascade,
  shop_id    uuid not null references public.shops (id) on delete cascade,
  sender_id  uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  body       text not null default '' check (char_length(body) <= 1000),
  photo_path text,
  created_at timestamptz not null default now(),
  check (char_length(body) > 0 or photo_path is not null)
);
create index messages_thread_idx on public.messages (request_id, shop_id, created_at);
alter table public.messages enable row level security;

create policy messages_select on public.messages for select to authenticated
  using (shop_id = (select auth.uid()) or private.request_customer(request_id) = (select auth.uid()) or private.is_admin());
create policy messages_insert on public.messages for insert to authenticated
  with check (
    sender_id = (select auth.uid()) and (
      (shop_id = (select auth.uid()) and private.is_approved_shop())
      or (private.request_customer(request_id) = (select auth.uid())
          and exists (select 1 from public.quotes q where q.request_id = messages.request_id and q.shop_id = messages.shop_id))
    ));

-- ---------------------------------------------------------------- notifications
create table public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  title      text not null,
  body       text not null default '',
  link       text not null default '',
  read_at    timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);
alter table public.notifications enable row level security;
create policy notifications_select on public.notifications for select to authenticated using (user_id = (select auth.uid()));
create policy notifications_update on public.notifications for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy notifications_delete on public.notifications for delete to authenticated using (user_id = (select auth.uid()));

create or replace function private.notify(p_user uuid, p_title text, p_body text, p_link text)
returns void language sql security definer set search_path = ''
as $$ insert into public.notifications (user_id, title, body, link) values (p_user, p_title, p_body, p_link) $$;

create or replace function private.on_quote_insert() returns trigger language plpgsql security definer set search_path = ''
as $$
declare r record;
begin
  select * into r from public.requests where id = new.request_id;
  perform private.notify(r.customer_id, 'وصلك عرض جديد', r.part || ' · ' || new.price || ' ج.م', '/customer/' || r.id);
  return new;
end $$;
create trigger quotes_notify after insert on public.quotes for each row execute function private.on_quote_insert();

create or replace function private.on_request_insert() returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.notifications (user_id, title, body, link)
  select s.id, 'طلب جديد في تخصصك', new.part || ' · ' || new.car_make || ' ' || new.car_model, '/shop/' || new.id
  from public.shops s where s.status = 'approved' and (new.car_make = any (s.brands) or cardinality(s.brands) = 0) and s.id <> new.customer_id;
  return new;
end $$;
create trigger requests_notify_insert after insert on public.requests for each row execute function private.on_request_insert();

create or replace function private.on_request_update() returns trigger language plpgsql security definer set search_path = ''
as $$
declare shop uuid;
begin
  select q.shop_id into shop from public.quotes q where q.id = new.chosen_quote_id;
  if new.status = 'chosen' and old.status = 'open' and shop is not null then
    perform private.notify(shop, 'العميل اختار عرضك!', new.part, '/shop/' || new.id);
  end if;
  if new.order_status is distinct from old.order_status and old.status = 'chosen' and new.status = 'chosen' then
    perform private.notify(new.customer_id,
      case new.order_status when 'ready' then 'طلبك جاهز للاستلام' when 'out_for_delivery' then 'طلبك خرج للتوصيل'
           when 'delivered' then 'المحل سلّم طلبك' else 'المحل بيجهّز طلبك' end,
      new.part, '/customer/' || new.id);
  end if;
  if new.status = 'done' and old.status = 'chosen' and shop is not null then
    perform private.notify(shop, 'العميل أكد الاستلام', new.part, '/shop/' || new.id);
  end if;
  if new.rating is not null and old.rating is distinct from new.rating and shop is not null then
    perform private.notify(shop, 'وصلك تقييم ' || new.rating || ' من ٥', coalesce(nullif(new.review, ''), new.part), '/shop/' || new.id);
  end if;
  return new;
end $$;
create trigger requests_notify_update after update on public.requests for each row execute function private.on_request_update();

create or replace function private.on_shop_update() returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.status = 'approved' and old.status <> 'approved' then
    perform private.notify(new.id, 'تمت الموافقة على محلك 🎉', 'الطلبات هتبدأ توصلك دلوقتي.', '/shop');
  elsif new.status = 'suspended' and old.status <> 'suspended' then
    perform private.notify(new.id, 'تم إيقاف المحل مؤقتاً', 'كلّمنا من صفحة المساعدة.', '/support');
  end if;
  return new;
end $$;
create trigger shops_notify after update on public.shops for each row execute function private.on_shop_update();

create or replace function private.on_message_insert() returns trigger language plpgsql security definer set search_path = ''
as $$
declare cust uuid; part text;
begin
  select customer_id, r.part into cust, part from public.requests r where r.id = new.request_id;
  if new.sender_id = new.shop_id then
    perform private.notify(cust, 'رسالة من المحل', coalesce(nullif(new.body, ''), '📷 صورة'), '/chat/' || new.request_id || '/' || new.shop_id);
  else
    perform private.notify(new.shop_id, 'رسالة من العميل · ' || part, coalesce(nullif(new.body, ''), '📷 صورة'), '/chat/' || new.request_id || '/' || new.shop_id);
  end if;
  return new;
end $$;
create trigger messages_notify after insert on public.messages for each row execute function private.on_message_insert();

-- ---------------------------------------------------------------- favorites
create table public.favorites (
  customer_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  shop_id     uuid not null references public.shops (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (customer_id, shop_id)
);
alter table public.favorites enable row level security;
create policy favorites_own on public.favorites for all to authenticated
  using (customer_id = (select auth.uid())) with check (customer_id = (select auth.uid()));

-- ---------------------------------------------------------------- support reports
create table public.reports (
  id          uuid primary key default gen_random_uuid(),
  reporter_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  request_id  uuid references public.requests (id) on delete set null,
  category    text not null check (category in ('order', 'shop', 'customer', 'app', 'other')),
  body        text not null check (char_length(body) between 5 and 1000),
  status      text not null default 'open' check (status in ('open', 'resolved')),
  admin_reply text not null default '',
  created_at  timestamptz not null default now(),
  resolved_at timestamptz
);
alter table public.reports enable row level security;
create policy reports_select on public.reports for select to authenticated
  using (reporter_id = (select auth.uid()) or private.is_admin());
create policy reports_insert on public.reports for insert to authenticated
  with check (reporter_id = (select auth.uid()) and status = 'open' and admin_reply = '');
create policy reports_admin_update on public.reports for update to authenticated
  using (private.is_admin()) with check (private.is_admin());

create or replace function private.on_report_update() returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.admin_reply <> '' and new.admin_reply is distinct from old.admin_reply then
    perform private.notify(new.reporter_id, 'ردّ الدعم على شكوتك', left(new.admin_reply, 120), '/support');
  end if;
  return new;
end $$;
create trigger reports_notify after update on public.reports for each row execute function private.on_report_update();

revoke execute on all functions in schema private from public, anon;
grant execute on function private.is_admin(), private.is_approved_shop(), private.is_chosen_shop_of_customer(uuid),
  private.chose_shop(uuid), private.request_customer(uuid) to authenticated;

alter publication supabase_realtime add table public.messages, public.notifications;

-- Qetaatak: initial schema
-- Customers request parts, approved shops send quotes, customers choose one.
-- Contact details stay hidden until a quote is chosen.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- profiles
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text not null default '',
  phone       text not null default '',
  area        text not null default '',
  car_make    text,
  car_model   text,
  car_year    int check (car_year between 1960 and 2100),
  is_customer boolean not null default false,
  is_shop     boolean not null default false,
  is_admin    boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------- shops
-- Public part of a shop: what customers may see before choosing a quote.
create table public.shops (
  id         uuid primary key references public.profiles (id) on delete cascade,
  area       text not null,
  brands     text[] not null default '{}',
  status     text not null default 'pending' check (status in ('pending', 'approved', 'suspended')),
  created_at timestamptz not null default now()
);

-- Private part of a shop: revealed to a customer only after they choose its quote.
create table public.shop_private (
  id         uuid primary key references public.shops (id) on delete cascade,
  name       text not null,
  owner_name text not null,
  phone      text not null
);

-- ---------------------------------------------------------------- requests
create table public.requests (
  id               uuid primary key default gen_random_uuid(),
  num              bigint generated always as identity (start with 101),
  customer_id      uuid not null references public.profiles (id) on delete cascade,
  part             text not null check (char_length(part) between 2 and 120),
  car_make         text not null,
  car_model        text not null,
  car_year         int not null,
  wanted_condition text not null check (wanted_condition in ('used', 'new', 'any')),
  area             text not null,
  notes            text not null default '' check (char_length(notes) <= 500),
  photo_path       text,
  status           text not null default 'open' check (status in ('open', 'chosen', 'done', 'cancelled')),
  chosen_quote_id  uuid,
  delivery_mode    text check (delivery_mode in ('delivery', 'pickup')),
  rating           int check (rating between 1 and 5),
  created_at       timestamptz not null default now(),
  chosen_at        timestamptz,
  done_at          timestamptz
);
create index requests_customer_idx on public.requests (customer_id);
create index requests_status_idx on public.requests (status, created_at desc);

-- ---------------------------------------------------------------- quotes
create table public.quotes (
  id            uuid primary key default gen_random_uuid(),
  request_id    uuid not null references public.requests (id) on delete cascade,
  shop_id       uuid not null references public.shops (id) on delete cascade,
  price         int not null check (price > 0 and price < 10000000),
  condition     text not null check (condition in ('used_original', 'used_clean', 'new_aftermarket', 'new_original')),
  warranty_days int not null check (warranty_days in (3, 7, 14, 30)),
  photo_path    text,
  created_at    timestamptz not null default now(),
  unique (request_id, shop_id)
);
create index quotes_request_idx on public.quotes (request_id);
create index quotes_shop_idx on public.quotes (shop_id);

alter table public.requests
  add constraint requests_chosen_quote_fk foreign key (chosen_quote_id) references public.quotes (id) on delete set null;

-- ---------------------------------------------------------------- declines
create table public.declines (
  request_id uuid not null references public.requests (id) on delete cascade,
  shop_id    uuid not null references public.shops (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (request_id, shop_id)
);

-- ---------------------------------------------------------------- helpers
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = ''
as $$ select coalesce((select is_admin from public.profiles where id = auth.uid()), false) $$;

create or replace function public.is_approved_shop()
returns boolean language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.shops where id = auth.uid() and status = 'approved') $$;

-- the shop whose quote was chosen on a request owned by `customer`
create or replace function public.is_chosen_shop_of_customer(customer uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.requests r join public.quotes q on q.id = r.chosen_quote_id
    where r.customer_id = customer and q.shop_id = auth.uid()
  )
$$;

-- a customer who chose a quote from `shop`
create or replace function public.chose_shop(shop uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.requests r join public.quotes q on q.id = r.chosen_quote_id
    where r.customer_id = auth.uid() and q.shop_id = shop
  )
$$;

create or replace function public.request_customer(req uuid)
returns uuid language sql stable security definer set search_path = ''
as $$ select customer_id from public.requests where id = req $$;

-- new auth user -> empty profile
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- only admins may change admin flag / shop status
create or replace function public.guard_profile()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if new.is_admin is distinct from old.is_admin and not public.is_admin() and current_user = 'authenticated' then
    raise exception 'not allowed';
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger profiles_guard before update on public.profiles
  for each row execute function public.guard_profile();

create or replace function public.guard_shop()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if current_user = 'authenticated' and not public.is_admin() then
    if tg_op = 'INSERT' then
      new.status := 'pending';
    elsif new.status is distinct from old.status then
      raise exception 'not allowed';
    end if;
  end if;
  return new;
end $$;
create trigger shops_guard before insert or update on public.shops
  for each row execute function public.guard_shop();

-- quotes only on open requests
create or replace function public.guard_quote()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if (select status from public.requests where id = new.request_id) <> 'open' then
    raise exception 'request is closed';
  end if;
  return new;
end $$;
create trigger quotes_guard before insert or update on public.quotes
  for each row execute function public.guard_quote();

-- ---------------------------------------------------------------- request state changes (customers act only through these)
create or replace function public.choose_quote(p_request uuid, p_quote uuid, p_mode text)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if p_mode not in ('delivery', 'pickup') then raise exception 'bad mode'; end if;
  update public.requests r
     set status = 'chosen', chosen_quote_id = p_quote, delivery_mode = p_mode, chosen_at = now()
   where r.id = p_request and r.customer_id = auth.uid() and r.status = 'open'
     and exists (select 1 from public.quotes q where q.id = p_quote and q.request_id = p_request);
  if not found then raise exception 'cannot choose this quote'; end if;
end $$;

create or replace function public.mark_received(p_request uuid)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  update public.requests set status = 'done', done_at = now()
   where id = p_request and customer_id = auth.uid() and status = 'chosen';
  if not found then raise exception 'cannot update'; end if;
end $$;

create or replace function public.rate_request(p_request uuid, p_rating int)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if p_rating not between 1 and 5 then raise exception 'bad rating'; end if;
  update public.requests set rating = p_rating
   where id = p_request and customer_id = auth.uid() and status = 'done';
  if not found then raise exception 'cannot rate'; end if;
end $$;

create or replace function public.cancel_request(p_request uuid)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  update public.requests set status = 'cancelled'
   where id = p_request and customer_id = auth.uid() and status = 'open';
  if not found then raise exception 'cannot cancel'; end if;
end $$;

revoke execute on function public.choose_quote(uuid, uuid, text), public.mark_received(uuid),
  public.rate_request(uuid, int), public.cancel_request(uuid) from public, anon;
grant execute on function public.choose_quote(uuid, uuid, text), public.mark_received(uuid),
  public.rate_request(uuid, int), public.cancel_request(uuid) to authenticated;

-- ---------------------------------------------------------------- row level security
alter table public.profiles     enable row level security;
alter table public.shops        enable row level security;
alter table public.shop_private enable row level security;
alter table public.requests     enable row level security;
alter table public.quotes       enable row level security;
alter table public.declines     enable row level security;

-- profiles: yourself, admins, and the shop you bought from
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or public.is_admin() or public.is_chosen_shop_of_customer(id));
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid()) or public.is_admin())
  with check (id = (select auth.uid()) or public.is_admin());

-- shops (public part): any signed-in user
create policy shops_select on public.shops for select to authenticated using (true);
create policy shops_insert on public.shops for insert to authenticated with check (id = (select auth.uid()));
create policy shops_update on public.shops for update to authenticated
  using (id = (select auth.uid()) or public.is_admin())
  with check (id = (select auth.uid()) or public.is_admin());

-- shop_private: the shop, admins, and customers who chose it
create policy shop_private_select on public.shop_private for select to authenticated
  using (id = (select auth.uid()) or public.is_admin() or public.chose_shop(id));
create policy shop_private_insert on public.shop_private for insert to authenticated with check (id = (select auth.uid()));
create policy shop_private_update on public.shop_private for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- requests: the customer, approved shops, admins. Customers create; state changes go through functions.
create policy requests_select on public.requests for select to authenticated
  using (customer_id = (select auth.uid()) or public.is_approved_shop() or public.is_admin());
create policy requests_insert on public.requests for insert to authenticated
  with check (customer_id = (select auth.uid()) and status = 'open' and chosen_quote_id is null and rating is null);
create policy requests_admin_update on public.requests for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy requests_admin_delete on public.requests for delete to authenticated using (public.is_admin());

-- quotes: the shop that sent it, the request's customer, admins
create policy quotes_select on public.quotes for select to authenticated
  using (shop_id = (select auth.uid()) or public.request_customer(request_id) = (select auth.uid()) or public.is_admin());
create policy quotes_insert on public.quotes for insert to authenticated
  with check (shop_id = (select auth.uid()) and public.is_approved_shop());
create policy quotes_update on public.quotes for update to authenticated
  using (shop_id = (select auth.uid())) with check (shop_id = (select auth.uid()) and public.is_approved_shop());
create policy quotes_delete on public.quotes for delete to authenticated
  using (shop_id = (select auth.uid()) or public.is_admin());

-- declines: the shop's own
create policy declines_all on public.declines for all to authenticated
  using (shop_id = (select auth.uid())) with check (shop_id = (select auth.uid()));

-- ---------------------------------------------------------------- photos
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy photos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy photos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- ---------------------------------------------------------------- live updates
alter publication supabase_realtime add table public.requests, public.quotes, public.shops;

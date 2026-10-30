-- Revenue without fees: home-screen ads and featured shops, both run by the team from the management system.

create table if not exists public.ads (
  id         uuid primary key default gen_random_uuid(),
  title      text not null default '',
  subtitle   text not null default '',
  image_path text,
  link       text not null default '',
  advertiser text not null default '',
  active     boolean not null default true,
  starts_at  timestamptz not null default now(),
  ends_at    timestamptz,
  sort       int not null default 0,
  views      bigint not null default 0,
  clicks     bigint not null default 0,
  created_at timestamptz not null default now()
);
alter table public.ads enable row level security;
create policy ads_read on public.ads for select to authenticated
  using ((active and starts_at <= now() and (ends_at is null or ends_at > now())) or private.is_staff());
create policy ads_staff_insert on public.ads for insert to authenticated with check (private.is_staff());
create policy ads_staff_update on public.ads for update to authenticated using (private.is_staff()) with check (private.is_staff());
create policy ads_staff_delete on public.ads for delete to authenticated using (private.is_staff());

-- views and taps, so advertisers can be shown results
create or replace function public.ad_event(p_ad uuid, p_click boolean) returns void
language sql security definer set search_path = ''
as $$ update public.ads set views = views + case when p_click then 0 else 1 end, clicks = clicks + case when p_click then 1 else 0 end
      where id = p_ad and active $$;

-- featured shops: a badge on their offers and on their page until the date the team sets
alter table public.shops add column if not exists featured_until timestamptz;
create or replace function private.guard_shop_featured() returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.featured_until is distinct from old.featured_until and not private.is_staff() then new.featured_until := old.featured_until; end if;
  return new;
end $$;
create trigger shops_featured_guard before update on public.shops for each row execute function private.guard_shop_featured();

create or replace function public.set_featured(p_shop uuid, p_days int) returns void
language plpgsql security definer set search_path = ''
as $$ begin
  if not private.is_staff() then raise exception 'not allowed'; end if;
  update public.shops set featured_until = case when p_days > 0 then now() + make_interval(days => p_days) else null end where id = p_shop;
end $$;

grant execute on function public.ad_event(uuid, boolean), public.set_featured(uuid, int) to authenticated;
alter publication supabase_realtime add table public.ads;

-- ads pictures live in the public photos bucket under ads/; only staff may upload there
create policy photos_ads_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = 'ads' and (select private.is_staff()));

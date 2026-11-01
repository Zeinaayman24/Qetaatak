-- Phone notifications (Product Register A23, B19, change 1.15/1.27).
-- Every in-app notification also goes to the person's phones through web push.
-- Offers and tips wait during quiet hours (11 pm - 8 am Cairo); several offers on one request
-- within 10 minutes become one push.

create extension if not exists pg_net;
create extension if not exists pg_cron;

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text not null default '',
  created_at timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;
create policy push_subs_own on public.push_subscriptions for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create index if not exists push_subs_user_idx on public.push_subscriptions (user_id);

create table if not exists public.push_outbox (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  body text not null default '',
  link text not null default '',
  n int not null default 1,
  send_after timestamptz not null default now(),
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  attempts int not null default 0
);
alter table public.push_outbox enable row level security; -- no policies: server only
create index if not exists push_outbox_due_idx on public.push_outbox (send_after) where sent_at is null;

-- 11 pm - 8 am in Cairo: the next 8 am; otherwise now
create or replace function private.after_quiet_hours(t timestamptz) returns timestamptz
language sql immutable set search_path = ''
as $$
  select case
    when extract(hour from t at time zone 'Africa/Cairo') >= 23
      then ((date_trunc('day', t at time zone 'Africa/Cairo') + interval '1 day 8 hours') at time zone 'Africa/Cairo')
    when extract(hour from t at time zone 'Africa/Cairo') < 8
      then ((date_trunc('day', t at time zone 'Africa/Cairo') + interval '8 hours') at time zone 'Africa/Cairo')
    else t end;
$$;

create or replace function private.on_notification_push() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare quiet boolean := coalesce(new.link, '') like '/customer/%';
        prev record;
begin
  if not exists (select 1 from public.push_subscriptions where user_id = new.user_id) then return new; end if;
  -- several offers on the same request within 10 minutes: one push
  if new.title = 'وصلك عرض جديد' then
    select * into prev from public.push_outbox
     where user_id = new.user_id and link = new.link and sent_at is null and created_at > now() - interval '10 minutes'
     order by id desc limit 1;
    if prev.id is not null then
      update public.push_outbox set n = prev.n + 1, title = 'وصلك ' || (prev.n + 1) || ' عروض جديدة', body = new.body where id = prev.id;
      return new;
    end if;
  end if;
  insert into public.push_outbox (user_id, title, body, link, send_after)
  values (new.user_id, new.title, coalesce(new.body, ''), coalesce(new.link, ''),
          case when quiet then private.after_quiet_hours(now()) else now() end
            + case when new.title = 'وصلك عرض جديد' then interval '1 minute' else interval '0' end);
  return new;
end $$;

drop trigger if exists notifications_push on public.notifications;
create trigger notifications_push after insert on public.notifications
  for each row execute function private.on_notification_push();

-- the sender runs every minute
-- the shared secret 'push_cron_secret' is created in Vault separately (never in git);
-- the same value is the PUSH_CRON_SECRET secret of the push function.
select cron.schedule('push-sender', '* * * * *', $$
  select net.http_post(
    url := 'https://ztnbyvfupadzhddnbdje.supabase.co/functions/v1/push',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'push_cron_secret')),
    body := '{}'::jsonb)
  where exists (select 1 from public.push_outbox where sent_at is null and send_after <= now());
$$);

-- the push function checks the cron header against Vault (service role only)
create or replace function public.push_secret_ok(p_secret text) returns boolean
language sql stable security definer set search_path = ''
as $$ select exists (select 1 from vault.decrypted_secrets where name = 'push_cron_secret' and decrypted_secret = p_secret) $$;
revoke execute on function public.push_secret_ok(text) from public, anon, authenticated;
grant execute on function public.push_secret_ok(text) to service_role;

-- VAPID private key lives in Vault ('vapid_private_key', created separately); service role reads it
create or replace function public.push_vapid_private() returns text
language sql stable security definer set search_path = ''
as $$ select decrypted_secret from vault.decrypted_secrets where name = 'vapid_private_key' $$;
revoke execute on function public.push_vapid_private() from public, anon, authenticated;
grant execute on function public.push_vapid_private() to service_role;

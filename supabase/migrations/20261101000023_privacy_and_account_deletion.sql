-- A29 privacy page and A30 account deletion (Product Register change 1.19).
-- Order records are kept 5 years without personal data, so we anonymise instead of deleting rows
-- (profiles cascade to orders and requests).

alter table public.profiles
  add column if not exists marketing_consent boolean not null default false,
  add column if not exists marketing_consent_at timestamptz,
  add column if not exists deleted_at timestamptz;

create table if not exists public.data_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('copy', 'delete')),
  status text not null default 'open' check (status in ('open', 'done')),
  created_at timestamptz not null default now(),
  due_at timestamptz not null default now() + interval '30 days',
  done_at timestamptz,
  note text not null default ''
);
alter table public.data_requests enable row level security;
create policy data_requests_own_read on public.data_requests for select to authenticated
  using (user_id = (select auth.uid()) or private.is_staff());
create policy data_requests_staff_update on public.data_requests for update to authenticated
  using (private.is_staff()) with check (private.is_staff());
create index if not exists data_requests_user_idx on public.data_requests (user_id);

create or replace function public.set_marketing_consent(p_on boolean) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'not allowed'; end if;
  update public.profiles set marketing_consent = p_on, marketing_consent_at = now(), updated_at = now() where id = auth.uid();
end $$;

create or replace function public.request_data_copy() returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'not allowed'; end if;
  if exists (select 1 from public.data_requests where user_id = auth.uid() and kind = 'copy' and status = 'open') then
    raise exception 'already requested';
  end if;
  insert into public.data_requests (user_id, kind) values (auth.uid(), 'copy');
  perform private.notify_staff('طلب نسخة بيانات', 'خلال ٣٠ يوم', '/manage');
end $$;

-- What still blocks deletion: open orders, a transfer under review, or money to be refunded.
create or replace function public.account_deletion_blockers() returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'open_orders', (select count(*) from public.orders o where o.customer_id = auth.uid()
                     and (o.status not in ('received', 'cancelled') or o.payment_status in ('review', 'refund_due'))),
    'is_shop', coalesce((select is_shop from public.profiles where id = auth.uid()), false)
  );
$$;

create or replace function public.delete_my_account(p_reason text) returns void
language plpgsql security definer set search_path = ''
as $$
declare uid uuid := auth.uid(); b jsonb;
begin
  if uid is null then raise exception 'not allowed'; end if;
  b := public.account_deletion_blockers();
  if (b->>'is_shop')::boolean then raise exception 'shop account'; end if;
  if (b->>'open_orders')::int > 0 then raise exception 'open orders'; end if;

  insert into public.data_requests (user_id, kind, status, done_at, note)
  values (uid, 'delete', 'done', now(), left(coalesce(p_reason, ''), 200));

  -- personal data out; order and request records stay without it
  delete from public.cars where owner_id = uid;
  delete from public.favorites where customer_id = uid;
  delete from public.notifications where user_id = uid;
  update public.messages set body = 'رسالة محذوفة', photo_path = null where sender_id = uid;
  update public.ticket_messages set body = 'رسالة محذوفة' where sender_id = uid and kind = 'user';
  update public.profiles set
    full_name = 'عميل محذوف', phone = '', email = '', area = '', governorate = '', street = '',
    building = '', floor = '', apartment = '', landmark = '', postal_code = '', country = '',
    car_make = null, car_model = null, car_year = null, car_vin = '',
    marketing_consent = false, deleted_at = now(), is_blocked = true, updated_at = now()
  where id = uid;

  -- the login can never be used again
  update auth.users set email = uid::text || '@deleted.invalid', phone = null, banned_until = 'infinity',
         raw_user_meta_data = '{}'::jsonb, updated_at = now()
   where id = uid;
  delete from auth.sessions where user_id = uid;
  delete from auth.identities where user_id = uid;
end $$;

revoke execute on function public.set_marketing_consent(boolean) from public, anon;
revoke execute on function public.request_data_copy() from public, anon;
revoke execute on function public.account_deletion_blockers() from public, anon;
revoke execute on function public.delete_my_account(text) from public, anon;
grant execute on function public.set_marketing_consent(boolean) to authenticated;
grant execute on function public.request_data_copy() to authenticated;
grant execute on function public.account_deletion_blockers() to authenticated;
grant execute on function public.delete_my_account(text) to authenticated;

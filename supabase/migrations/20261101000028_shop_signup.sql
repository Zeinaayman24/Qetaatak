-- Phase 3: shop sign-up (Product Register B01, B02, B13, B14, B23).
-- Five steps saved as a draft; «ابعت المحل للمراجعة» checks everything required and sends it to staff.

alter table public.shops drop constraint shops_status_check;
alter table public.shops add constraint shops_status_check
  check (status in ('draft', 'pending', 'changes', 'approved', 'suspended', 'closed'));
alter table public.shops
  add column if not exists lat double precision,
  add column if not exists lng double precision,
  add column if not exists hours jsonb not null default '{"open":"10:00","close":"22:00","off":[]}'::jsonb,
  add column if not exists photo_path text,
  add column if not exists review_note text not null default '',
  add column if not exists submitted_at timestamptz,
  add column if not exists approved_at timestamptz,
  add column if not exists agreement_version text,
  add column if not exists agreement_at timestamptz;
alter table public.shops add constraint shops_latlng_chk check ((lat is null) = (lng is null) and (lat is null or (lat between 21 and 32.5 and lng between 24 and 37.5)));

alter table public.shop_private
  add column if not exists payout_name text not null default '',
  add column if not exists doc_id_front text,
  add column if not exists doc_id_back text,
  add column if not exists doc_register text,
  add column if not exists doc_tax text;

-- new shops start as a draft; only staff (or submit_shop) move the status
create or replace function public.guard_shop() returns trigger
language plpgsql set search_path = ''
as $function$
begin
  if current_user = 'authenticated' and not private.is_admin() and coalesce(current_setting('daghta.submit', true), '') <> 'on' then
    if tg_op = 'INSERT' then
      new.status := 'draft';
    elsif new.status is distinct from old.status then
      raise exception 'not allowed';
    end if;
    if tg_op = 'UPDATE' then
      new.review_note := old.review_note; new.approved_at := old.approved_at; new.submitted_at := old.submitted_at;
    end if;
  end if;
  return new;
end $function$;

-- documents: private bucket, each shop sees its own folder, staff see all
insert into storage.buckets (id, name, public) values ('shop-docs', 'shop-docs', false) on conflict (id) do nothing;
create policy shop_docs_own_write on storage.objects for insert to authenticated
  with check (bucket_id = 'shop-docs' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy shop_docs_own_read on storage.objects for select to authenticated
  using (bucket_id = 'shop-docs' and ((storage.foldername(name))[1] = (select auth.uid())::text or private.is_staff()));
create policy shop_docs_own_delete on storage.objects for delete to authenticated
  using (bucket_id = 'shop-docs' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- accepting the merchant agreement (version and time are kept)
create or replace function public.accept_merchant_agreement(p_version text) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'not allowed'; end if;
  update public.shops set agreement_version = left(p_version, 20), agreement_at = now() where id = auth.uid();
  if not found then raise exception 'no shop'; end if;
end $$;

-- «ابعت المحل للمراجعة»: checks what approval needs, then sends it to staff
create or replace function public.submit_shop() returns void
language plpgsql security definer set search_path = ''
as $$
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
  if coalesce(array_length(s.specialties, 1), 0) = 0 then raise exception 'need: specialty'; end if;
  if coalesce(array_length(s.brands, 1), 0) = 0 then raise exception 'need: brand'; end if;
  if s.offers_delivery and (s.fee_area is null or s.fee_city is null) then raise exception 'need: fees'; end if;
  if (p.instapay_address <> '' or p.wallet_number <> '') and trim(p.payout_name) = '' then raise exception 'need: payout name'; end if;
  if p.doc_id_front is null or p.doc_id_back is null or p.doc_register is null then raise exception 'need: documents'; end if;
  if s.agreement_at is null then raise exception 'need: agreement'; end if;
  perform set_config('daghta.submit', 'on', true);
  update public.shops set status = 'pending', submitted_at = now(), review_note = '' where id = s.id;
  perform set_config('daghta.submit', 'off', true);
  if s.status <> 'pending' then perform private.notify_staff('محل جديد للمراجعة', p.name || ' · ' || s.area, '/manage'); end if;
end $$;

-- staff: send back for changes with a reason (management app, C screens)
create or replace function public.request_shop_changes(p_shop uuid, p_reason text) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not private.is_staff() then raise exception 'not allowed'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'reason needed'; end if;
  perform set_config('daghta.submit', 'on', true);
  update public.shops set status = 'changes', review_note = left(p_reason, 500) where id = p_shop and status in ('pending', 'changes');
  perform set_config('daghta.submit', 'off', true);
  if not found then raise exception 'not allowed'; end if;
  perform private.notify(p_shop, 'محتاجين تعديل قبل الموافقة', left(p_reason, 140), '/shop-setup');
end $$;

-- approval time is kept for the shop's history
create or replace function private.on_shop_approved_at() returns trigger language plpgsql security definer set search_path = ''
as $$ begin
  if new.status = 'approved' and old.status is distinct from 'approved' and new.approved_at is null then new.approved_at := now(); end if;
  return new;
end $$;
drop trigger if exists shops_approved_at on public.shops;
create trigger shops_approved_at before update on public.shops for each row execute function private.on_shop_approved_at();

-- transfer details changed after approval: staff are told (SMS confirmation comes with SMS login, Phase 5)
create or replace function private.on_payout_change() returns trigger language plpgsql security definer set search_path = ''
as $$ begin
  if (new.instapay_address, new.wallet_number, new.payout_name) is distinct from (old.instapay_address, old.wallet_number, old.payout_name)
     and exists (select 1 from public.shops where id = new.id and status = 'approved') then
    perform private.notify_staff('محل غيّر بيانات التحويل', new.name, '/manage');
  end if;
  return new;
end $$;
drop trigger if exists shop_private_payout_change on public.shop_private;
create trigger shop_private_payout_change after update on public.shop_private for each row execute function private.on_payout_change();

-- the next time a shop is open (hours are Cairo time; days off are 0 = Sunday … 6 = Saturday)
create or replace function private.shop_next_open(p_shop uuid, t timestamptz) returns timestamptz
language plpgsql stable security definer set search_path = ''
as $$
declare h jsonb; o time; c time; d int; local timestamp := t at time zone 'Africa/Cairo'; day timestamp;
begin
  select hours into h from public.shops where id = p_shop;
  if h is null then return t; end if;
  o := coalesce((h->>'open')::time, '10:00'); c := coalesce((h->>'close')::time, '22:00');
  for d in 0..7 loop
    day := date_trunc('day', local) + make_interval(days => d);
    if not (coalesce(h->'off', '[]'::jsonb) @> to_jsonb(extract(dow from day)::int)) then
      if d = 0 and local::time >= o and local::time < c then return t; end if;
      if d > 0 or local::time < o then return (day + o) at time zone 'Africa/Cairo'; end if;
    end if;
  end loop;
  return t;
end $$;

-- shop pushes wait until the shop opens («الطلبات اللي بتيجي والمحل مقفول بتستنّاك لحد ما تفتح»)
create or replace function private.on_notification_push() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare quiet boolean := coalesce(new.link, '') like '/customer/%';
        is_shop boolean := exists (select 1 from public.shops where id = new.user_id and status = 'approved');
        prev record; at timestamptz;
begin
  if not exists (select 1 from public.push_subscriptions where user_id = new.user_id) then return new; end if;
  if new.title = 'وصلك عرض جديد' then
    select * into prev from public.push_outbox
     where user_id = new.user_id and link = new.link and sent_at is null and created_at > now() - interval '10 minutes'
     order by id desc limit 1;
    if prev.id is not null then
      update public.push_outbox set n = prev.n + 1, title = 'وصلك ' || (prev.n + 1) || ' عروض جديدة', body = new.body where id = prev.id;
      return new;
    end if;
  end if;
  at := case when quiet then private.after_quiet_hours(now())
             when is_shop and coalesce(new.link, '') like '/shop/%' and new.link not like '/shop/order/%' then private.shop_next_open(new.user_id, now())
             else now() end;
  insert into public.push_outbox (user_id, title, body, link, send_after)
  values (new.user_id, new.title, coalesce(new.body, ''), coalesce(new.link, ''),
          at + case when new.title = 'وصلك عرض جديد' then interval '1 minute' else interval '0' end);
  return new;
end $$;

revoke execute on function public.accept_merchant_agreement(text), public.submit_shop(), public.request_shop_changes(uuid, text) from public, anon;
grant execute on function public.accept_merchant_agreement(text), public.submit_shop(), public.request_shop_changes(uuid, text) to authenticated;

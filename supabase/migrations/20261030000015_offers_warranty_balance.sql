-- 1) A shop can send several offers for the same part (different brands / prices), up to 5.
-- 2) Warranty: 0 = none, otherwise the number of days the shop types (1–730).
-- 3) Shop balance: the commission on every received order is recorded. While billing is "free"
--    shops only see what they saved; when it is switched to "owed" they settle it after the sale
--    (no top-up), and staff confirm their payments.

-- ---------------------------------------------------------------- 1) several offers per shop
alter table public.quotes drop constraint quotes_request_id_shop_id_key;
alter table public.quotes
  add column if not exists brand text not null default '',
  add column if not exists note  text not null default '';
alter table public.quotes add constraint quotes_brand_len check (char_length(brand) <= 60);
alter table public.quotes add constraint quotes_note_len check (char_length(note) <= 200);
create index if not exists quotes_request_shop_idx on public.quotes (request_id, shop_id);

-- no phone numbers or links hidden in the brand / note, and at most 5 offers per shop per part
create or replace function private.clean_quote() returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  new.brand := left(private.mask_contacts(coalesce(new.brand, '')), 60);
  new.note := left(private.mask_contacts(coalesce(new.note, '')), 200);
  if tg_op = 'INSERT' and (select count(*) from public.quotes where request_id = new.request_id and shop_id = new.shop_id) >= 5 then
    raise exception 'too many offers';
  end if;
  return new;
end $$;
create trigger quotes_clean before insert or update on public.quotes for each row execute function private.clean_quote();

create or replace function private.on_quote_insert() returns trigger language plpgsql security definer set search_path = ''
as $$
declare r record;
begin
  select * into r from public.requests where id = new.request_id;
  perform private.notify(r.customer_id, 'وصلك عرض جديد',
    r.part || case when new.brand <> '' then ' (' || new.brand || ')' else '' end || ' · ' || new.price || ' ج.م', '/customer/' || r.id);
  return new;
end $$;

-- ---------------------------------------------------------------- 2) warranty days typed by the shop
alter table public.quotes drop constraint quotes_warranty_days_check;
alter table public.quotes add constraint quotes_warranty_days_check check (warranty_days between 0 and 730);

-- ---------------------------------------------------------------- 3) shop balance
insert into public.app_settings (key, value) values ('billing_mode', 'free'), ('commission_pct', '5'), ('owed_limit', '500')
on conflict (key) do nothing;

create table if not exists public.shop_settlements (
  id          uuid primary key default gen_random_uuid(),
  shop_id     uuid not null references public.shops (id) on delete cascade,
  amount      numeric(12, 2) not null check (amount > 0),
  ref         text not null default '',
  proof_path  text,
  status      text not null default 'pending' check (status in ('pending', 'confirmed', 'rejected')),
  note        text not null default '',
  created_at  timestamptz not null default now(),
  reviewed_at timestamptz
);
alter table public.shop_settlements enable row level security;
create policy settlements_select on public.shop_settlements for select to authenticated
  using (shop_id = (select auth.uid()) or private.is_staff());

-- the commission on one received order
create or replace function private.order_fee(p_total numeric) returns numeric language sql stable security definer set search_path = ''
as $$ select round(p_total * coalesce((select value::numeric from public.app_settings where key = 'commission_pct'), 5) / 100) $$;

-- everything the shop's balance screen needs
create or replace function public.my_balance() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare uid uuid := auth.uid(); mode text; pct numeric; lim numeric; fees numeric; paid numeric; rows jsonb;
begin
  if uid is null then raise exception 'not allowed'; end if;
  select coalesce((select value from public.app_settings where key = 'billing_mode'), 'free') into mode;
  select coalesce((select value::numeric from public.app_settings where key = 'commission_pct'), 5) into pct;
  select coalesce((select value::numeric from public.app_settings where key = 'owed_limit'), 500) into lim;
  select coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'order_no', o.order_no, 'at', o.received_at, 'total', o.items_total,
           'fee', private.order_fee(o.items_total), 'parts', private.order_parts(o.id)) order by o.received_at desc), '[]'::jsonb),
         coalesce(sum(private.order_fee(o.items_total)), 0)
    into rows, fees
    from public.orders o where o.shop_id = uid and o.status = 'received';
  select coalesce(sum(amount), 0) into paid from public.shop_settlements where shop_id = uid and status = 'confirmed';
  return jsonb_build_object('mode', mode, 'pct', pct, 'limit', lim, 'fees', fees, 'paid', paid,
    'owed', case when mode = 'owed' then greatest(fees - paid, 0) else 0 end, 'orders', rows,
    'payments', coalesce((select jsonb_agg(to_jsonb(s) order by s.created_at desc) from public.shop_settlements s where s.shop_id = uid), '[]'::jsonb));
end $$;

-- the shop reports a payment of what it owes
create or replace function public.submit_settlement(p_amount numeric, p_ref text, p_path text) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null or not exists (select 1 from public.shops where id = auth.uid()) then raise exception 'not allowed'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'bad amount'; end if;
  if p_path is not null and split_part(p_path, '/', 1) <> auth.uid()::text then raise exception 'bad receipt'; end if;
  insert into public.shop_settlements (shop_id, amount, ref, proof_path) values (auth.uid(), p_amount, left(coalesce(p_ref, ''), 80), p_path);
  perform private.notify_staff('محل دفع عمولة', p_amount || ' ج.م', '/manage');
end $$;

-- staff confirm or reject it
create or replace function public.review_settlement(p_id uuid, p_ok boolean, p_note text) returns void
language plpgsql security definer set search_path = ''
as $$
declare s record;
begin
  if not private.is_staff() then raise exception 'not allowed'; end if;
  update public.shop_settlements set status = case when p_ok then 'confirmed' else 'rejected' end, note = left(coalesce(p_note, ''), 300), reviewed_at = now()
   where id = p_id and status = 'pending' returning * into s;
  if s.id is null then raise exception 'nothing to review'; end if;
  perform private.notify(s.shop_id, case when p_ok then 'اتأكد دفع العمولة ✅' else 'دفع العمولة ماتأكدش' end,
    s.amount || ' ج.م' || case when p_note <> '' then ' · ' || p_note else '' end, '/shop/balance');
end $$;

-- staff overview: per shop, fees so far and what is paid
create or replace function public.shop_balances() returns table (shop_id uuid, orders bigint, fees numeric, paid numeric)
language sql stable security definer set search_path = ''
as $$
  select s.id,
    (select count(*) from public.orders o where o.shop_id = s.id and o.status = 'received'),
    (select coalesce(sum(private.order_fee(o.items_total)), 0) from public.orders o where o.shop_id = s.id and o.status = 'received'),
    (select coalesce(sum(amount), 0) from public.shop_settlements x where x.shop_id = s.id and x.status = 'confirmed')
  from public.shops s where private.is_staff()
$$;

grant execute on function public.my_balance(), public.submit_settlement(numeric, text, text), public.review_settlement(uuid, boolean, text), public.shop_balances() to authenticated;

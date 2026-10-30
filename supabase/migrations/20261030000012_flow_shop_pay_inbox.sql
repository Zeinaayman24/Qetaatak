-- 1) A simpler order flow: preparing -> ready -> received (the customer confirms receipt).
-- 2) InstaPay / wallet transfers go to the SHOP: the shop sets its details, the customer uploads the receipt,
--    the shop confirms it (staff can still step in).
-- 3) A messages inbox: chats leave the notifications list and get their own unread counts.

-- ---------------------------------------------------------------- 1) order flow
update public.orders set status = 'ready', updated_at = now() where status in ('out_for_delivery', 'delivered');
update public.requests set order_status = 'ready' where order_status in ('out_for_delivery', 'delivered') and status = 'chosen';

create or replace function public.set_order_status(p_order uuid, p_status text) returns void
language plpgsql security definer set search_path = ''
as $$
declare o record;
begin
  select * into o from public.orders where id = p_order for update;
  if o.id is null or auth.uid() is null or o.shop_id is distinct from auth.uid() then raise exception 'not allowed'; end if;
  if o.status in ('received', 'cancelled') then raise exception 'order closed'; end if;
  if p_status not in ('preparing', 'ready') then raise exception 'bad status'; end if;
  if p_status = 'ready' and o.payment_method in ('instapay', 'card') and o.payment_status <> 'paid' then
    raise exception 'payment pending';
  end if;
  update public.orders set status = p_status, updated_at = now() where id = p_order;
  update public.requests set order_status = p_status where order_id = p_order;
end $$;

create or replace function private.on_order_update() returns trigger language plpgsql security definer set search_path = ''
as $$
declare parts text := coalesce(private.order_parts(new.id), 'أوردر #' || new.order_no);
begin
  if new.status is distinct from old.status then
    if new.status = 'ready' then
      perform private.notify(new.customer_id,
        case when new.delivery_mode = 'delivery' then 'أوردرك جاهز وخارج ليك 🛵' else 'أوردرك جاهز للاستلام من المحل' end,
        parts, '/order/' || new.id);
    elsif new.status = 'received' then
      perform private.notify(new.shop_id, 'العميل استلم أوردر #' || new.order_no, parts, '/shop/order/' || new.id);
    elsif new.status = 'cancelled' then
      perform private.notify(new.shop_id, 'العميل لغى أوردر #' || new.order_no, parts, '/shop/order/' || new.id);
    end if;
  end if;
  if new.rating is not null and new.rating is distinct from old.rating then
    perform private.notify(new.shop_id, 'وصلك تقييم ' || new.rating || ' من ٥', coalesce(nullif(new.review, ''), parts), '/shop/order/' || new.id);
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------- 2) transfers to the shop
alter table public.shop_private
  add column if not exists instapay_address text not null default '',
  add column if not exists wallet_number    text not null default '';

-- which of these shops accept transfers (yes/no only: no details before the order)
create or replace function public.shop_pay_options(p_shops uuid[]) returns table (shop_id uuid, instapay boolean)
language sql stable security definer set search_path = ''
as $$ select id, (instapay_address <> '' or wallet_number <> '') from public.shop_private where id = any (p_shops) $$;

create or replace function public.place_order(p_choices jsonb, p_payment text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare made jsonb;
begin
  if auth.uid() is null then raise exception 'not allowed'; end if;
  if p_payment not in ('cash', 'shop', 'instapay', 'card') then raise exception 'bad payment method'; end if;
  if p_payment = 'shop' and exists (
    select 1 from jsonb_to_recordset(p_choices) as x(request uuid, quote uuid, mode text) where x.mode is distinct from 'pickup'
  ) then raise exception 'pay at shop needs pickup'; end if;
  if p_payment = 'instapay' and exists (
    select 1 from jsonb_to_recordset(p_choices) as x(request uuid, quote uuid, mode text)
      join public.quotes q on q.id = x.quote
      join public.shop_private sp on sp.id = q.shop_id
     where sp.instapay_address = '' and sp.wallet_number = ''
  ) then raise exception 'shop has no transfer details'; end if;
  made := public.accept_offers(p_choices);
  update public.orders
     set payment_method = p_payment,
         payment_status = case when p_payment in ('instapay', 'card') then 'awaiting' else 'unpaid' end
   where id in (select (jsonb_array_elements_text(made))::uuid);
  return made;
end $$;

create or replace function public.submit_payment_proof(p_order uuid, p_path text, p_ref text) returns void
language plpgsql security definer set search_path = ''
as $$
declare o record;
begin
  select * into o from public.orders where id = p_order for update;
  if o.id is null or auth.uid() is null or o.customer_id is distinct from auth.uid() then raise exception 'not allowed'; end if;
  if o.payment_method <> 'instapay' then raise exception 'not a transfer order'; end if;
  if o.payment_status not in ('awaiting', 'failed', 'review') then raise exception 'payment already settled'; end if;
  if o.status = 'cancelled' then raise exception 'order closed'; end if;
  if p_path is null or split_part(p_path, '/', 1) <> auth.uid()::text then raise exception 'bad receipt'; end if;
  update public.orders
     set payment_proof = p_path, payment_ref = left(coalesce(p_ref, ''), 80), payment_status = 'review', payment_note = '', updated_at = now()
   where id = p_order;
  perform private.notify(o.shop_id, 'العميل حوّل فلوس أوردر #' || o.order_no, 'راجع الإيصال وأكّد إن الفلوس وصلتك · ' || (o.items_total + o.delivery_fee) || ' ج.م', '/shop/order/' || o.id);
end $$;

-- the shop (or staff) confirms or rejects the transfer
create or replace function public.review_payment(p_order uuid, p_ok boolean, p_note text) returns void
language plpgsql security definer set search_path = ''
as $$
declare o record;
begin
  select * into o from public.orders where id = p_order for update;
  if o.id is null then raise exception 'not found'; end if;
  if auth.uid() is null or (o.shop_id is distinct from auth.uid() and not private.is_staff()) then raise exception 'not allowed'; end if;
  if o.payment_method <> 'instapay' or o.payment_status not in ('review', 'awaiting', 'failed') then raise exception 'nothing to review'; end if;
  if p_ok then
    update public.orders set payment_status = 'paid', paid_at = now(), payment_note = '', updated_at = now() where id = p_order;
  else
    update public.orders set payment_status = 'failed', payment_note = left(coalesce(p_note, ''), 300), updated_at = now() where id = p_order;
  end if;
end $$;

-- refunds: the shop sends back transfers it received; staff handle card refunds (or step in)
create or replace function public.mark_refunded(p_order uuid, p_note text) returns void
language plpgsql security definer set search_path = ''
as $$
declare o record;
begin
  select * into o from public.orders where id = p_order for update;
  if o.id is null or auth.uid() is null then raise exception 'not allowed'; end if;
  if not (private.is_staff() or (o.shop_id = auth.uid() and o.payment_method = 'instapay')) then raise exception 'not allowed'; end if;
  if o.payment_status <> 'refund_due' then raise exception 'nothing to refund'; end if;
  update public.orders set payment_status = 'refunded', payment_note = left(coalesce(p_note, ''), 300), updated_at = now() where id = p_order;
end $$;

create or replace function private.on_order_payment_notice() returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.payment_status is distinct from old.payment_status then
    if new.payment_status = 'paid' and new.payment_method = 'instapay' then
      perform private.notify(new.customer_id, 'المحل أكّد إن التحويل وصله ✅', 'أوردر #' || new.order_no || ' · بيتجهّز دلوقتي', '/order/' || new.id);
    elsif new.payment_status = 'paid' and new.payment_method = 'card' then
      perform private.notify(new.customer_id, 'الدفع اتأكد ✅', 'أوردر #' || new.order_no || ' · المحل بيجهّزه', '/order/' || new.id);
      perform private.notify(new.shop_id, 'العميل دفع أوردر #' || new.order_no || ' بالبطاقة', 'ابدأ جهّز القطع', '/shop/order/' || new.id);
    elsif new.payment_status = 'failed' then
      perform private.notify(new.customer_id, 'الدفع ماتمّش', coalesce(nullif(new.payment_note, ''), 'جرّب تاني من صفحة الأوردر'), '/order/' || new.id);
    elsif new.payment_status = 'refund_due' and new.payment_method = 'instapay' then
      perform private.notify(new.shop_id, 'أوردر #' || new.order_no || ' اتلغى بعد التحويل', 'رجّع ' || (new.items_total + new.delivery_fee) || ' ج.م للعميل وسجّل ده من صفحة الأوردر', '/shop/order/' || new.id);
    elsif new.payment_status = 'refund_due' then
      perform private.notify_staff('أوردر مدفوع بالبطاقة اتلغى · محتاج استرجاع', 'أوردر #' || new.order_no || ' · ' || (new.items_total + new.delivery_fee) || ' ج.م', '/manage');
    end if;
  end if;
  return new;
end $$;

-- the shop can open the receipt attached to its own order
create policy receipts_shop_read on storage.objects for select to authenticated
  using (bucket_id = 'receipts' and exists (
    select 1 from public.orders o where o.payment_proof = storage.objects.name and o.shop_id = (select auth.uid())
  ));

-- ---------------------------------------------------------------- 3) messages inbox
create table if not exists public.chat_reads (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  request_id uuid not null references public.requests (id) on delete cascade,
  shop_id    uuid not null references public.shops (id) on delete cascade,
  read_at    timestamptz not null default now(),
  primary key (user_id, request_id, shop_id)
);
alter table public.chat_reads enable row level security;
create policy chat_reads_own on public.chat_reads for select to authenticated using (user_id = (select auth.uid()));

create or replace function public.mark_chat_read(p_request uuid, p_shop uuid) returns void
language sql security definer set search_path = ''
as $$
  insert into public.chat_reads (user_id, request_id, shop_id, read_at) values (auth.uid(), p_request, p_shop, now())
  on conflict (user_id, request_id, shop_id) do update set read_at = now()
$$;

-- every conversation the person is in, newest first, with what the other side is called and how many are unread
create or replace function public.my_inbox() returns table (
  request_id uuid, shop_id uuid, num bigint, part text, me_is_shop boolean, other_name text,
  last_body text, last_photo boolean, last_mine boolean, last_at timestamptz, unread bigint, ordered boolean
)
language sql stable security definer set search_path = ''
as $$
  with threads as (
    select m.request_id, m.shop_id from public.messages m
      join public.requests r on r.id = m.request_id
     where r.customer_id = auth.uid() or m.shop_id = auth.uid()
     group by m.request_id, m.shop_id
  )
  select t.request_id, t.shop_id, r.num, r.part, (t.shop_id = auth.uid()) as me_is_shop,
    case when t.shop_id = auth.uid()
         then coalesce(split_part(cp.full_name, ' ', 1), 'العميل')
         when exists (select 1 from public.orders o where o.customer_id = r.customer_id and o.shop_id = t.shop_id and o.id = r.order_id)
         then coalesce(sp.name, 'المحل')
         else 'محل في ' || coalesce(s.area, '—') end,
    lm.body, lm.photo_path is not null, lm.sender_id = auth.uid(), lm.created_at,
    (select count(*) from public.messages x
      where x.request_id = t.request_id and x.shop_id = t.shop_id and x.sender_id <> auth.uid()
        and x.created_at > coalesce((select cr.read_at from public.chat_reads cr where cr.user_id = auth.uid() and cr.request_id = t.request_id and cr.shop_id = t.shop_id), '-infinity')),
    r.order_id is not null
  from threads t
  join public.requests r on r.id = t.request_id
  join public.shops s on s.id = t.shop_id
  left join public.shop_private sp on sp.id = t.shop_id
  left join public.profiles cp on cp.id = r.customer_id
  cross join lateral (
    select m.body, m.photo_path, m.sender_id, m.created_at from public.messages m
     where m.request_id = t.request_id and m.shop_id = t.shop_id order by m.created_at desc limit 1
  ) lm
  order by lm.created_at desc
$$;

-- chats no longer create notifications: they live in the messages tab
create or replace function private.on_message_insert() returns trigger language plpgsql security definer set search_path = ''
as $$ begin return new; end $$;

grant execute on function public.shop_pay_options(uuid[]), public.mark_chat_read(uuid, uuid), public.my_inbox() to authenticated;

-- 1) Shops are no longer anonymous: customers see the shop's name, rating and how fast it usually replies.
--    The customer stays hidden from the shop (first name only) until they place an order with it.
-- 2) Reply speed: how long each request waited for a shop's first answer (offer or "not available").

-- first answer of a shop to a request: its earliest offer or its decline
create or replace function private.first_answer(p_request uuid, p_shop uuid) returns timestamptz
language sql stable security definer set search_path = ''
as $$ select least((select min(q.created_at) from public.quotes q where q.request_id = p_request and q.shop_id = p_shop),
                   (select d.created_at from public.declines d where d.request_id = p_request and d.shop_id = p_shop)) $$;

-- typical minutes a shop takes to answer (median over the last 90 days)
create or replace function private.reply_minutes(p_shop uuid) returns int
language sql stable security definer set search_path = ''
as $$
  select round(percentile_cont(0.5) within group (order by extract(epoch from a.at - r.created_at) / 60))::int
    from (select request_id, min(created_at) as at from (
            select request_id, created_at from public.quotes where shop_id = p_shop
            union all select request_id, created_at from public.declines where shop_id = p_shop) x group by request_id) a
    join public.requests r on r.id = a.request_id
   where r.created_at > now() - interval '90 days'
$$;

-- what the customer sees about the shops that sent offers
create or replace function public.shop_cards(p_shops uuid[]) returns table (
  id uuid, name text, area text, rating numeric, ratings bigint, sales bigint, reply_min int
)
language sql stable security definer set search_path = ''
as $$
  select s.id, coalesce(nullif(sp.name, ''), 'محل في ' || s.area), s.area,
    (select round(avg(o.rating)::numeric, 1) from public.orders o where o.shop_id = s.id and o.rating is not null),
    (select count(o.rating) from public.orders o where o.shop_id = s.id),
    (select count(*) from public.orders o where o.shop_id = s.id and o.status = 'received'),
    private.reply_minutes(s.id)
  from public.shops s left join public.shop_private sp on sp.id = s.id
  where s.id = any (p_shops) and s.status = 'approved'
$$;

-- shop page: add the name and reply speed
create or replace function public.shop_profile(p_shop uuid)
returns json language sql stable security definer set search_path = ''
as $$
  select json_build_object(
    'shop', (select json_build_object('id', s.id, 'name', coalesce(nullif(sp.name, ''), 'محل في ' || s.area), 'area', s.area, 'governorate', s.governorate,
              'shop_type', s.shop_type, 'specialties', s.specialties, 'brands', s.brands, 'offers_delivery', s.offers_delivery, 'since', s.created_at,
              'reply_min', private.reply_minutes(s.id))
             from public.shops s left join public.shop_private sp on sp.id = s.id where s.id = p_shop and s.status = 'approved'),
    'sales', (select count(*) from public.requests r join public.quotes q on q.id = r.chosen_quote_id where q.shop_id = p_shop and r.status in ('chosen', 'done')),
    'rating', (select round(avg(r.rating)::numeric, 1) from public.requests r join public.quotes q on q.id = r.chosen_quote_id where q.shop_id = p_shop and r.rating is not null),
    'ratings', (select count(r.rating) from public.requests r join public.quotes q on q.id = r.chosen_quote_id where q.shop_id = p_shop),
    'reviews', coalesce((select json_agg(x order by x.at desc) from (
        select r.rating, r.review, r.part, r.done_at as at, split_part(p.full_name, ' ', 1) as first_name
        from public.requests r join public.quotes q on q.id = r.chosen_quote_id join public.profiles p on p.id = r.customer_id
        where q.shop_id = p_shop and r.rating is not null order by r.done_at desc limit 20) x), '[]'::json)
  )
$$;

-- inbox: the customer always sees the shop's name; the shop sees only "عميل" until the customer orders from it
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
    case when t.shop_id = auth.uid() then
           case when exists (select 1 from public.orders o where o.id = r.order_id and o.shop_id = t.shop_id)
                then coalesce(nullif(split_part(cp.full_name, ' ', 1), ''), 'العميل') else 'عميل في ' || coalesce(r.area, '—') end
         else coalesce(nullif(sp.name, ''), 'محل في ' || coalesce(s.area, '—')) end,
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

-- management: reply speed per shop, including requests it still hasn't answered
create or replace function public.shop_speed() returns table (
  shop_id uuid, answered bigint, median_min int, avg_min int, within_15 bigint, waiting bigint, oldest_wait_min int
)
language sql stable security definer set search_path = ''
as $$
  with seen as (   -- requests each approved shop could answer (its brands, after it joined, last 90 days)
    select s.id as shop_id, r.id as request_id, r.created_at, r.status, private.first_answer(r.id, s.id) as at
      from public.shops s join public.requests r
        on r.created_at > greatest(s.created_at, now() - interval '90 days')
       and (cardinality(s.brands) = 0 or r.car_make = any (s.brands)) and r.customer_id <> s.id
     where s.status = 'approved' and private.is_staff()
  )
  select shop_id,
    count(at),
    round(percentile_cont(0.5) within group (order by extract(epoch from at - created_at) / 60) filter (where at is not null))::int,
    round(avg(extract(epoch from at - created_at) / 60) filter (where at is not null))::int,
    count(*) filter (where at is not null and at - created_at <= interval '15 minutes'),
    count(*) filter (where at is null and status = 'open'),
    round(max(extract(epoch from now() - created_at) / 60) filter (where at is null and status = 'open'))::int
  from seen group by shop_id
$$;

-- management: each open request, how long it has waited and when the first answer came
create or replace function public.request_waits() returns table (request_id uuid, first_answer_at timestamptz, answers bigint)
language sql stable security definer set search_path = ''
as $$
  select r.id,
    least((select min(q.created_at) from public.quotes q where q.request_id = r.id), (select min(d.created_at) from public.declines d where d.request_id = r.id)),
    (select count(distinct q.shop_id) from public.quotes q where q.request_id = r.id) + (select count(*) from public.declines d where d.request_id = r.id)
  from public.requests r where r.created_at > now() - interval '30 days' and private.is_staff()
$$;

grant execute on function public.shop_cards(uuid[]), public.shop_speed(), public.request_waits() to authenticated;

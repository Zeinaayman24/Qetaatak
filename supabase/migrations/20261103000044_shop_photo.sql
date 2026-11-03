-- The shop's picture (shops.photo_path) was saved but never shown. Return it with the shop's
-- public page and with the shop cards on offers.
create or replace function public.shop_profile(p_shop uuid)
returns json language sql stable security definer set search_path = ''
as $function$
  select json_build_object(
    'shop', (select json_build_object('id', s.id, 'name', coalesce(nullif(sp.name, ''), 'محل في ' || s.area), 'area', s.area, 'governorate', s.governorate,
              'shop_type', s.shop_type, 'specialties', s.specialties, 'brands', s.brands, 'offers_delivery', s.offers_delivery, 'since', s.created_at,
              'reply_min', private.reply_minutes(s.id), 'photo_path', s.photo_path)
             from public.shops s left join public.shop_private sp on sp.id = s.id where s.id = p_shop and s.status = 'approved'),
    'sales', (select count(*) from public.requests r join public.quotes q on q.id = r.chosen_quote_id where q.shop_id = p_shop and r.status in ('chosen', 'done')),
    'rating', (select round(avg(r.rating)::numeric, 1) from public.requests r join public.quotes q on q.id = r.chosen_quote_id where q.shop_id = p_shop and r.rating is not null),
    'ratings', (select count(r.rating) from public.requests r join public.quotes q on q.id = r.chosen_quote_id where q.shop_id = p_shop),
    'reviews', coalesce((select json_agg(x order by x.at desc) from (
        select r.rating, r.review, r.part, r.done_at as at, split_part(p.full_name, ' ', 1) as first_name
        from public.requests r join public.quotes q on q.id = r.chosen_quote_id join public.profiles p on p.id = r.customer_id
        where q.shop_id = p_shop and r.rating is not null order by r.done_at desc limit 20) x), '[]'::json)
  )
$function$;

drop function public.shop_cards(uuid[]);
create function public.shop_cards(p_shops uuid[])
returns table (id uuid, name text, area text, rating numeric, ratings bigint, sales bigint, reply_min integer, photo_path text)
language sql stable security definer set search_path = ''
as $function$
  select s.id, coalesce(nullif(sp.name, ''), 'محل في ' || s.area), s.area,
    (select round(avg(o.rating)::numeric, 1) from public.orders o where o.shop_id = s.id and o.rating is not null),
    (select count(o.rating) from public.orders o where o.shop_id = s.id),
    (select count(*) from public.orders o where o.shop_id = s.id and o.status = 'received'),
    private.reply_minutes(s.id), s.photo_path
  from public.shops s left join public.shop_private sp on sp.id = s.id
  where s.id = any (p_shops) and s.status = 'approved'
$function$;
revoke execute on function public.shop_cards(uuid[]) from public, anon;
grant execute on function public.shop_cards(uuid[]) to authenticated;

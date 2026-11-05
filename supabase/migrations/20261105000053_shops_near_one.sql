-- shops_near can also return one shop (for its public page), and says since when the shop is on Daghta.
drop function public.shops_near(double precision, double precision, double precision);
create or replace function public.shops_near(p_lat double precision default null, p_lng double precision default null, p_km double precision default null, p_shop uuid default null)
returns table (id uuid, name text, area text, governorate text, address text, phone text, phone2 text, lat double precision, lng double precision,
               km double precision, photo_path text, photos text[], about text, hours jsonb, sells boolean, installs boolean,
               offers_delivery boolean, brands text[], specialties text[], shop_type text, rating numeric, ratings bigint, sales bigint,
               featured boolean, services text[], since timestamptz)
language sql stable security definer set search_path = ''
as $$
  select * from (
    select s.id, coalesce(nullif(sp.name, ''), 'محل في ' || s.area) as name, s.area, s.governorate,
      concat_ws('، ', nullif(sp.street, ''), case when coalesce(sp.building, '') <> '' then 'عمارة ' || sp.building end,
                nullif(sp.landmark, ''), nullif(s.area, ''), nullif(s.governorate, '')),
      coalesce(sp.phone, ''), coalesce(sp.phone2, ''), s.lat, s.lng,
      case when p_lat is null or p_lng is null or s.lat is null or s.lng is null then null
           else 6371 * 2 * asin(sqrt(power(sin(radians(s.lat - p_lat) / 2), 2)
                + cos(radians(p_lat)) * cos(radians(s.lat)) * power(sin(radians(s.lng - p_lng) / 2), 2))) end as km,
      s.photo_path, s.photos, s.about, s.hours, s.sells, s.installs, s.offers_delivery, s.brands, s.specialties, s.shop_type,
      (select round(avg(x.r)::numeric, 1) from (
         select o.rating as r from public.orders o where o.shop_id = s.id and o.rating is not null
         union all select b.rating from public.bookings b where b.shop_id = s.id and b.rating is not null) x),
      (select count(*) from public.orders o where o.shop_id = s.id and o.rating is not null)
        + (select count(*) from public.bookings b where b.shop_id = s.id and b.rating is not null),
      (select count(*) from public.orders o where o.shop_id = s.id and o.status = 'received')
        + (select count(*) from public.bookings b where b.shop_id = s.id and b.status = 'done'),
      coalesce(s.featured_until > now(), false),
      coalesce((select array_agg(x.service_id order by x.service_id) from public.shop_install_services x where x.shop_id = s.id), '{}'),
      coalesce(s.approved_at, s.created_at)
    from public.shops s left join public.shop_private sp on sp.id = s.id
    where s.status = 'approved' and auth.uid() is not null and (p_shop is null or s.id = p_shop)
  ) t
  where p_km is null or (t.km is not null and t.km <= p_km)
  order by t.km nulls last, t.name
  limit 500
$$;
revoke execute on function public.shops_near(double precision, double precision, double precision, uuid) from public, anon;
grant execute on function public.shops_near(double precision, double precision, double precision, uuid) to authenticated;

-- Customer can cancel an open installation request; both sides of a booking can see who the other one is.
create or replace function public.cancel_install_request(p_request uuid)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  update public.install_requests set status = 'cancelled' where id = p_request and customer_id = auth.uid() and status = 'open';
  if not found then raise exception 'not allowed'; end if;
end $$;

create or replace function public.booking_people(p_booking uuid)
returns table (shop_name text, shop_phone text, shop_address text, shop_lat double precision, shop_lng double precision,
               customer_name text, customer_phone text, service text, car text, part_desc text, photo_path text, notes text)
language sql stable security definer set search_path = ''
as $$
  select coalesce(nullif(sp.name, ''), 'محل في ' || s.area), coalesce(sp.phone, ''),
         concat_ws('، ', nullif(sp.street, ''), case when coalesce(sp.building, '') <> '' then 'عمارة ' || sp.building end, nullif(sp.landmark, ''), nullif(s.area, ''), nullif(s.governorate, '')),
         s.lat, s.lng,
         p.full_name, coalesce(p.phone, ''),
         coalesce(sv.name_ar, ''), concat_ws(' ', r.car_make, nullif(r.car_model, ''), r.car_year::text), coalesce(r.part_desc, ''), r.photo_path, coalesce(r.notes, '')
    from public.bookings b
    join public.shops s on s.id = b.shop_id left join public.shop_private sp on sp.id = b.shop_id
    join public.profiles p on p.id = b.customer_id
    left join public.install_requests r on r.id = b.request_id left join public.install_services sv on sv.id = r.service_id
   where b.id = p_booking and (b.customer_id = auth.uid() or b.shop_id = auth.uid() or private.is_staff())
$$;

revoke execute on function public.cancel_install_request(uuid), public.booking_people(uuid) from public, anon;
grant execute on function public.cancel_install_request(uuid), public.booking_people(uuid) to authenticated;

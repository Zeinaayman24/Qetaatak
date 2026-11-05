-- Staff settle an installation booking: close a dispute as done or cancelled, or cancel any booking that is stuck.
create or replace function public.staff_resolve_booking(p_booking uuid, p_outcome text, p_note text)
returns void language plpgsql security definer set search_path = ''
as $$
declare b public.bookings; note text := left(coalesce(p_note, ''), 300);
begin
  if not private.is_staff() then raise exception 'not allowed'; end if;
  if p_outcome not in ('done', 'cancelled') or note = '' then raise exception 'reason needed'; end if;
  select * into b from public.bookings where id = p_booking for update;
  if b.id is null or b.status in ('done', 'cancelled') then raise exception 'not allowed'; end if;
  update public.bookings
     set status = p_outcome, cancelled_by = case when p_outcome = 'cancelled' then 'staff' else cancelled_by end,
         cancel_note = case when p_outcome = 'cancelled' then note else cancel_note end,
         done_at = case when p_outcome = 'done' then now() else done_at end, updated_at = now()
   where id = b.id;
  perform private.notify(b.customer_id, 'فريق ضغطة قفل الحجز', 'حجز #' || b.num || ' · ' || note, '/booking/' || b.id);
  perform private.notify(b.shop_id, 'فريق ضغطة قفل الحجز', 'حجز #' || b.num || ' · ' || note, '/shop/booking/' || b.id);
end $$;
revoke execute on function public.staff_resolve_booking(uuid, text, text) from public, anon;
grant execute on function public.staff_resolve_booking(uuid, text, text) to authenticated;

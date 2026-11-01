-- A17 «عدّل الطلب»: the customer can change the condition, side, note and photo while the request is open.
create or replace function public.edit_request(p_request uuid, p_condition text, p_side text, p_notes text, p_photo text) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'not allowed'; end if;
  if p_condition not in ('any', 'used', 'new') then raise exception 'bad condition'; end if;
  if p_photo is not null and split_part(p_photo, '/', 1) <> auth.uid()::text then raise exception 'bad photo'; end if;
  update public.requests
     set wanted_condition = p_condition, side = coalesce(p_side, side), notes = left(coalesce(trim(p_notes), ''), 300),
         photo_path = coalesce(p_photo, photo_path)
   where id = p_request and customer_id = auth.uid() and status = 'open';
  if not found then raise exception 'request is closed'; end if;
end $$;
revoke execute on function public.edit_request(uuid, text, text, text, text) from public, anon;
grant execute on function public.edit_request(uuid, text, text, text, text) to authenticated;

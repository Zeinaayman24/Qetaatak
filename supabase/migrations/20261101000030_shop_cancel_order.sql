-- B10 «مش هقدر أسلّم الأوردر»: the shop cancels while preparing, with a reason.
-- The parts go back to the customer's request and this shop's offers on them are removed.
create or replace function public.shop_cancel_order(p_order uuid, p_reason text) returns void
language plpgsql security definer set search_path = ''
as $function$
declare o record; ids uuid[];
begin
  select * into o from public.orders where id = p_order for update;
  if o.id is null or auth.uid() is null or o.shop_id is distinct from auth.uid() then raise exception 'not allowed'; end if;
  if o.status <> 'preparing' then raise exception 'too late to cancel'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'reason needed'; end if;
  select array_agg(id) into ids from public.requests where order_id = p_order;
  update public.orders set status = 'cancelled', cancel_reason = 'shop: ' || left(trim(p_reason), 200), updated_at = now() where id = p_order;
  update public.requests set status = 'open', chosen_quote_id = null, delivery_mode = null, chosen_at = null, order_status = null, order_id = null
   where order_id = p_order;
  delete from public.quotes where shop_id = o.shop_id and request_id = any (ids);
  perform private.notify(o.customer_id, 'المحل لغى أوردر #' || o.order_no, 'القطع رجعت للطلب وتقدر تختار عرض تاني.', '/order/' || o.id);
end $function$;
revoke execute on function public.shop_cancel_order(uuid, text) from public, anon;
grant execute on function public.shop_cancel_order(uuid, text) to authenticated;

-- the customer's own cancellation is labelled too (shop page shows «العميل لغى الأوردر ده.»)
create or replace function public.cancel_order(p_order uuid) returns void
language plpgsql security definer set search_path = ''
as $function$
declare o record;
begin
  select * into o from public.orders where id = p_order for update;
  if o.id is null or auth.uid() is null or o.customer_id is distinct from auth.uid() then raise exception 'not allowed'; end if;
  if o.status <> 'preparing' then raise exception 'too late to cancel'; end if;
  update public.orders set status = 'cancelled', cancel_reason = 'customer', updated_at = now() where id = p_order;
  update public.requests set status = 'open', chosen_quote_id = null, delivery_mode = null, chosen_at = null, order_status = null, order_id = null
   where order_id = p_order;
end $function$;

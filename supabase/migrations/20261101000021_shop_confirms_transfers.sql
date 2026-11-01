-- InstaPay / wallet money goes straight to the shop, so the shop alone confirms it arrived
-- and the shop alone records sending it back. Daghta staff can only remind the shop.
-- Card refunds (money collected by Daghta through Paymob) stay with staff.

create or replace function public.review_payment(p_order uuid, p_ok boolean, p_note text) returns void
language plpgsql security definer set search_path = ''
as $$
declare o record;
begin
  select * into o from public.orders where id = p_order for update;
  if o.id is null then raise exception 'not found'; end if;
  if auth.uid() is null or o.shop_id is distinct from auth.uid() then raise exception 'not allowed'; end if;
  if o.payment_method <> 'instapay' or o.payment_status not in ('review', 'awaiting', 'failed') then raise exception 'nothing to review'; end if;
  if p_ok then
    update public.orders set payment_status = 'paid', paid_at = now(), payment_note = '', updated_at = now() where id = p_order;
  else
    update public.orders set payment_status = 'failed', payment_note = left(coalesce(p_note, ''), 300), updated_at = now() where id = p_order;
  end if;
end $$;

create or replace function public.mark_refunded(p_order uuid, p_note text) returns void
language plpgsql security definer set search_path = ''
as $$
declare o record;
begin
  select * into o from public.orders where id = p_order for update;
  if o.id is null or auth.uid() is null then raise exception 'not allowed'; end if;
  if not ((o.payment_method = 'instapay' and o.shop_id = auth.uid())
       or (o.payment_method = 'card' and private.is_staff())) then raise exception 'not allowed'; end if;
  if o.payment_status <> 'refund_due' then raise exception 'nothing to refund'; end if;
  update public.orders set payment_status = 'refunded', payment_note = left(coalesce(p_note, ''), 300), updated_at = now() where id = p_order;
end $$;

-- staff nudge: reminds the shop to check a transfer receipt or to send back a refund
create or replace function public.remind_shop_payment(p_order uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare o record;
begin
  if not private.is_staff() then raise exception 'not allowed'; end if;
  select * into o from public.orders where id = p_order;
  if o.id is null or o.payment_method <> 'instapay' then raise exception 'not found'; end if;
  if o.payment_status = 'review' then
    perform private.notify(o.shop_id, 'تذكير: العميل مستني تأكيد التحويل', 'أوردر #' || o.order_no || ' · راجع الإيصال وأكّد إن الفلوس وصلتك', '/shop/order/' || o.id);
  elsif o.payment_status = 'refund_due' then
    perform private.notify(o.shop_id, 'تذكير: رجّع فلوس العميل', 'أوردر #' || o.order_no || ' اتلغى بعد التحويل · رجّع ' || (o.items_total + o.delivery_fee) || ' ج.م وسجّل', '/shop/order/' || o.id);
  else
    raise exception 'nothing to remind';
  end if;
end $$;

revoke execute on function public.remind_shop_payment(uuid) from public, anon;
grant execute on function public.remind_shop_payment(uuid) to authenticated;

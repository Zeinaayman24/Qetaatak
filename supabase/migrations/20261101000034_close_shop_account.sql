-- B22 «قفل حساب المحل»: allowed when there are no active orders, no customer money owed and no commission due.
create or replace function public.shop_closure_blockers() returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'open_orders', (select count(*) from public.orders where shop_id = auth.uid() and status not in ('received', 'cancelled')),
    'refunds', (select count(*) from public.orders where shop_id = auth.uid() and payment_status in ('review', 'refund_due')),
    'owed', private.shop_owed(auth.uid()));
$$;

create or replace function public.close_shop_account(p_reason text) returns void
language plpgsql security definer set search_path = ''
as $$
declare b jsonb;
begin
  if auth.uid() is null or not exists (select 1 from public.shops where id = auth.uid()) then raise exception 'not allowed'; end if;
  b := public.shop_closure_blockers();
  if (b->>'open_orders')::int > 0 or (b->>'refunds')::int > 0 or (b->>'owed')::numeric > 0 then raise exception 'shop has open items'; end if;
  perform set_config('daghta.submit', 'on', true);
  update public.shops set status = 'closed', accepting = false, review_note = left(coalesce('أغلقه صاحب المحل: ' || nullif(trim(p_reason), ''), 'أغلقه صاحب المحل'), 500) where id = auth.uid();
  perform set_config('daghta.submit', 'off', true);
  -- open offers end now (customers can no longer choose them)
  update public.quotes q set expires_at = now() from public.requests r where q.request_id = r.id and q.shop_id = auth.uid() and r.status = 'open';
  insert into public.data_requests (user_id, kind, status, done_at, note) values (auth.uid(), 'delete', 'done', now(), 'قفل حساب المحل');
  perform private.notify_staff('محل قفل حسابه', coalesce((select name from public.shop_private where id = auth.uid()), ''), '/manage');
end $$;
revoke execute on function public.shop_closure_blockers(), public.close_shop_account(text) from public, anon;
grant execute on function public.shop_closure_blockers(), public.close_shop_account(text) to authenticated;

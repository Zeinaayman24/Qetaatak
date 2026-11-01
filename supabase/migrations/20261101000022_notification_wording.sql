-- Approved wording (Product Register A23, B19, change 1.15/1.27): no emoji, no old brand name, clearer titles.

create or replace function public.accept_offers(p_choices jsonb) returns jsonb
language plpgsql security definer set search_path = ''
as $function$
declare uid uuid := auth.uid(); c record; s record; oid uuid; made uuid[] := '{}'; ono bigint; fee numeric;
begin
  if uid is null then raise exception 'not allowed'; end if;
  if jsonb_typeof(p_choices) <> 'array' or jsonb_array_length(p_choices) = 0 then raise exception 'nothing chosen'; end if;
  for c in select * from jsonb_to_recordset(p_choices) as x(request uuid, quote uuid, mode text) loop
    perform 1 from public.requests r join public.quotes q on q.request_id = r.id
     where r.id = c.request and q.id = c.quote and r.customer_id = uid and r.status = 'open';
    if not found then raise exception 'cannot choose this quote'; end if;
  end loop;
  for s in
    select q.shop_id as shop, max(x.mode) as mode, sum(q.price * coalesce(r.qty, 1)) as total,
           bool_and(private.offer_delivery_fee(q.id, uid) is not null) as deliverable,
           max(private.offer_delivery_fee(q.id, uid)) as fee
      from jsonb_to_recordset(p_choices) as x(request uuid, quote uuid, mode text)
      join public.requests r on r.id = x.request
      join public.quotes q on q.id = x.quote and q.request_id = r.id
     group by q.shop_id
  loop
    if s.mode not in ('delivery', 'pickup') then raise exception 'bad mode'; end if;
    if s.mode = 'delivery' and not s.deliverable then raise exception 'shop does not deliver'; end if;
    fee := case when s.mode = 'delivery' then coalesce(s.fee, 0) else 0 end;
    insert into public.orders (customer_id, shop_id, delivery_mode, items_total, delivery_fee)
    values (uid, s.shop, s.mode, s.total, fee)
    returning id, order_no into oid, ono;
    update public.requests r
       set status = 'chosen', chosen_quote_id = x.quote, delivery_mode = s.mode, chosen_at = now(), order_status = 'preparing', order_id = oid
      from jsonb_to_recordset(p_choices) as x(request uuid, quote uuid, mode text)
      join public.quotes q on q.id = x.quote
     where r.id = x.request and q.request_id = r.id and q.shop_id = s.shop;
    perform private.notify(s.shop, 'العميل اختار عرضك', 'أوردر جديد #' || ono || coalesce(' · ' || private.order_parts(oid), ''), '/shop/order/' || oid);
    made := made || oid;
  end loop;
  return to_jsonb(made);
end $function$;

create or replace function public.close_ticket(p_report uuid) returns void
language plpgsql security definer set search_path = ''
as $function$
begin
  if not private.is_staff() then raise exception 'not allowed'; end if;
  insert into public.ticket_messages (report_id, sender_id, body, kind)
  values (p_report, (select auth.uid()), 'المحادثة اتقفلت. شكراً لتواصلك مع ضغطة.', 'system');
  update public.reports set status = 'resolved', resolved_at = now(), resolved_by = 'agent' where id = p_report;
end $function$;

create or replace function private.on_order_insert() returns trigger
language plpgsql security definer set search_path = ''
as $function$
begin
  perform private.notify(new.shop_id, 'العميل اختار عرضك', 'أوردر جديد #' || new.order_no || coalesce(' · ' || private.order_parts(new.id), ''), '/shop/order/' || new.id);
  return new;
end $function$;

create or replace function private.on_order_payment_notice() returns trigger
language plpgsql security definer set search_path = ''
as $function$
declare amount text := (new.items_total + new.delivery_fee)::text;
begin
  if new.payment_status is distinct from old.payment_status then
    if new.payment_status = 'paid' and new.payment_method = 'instapay' then
      perform private.notify(new.customer_id, 'المحل أكّد إن التحويل وصله', 'أوردر #' || new.order_no || ' · بيتجهّز دلوقتي', '/order/' || new.id);
    elsif new.payment_status = 'paid' and new.payment_method = 'card' then
      perform private.notify(new.customer_id, 'الدفع اتأكد', 'أوردر #' || new.order_no || ' · المحل بيجهّزه', '/order/' || new.id);
      perform private.notify(new.shop_id, 'العميل دفع أوردر #' || new.order_no || ' بالبطاقة', 'ابدأ جهّز القطع', '/shop/order/' || new.id);
    elsif new.payment_status = 'failed' then
      perform private.notify(new.customer_id, 'المحل قال إن التحويل ماوصلش', coalesce(nullif(new.payment_note, '') || ' · ', '') || 'ارفع إيصال تاني من صفحة الأوردر.', '/order/' || new.id);
    elsif new.payment_status = 'refund_due' and new.payment_method = 'instapay' then
      perform private.notify(new.shop_id, 'رجّع ' || amount || ' ج.م للعميل', 'أوردر #' || new.order_no || ' · خلال ٤٨ ساعة وسجّل من صفحة الأوردر', '/shop/order/' || new.id);
      perform private.notify(new.customer_id, 'المحل هيرجّعلك ' || amount || ' ج.م', 'خلال ٤٨ ساعة على نفس الحساب.', '/order/' || new.id);
    elsif new.payment_status = 'refund_due' then
      perform private.notify_staff('أوردر مدفوع بالبطاقة اتلغى · محتاج استرجاع', 'أوردر #' || new.order_no || ' · ' || amount || ' ج.م', '/manage');
    elsif new.payment_status = 'refunded' and new.payment_method = 'instapay' then
      perform private.notify(new.customer_id, 'المحل رجّعلك ' || amount || ' ج.م', 'أوردر #' || new.order_no, '/order/' || new.id);
    end if;
  end if;
  return new;
end $function$;

create or replace function private.on_order_update() returns trigger
language plpgsql security definer set search_path = ''
as $function$
declare parts text := coalesce(private.order_parts(new.id), 'أوردر #' || new.order_no);
begin
  if new.status is distinct from old.status then
    if new.status = 'ready' then
      perform private.notify(new.customer_id,
        case when new.delivery_mode = 'delivery' then 'أوردرك جاهز وخارج لك' else 'أوردرك جاهز للاستلام من المحل' end,
        parts || ' · افحص القطعة قبل ما تدّي الكود.', '/order/' || new.id);
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
end $function$;

create or replace function private.on_report_status() returns trigger
language plpgsql security definer set search_path = ''
as $function$
begin
  if new.status = 'resolved' and old.status <> 'resolved' and coalesce(new.resolved_by, 'agent') = 'agent' then
    perform private.notify(new.reporter_id, 'محادثة T-' || new.ticket_no || ' انتهت', 'شكراً لتواصلك مع ضغطة.', '/assistant?ticket=' || new.id);
  end if;
  return new;
end $function$;

create or replace function private.on_shop_update() returns trigger
language plpgsql security definer set search_path = ''
as $function$
begin
  if new.status = 'approved' and old.status <> 'approved' then
    perform private.notify(new.id, 'محلك اتوافق عليه', 'الطلبات هتبدأ توصلك دلوقتي.', '/shop');
  elsif new.status = 'suspended' and old.status <> 'suspended' then
    perform private.notify(new.id, 'المحل اتوقف مؤقتاً', 'افتح التطبيق واعرف السبب والخطوة الجاية.', '/support');
  end if;
  return new;
end $function$;

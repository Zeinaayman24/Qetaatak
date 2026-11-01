-- B19 shop notifications in the approved words; chat messages now notify; complaint, statement and
-- payment-details notices added.

-- new request: «طلب جديد: {القطعة}» · «{الماركة} {الموديل} {السنة} · {المنطقة}»
create or replace function private.on_request_insert() returns trigger
language plpgsql security definer set search_path = ''
as $function$
declare n int; first_num bigint; parts text;
begin
  if new.batch_id is not null then
    select count(*), min(num), string_agg(part, '، ' order by num) into n, first_num, parts from public.requests where batch_id = new.batch_id;
    if new.num <> first_num then return new; end if;
  else n := 1; parts := new.part; end if;
  insert into public.notifications (user_id, title, body, link)
  select s.id, 'طلب جديد: ' || parts,
         new.car_make || ' ' || new.car_model || ' ' || new.car_year || ' · ' || new.area,
         '/shop/' || new.id
  from public.shops s
  where s.status = 'approved' and s.accepting and (new.car_make = any (s.brands) or cardinality(s.brands) = 0) and s.id <> new.customer_id;
  return new;
end $function$;

-- chat: «رسالة من عميل · طلب #{رقم}» to the shop, «رسالة من {المحل}» to the customer
create or replace function private.on_message_insert() returns trigger
language plpgsql security definer set search_path = ''
as $function$
declare r record; shop_name text; txt text;
begin
  select * into r from public.requests where id = new.request_id;
  if r.id is null then return new; end if;
  txt := coalesce(nullif(left(new.body, 120), ''), 'صورة');
  if new.sender_id = r.customer_id then
    perform private.notify(new.shop_id, 'رسالة من عميل · طلب #' || r.num, txt, '/chat/' || r.id || '/' || new.shop_id);
  else
    select name into shop_name from public.shop_private where id = new.shop_id;
    perform private.notify(r.customer_id, 'رسالة من ' || coalesce(shop_name, 'المحل'), txt, '/chat/' || r.id || '/' || new.shop_id);
  end if;
  return new;
end $function$;

-- complaint about an order with a shop: «شكوى على أوردر #{رقم}» · «ردّ من صفحة «أداء محلك»»
create or replace function private.on_report_shop() returns trigger
language plpgsql security definer set search_path = ''
as $function$
declare o record;
begin
  if new.category not in ('shop', 'order') or new.request_id is null then return new; end if;
  select ord.* into o from public.requests rq join public.orders ord on ord.id = rq.order_id where rq.id = new.request_id;
  if o.id is null or o.shop_id = new.reporter_id then return new; end if;
  perform private.notify(o.shop_id, 'شكوى على أوردر #' || o.order_no, 'ردّ من صفحة «أداء محلك»', '/shop/performance');
  return new;
end $function$;
create or replace trigger reports_notify_shop after insert on public.reports for each row execute function private.on_report_shop();

-- payment details changed: the shop is told too («لو مش انت، كلّمنا فوراً.»)
create or replace function private.on_payout_change() returns trigger language plpgsql security definer set search_path = ''
as $$ begin
  if (new.instapay_address, new.wallet_number, new.payout_name) is distinct from (old.instapay_address, old.wallet_number, old.payout_name)
     and exists (select 1 from public.shops where id = new.id and status = 'approved') then
    perform private.notify_staff('محل غيّر بيانات التحويل', new.name, '/manage');
    perform private.notify(new.id, 'بيانات التحويل اتغيّرت', 'لو مش انت، كلّمنا فوراً.', '/support');
  end if;
  return new;
end $$;

-- monthly: «كشف حساب {الشهر} جاهز» · «{المبلغ} ج.م · السداد لحد {التاريخ}» (1st of the month)
create or replace function private.send_statements() returns void
language plpgsql security definer set search_path = ''
as $$
declare s record; last_month date := (date_trunc('month', now() at time zone 'Africa/Cairo') - interval '1 month')::date;
        months text[] := array['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
begin
  for s in select st.shop_id, st.amount from (
             select sh.id as shop_id, (select amount from private.shop_statements(sh.id) x where x.month = last_month) as amount
               from public.shops sh where sh.status in ('approved', 'suspended')) st where st.amount > 0 loop
    perform private.notify(s.shop_id, 'كشف حساب ' || months[extract(month from last_month)::int] || ' جاهز',
      s.amount || ' ج.م · السداد لحد ' || extract(day from last_month + interval '1 month' + interval '7 days')::int || ' ' ||
      months[extract(month from last_month + interval '1 month')::int], '/shop/balance');
  end loop;
end $$;
select cron.schedule('daghta-statements', '3 8 1 * *', 'select private.send_statements()');

-- small wording fixes in existing notices
do $do$
declare f text; d text; pairs text[][] := array[
  ['public.submit_payment_proof(uuid,text,text)', '''العميل حوّل فلوس أوردر #''', '''عميل حوّل فلوس أوردر #'''],
  ['public.submit_payment_proof(uuid,text,text)', '''راجع الإيصال وأكّد إن الفلوس وصلتك · '' || (o.items_total + o.delivery_fee) || '' ج.م''', '(o.items_total + o.delivery_fee) || '' ج.م · أكّد خلال ساعتين'''],
  ['public.review_settlement(uuid,boolean,text)', '''اتأكد دفع العمولة ✅''', '''اتأكد دفع العمولة'''],
  ['private.check_shop_performance()', '''تنبيه: '' || coalesce(warn, pause) || '' محتاج تحسين''', '''تنبيه على أداء المحل'''],
  ['private.check_shop_performance()', '''لو فضل كده، المحل ممكن يتوقف مؤقتاً.''', 'coalesce(warn, pause) || '' محتاج تحسين'''],
  ['public.request_shop_changes(uuid,text)', '''محتاجين تعديل قبل الموافقة''', '''محتاجين تعديل في بيانات المحل'''],
  ['private.on_request_update()', '''العميل اختار عرضك!''', '''العميل اختار عرضك'''],
  ['private.on_shop_update()', '''افتح التطبيق واعرف السبب والخطوة الجاية.'', ''/support''', '''افتح التطبيق واعرف السبب والخطوة الجاية.'', ''/shop/performance''']
];
begin
  for i in 1 .. array_length(pairs, 1) loop
    f := pairs[i][1];
    d := pg_get_functiondef(to_regprocedure(f));
    if position(pairs[i][2] in d) = 0 then raise exception 'text not found in %: %', f, pairs[i][2]; end if;
    execute replace(d, pairs[i][2], pairs[i][3]);
  end loop;
end $do$;

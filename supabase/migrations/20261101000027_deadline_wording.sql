-- Approved wording (A21) for the transfer-not-made cancellation.
create or replace function private.run_deadlines() returns void
language plpgsql security definer set search_path = ''
as $$
declare o record; r record;
begin
  -- A21: customer pays by transfer within 2 hours (reminder at 1 hour)
  for o in select * from public.orders where payment_method = 'instapay' and payment_status in ('awaiting', 'failed')
             and status = 'preparing' and created_at < now() - interval '1 hour' and customer_pay_reminded_at is null loop
    update public.orders set customer_pay_reminded_at = now() where id = o.id;
    perform private.notify(o.customer_id, 'فاضل ساعة على دفع أوردر #' || o.order_no, 'حوّل وارفع الإيصال عشان المحل يبدأ يجهّز.', '/order/' || o.id);
  end loop;
  for o in select * from public.orders where payment_method = 'instapay' and payment_status in ('awaiting', 'failed')
             and status = 'preparing' and created_at < now() - interval '2 hours' loop
    update public.orders set status = 'cancelled', cancel_reason = 'unpaid', updated_at = now() where id = o.id;
    update public.requests set status = 'open', chosen_quote_id = null, delivery_mode = null, chosen_at = null, order_status = null, order_id = null
     where order_id = o.id;
    perform private.notify(o.customer_id, 'أوردر #' || o.order_no || ' اتلغى', 'ماحوّلتش خلال ساعتين، فالأوردر اتلغى والقطع رجعت للطلب.', '/order/' || o.id);
  end loop;

  -- A21: shop confirms a receipt within 2 hours (reminder at 1 hour, staff at 2)
  for o in select * from public.orders where payment_status = 'review' and updated_at < now() - interval '1 hour' and shop_confirm_reminded_at is null loop
    update public.orders set shop_confirm_reminded_at = now() where id = o.id;
    perform private.notify(o.shop_id, 'تذكير: العميل مستني تأكيد التحويل', 'أوردر #' || o.order_no || ' · فاضل ساعة', '/shop/order/' || o.id);
  end loop;
  for o in select * from public.orders where payment_status = 'review' and updated_at < now() - interval '2 hours' and staff_alerted_at is null loop
    update public.orders set staff_alerted_at = now() where id = o.id;
    perform private.notify_staff('تحويل ماتأكدش من المحل خلال ساعتين', 'أوردر #' || o.order_no, '/manage');
  end loop;
  -- A21: refund within 48 hours
  for o in select * from public.orders where payment_status = 'refund_due' and refund_due_at < now() - interval '48 hours' and refund_alerted_at is null loop
    update public.orders set refund_alerted_at = now() where id = o.id;
    perform private.notify_staff('استرجاع متأخر من المحل', 'أوردر #' || o.order_no || ' · ' || (o.items_total + o.delivery_fee) || ' ج.م', '/manage');
  end loop;

  -- A17/A23: tip after 2 hours with no offers
  for r in select * from public.requests q where status = 'open' and created_at < now() - interval '2 hours' and tip_sent_at is null
             and not exists (select 1 from public.quotes where request_id = q.id) loop
    update public.requests set tip_sent_at = now() where id = r.id;
    perform private.notify(r.customer_id, 'لسه مفيش عروض على ' || r.part, 'ضيف صورة أو اختار «جديد أو مستعمل» عشان توصلك عروض أكتر.', '/customer/' || r.id);
  end loop;
  -- A23: offers about to end (6 hours left)
  for r in select q.* from public.requests q where status = 'open' and expiry_warned_at is null
             and exists (select 1 from public.quotes where request_id = q.id and expires_at > now() and expires_at < now() + interval '6 hours') loop
    update public.requests set expiry_warned_at = now() where id = r.id;
    perform private.notify(r.customer_id, 'عروض ' || r.part || ' هتنتهي قريب', 'اختار عرض قبل ما تنتهي.', '/customer/' || r.id);
  end loop;
  -- A17: requests with no order close after 7 days
  for r in select * from public.requests where status = 'open' and created_at < now() - interval '7 days' loop
    update public.requests set status = 'expired', expired_at = now() where id = r.id;
    if r.batch_id is null or r.id = (select id from public.requests where batch_id = r.batch_id order by num limit 1) then
      perform private.notify(r.customer_id, 'طلب #' || r.num || ' انتهى', 'ماخترتش عرض. تقدر تطلب تاني في أي وقت.', '/customer/requests');
    end if;
  end loop;
end $$;

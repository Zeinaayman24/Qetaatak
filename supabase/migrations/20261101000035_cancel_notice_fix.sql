-- «العميل لغى أوردر #» goes to the shop only when the customer cancelled (or didn't pay in time),
-- not when the shop cancelled or the customer refused the part (those have their own notices).
do $do$
declare d text := pg_get_functiondef('private.on_order_update()'::regprocedure);
        a text := 'elsif new.status = ''cancelled'' then';
        b text := 'elsif new.status = ''cancelled'' and coalesce(new.cancel_reason, '''') in (''customer'', ''unpaid'', '''') then';
begin
  if position(a in d) = 0 then raise exception 'text not found'; end if;
  execute replace(d, a, b);
end $do$;

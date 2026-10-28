-- Move policy helper functions out of the public API.
create schema if not exists private;
grant usage on schema private to authenticated;

alter function public.is_admin() set schema private;
alter function public.is_approved_shop() set schema private;
alter function public.is_chosen_shop_of_customer(uuid) set schema private;
alter function public.chose_shop(uuid) set schema private;
alter function public.request_customer(uuid) set schema private;
alter function public.handle_new_user() set schema private;

revoke execute on all functions in schema private from public, anon;
grant execute on function private.is_admin(), private.is_approved_shop(), private.is_chosen_shop_of_customer(uuid),
  private.chose_shop(uuid), private.request_customer(uuid) to authenticated;
revoke execute on function private.handle_new_user() from authenticated;

-- guard triggers call the helper by name
create or replace function public.guard_profile()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if new.is_admin is distinct from old.is_admin and current_user = 'authenticated' and not private.is_admin() then
    raise exception 'not allowed';
  end if;
  new.updated_at := now();
  return new;
end $$;

create or replace function public.guard_shop()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if current_user = 'authenticated' and not private.is_admin() then
    if tg_op = 'INSERT' then
      new.status := 'pending';
    elsif new.status is distinct from old.status then
      raise exception 'not allowed';
    end if;
  end if;
  return new;
end $$;

revoke execute on function public.guard_profile(), public.guard_shop(), public.guard_quote() from public, anon, authenticated;

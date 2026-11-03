-- A switch to close the app for customers and shops (staff keep working in the management app).
-- Lock:   select private.set_app_lock(true);   -- also signs everyone except staff out
-- Unlock: select private.set_app_lock(false);
insert into public.app_settings (key, value) values ('app_locked', 'off') on conflict (key) do nothing;

create or replace function private.app_locked() returns boolean
language sql stable security definer set search_path = ''
as $$ select coalesce((select value from public.app_settings where key = 'app_locked'), 'off') = 'on' $$;

create or replace function public.app_locked() returns boolean
language sql stable security definer set search_path = ''
as $$ select private.app_locked() $$;
grant execute on function public.app_locked() to anon, authenticated;

create or replace function private.block_when_locked() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if private.app_locked() then
    if tg_table_name = 'users' then
      raise exception 'app locked';
    elsif not exists (select 1 from public.profiles p where p.id = new.user_id and (p.is_admin or p.is_support or p.staff_role is not null)) then
      raise exception 'app locked';
    end if;
  end if;
  return new;
end $$;

create trigger block_signup_when_locked before insert on auth.users
  for each row execute function private.block_when_locked();
create trigger block_signin_when_locked before insert on auth.sessions
  for each row execute function private.block_when_locked();

create or replace function private.set_app_lock(p_on boolean) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  update public.app_settings set value = case when p_on then 'on' else 'off' end where key = 'app_locked';
  if p_on then
    delete from auth.sessions s
     where not exists (select 1 from public.profiles p where p.id = s.user_id and (p.is_admin or p.is_support or p.staff_role is not null));
  end if;
end $$;

-- C01: staff powers need a two-step sign-in (aal2) in the current session. Switched on after the
-- management app's authenticator step went live.
create or replace function private.is_staff() returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((select is_admin or is_support or staff_role is not null from public.profiles where id = auth.uid()), false)
     and coalesce(auth.jwt() ->> 'aal', '') = 'aal2';
$$;
create or replace function private.is_admin() returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((select is_admin or staff_role = 'admin' from public.profiles where id = auth.uid()), false)
     and coalesce(auth.jwt() ->> 'aal', '') = 'aal2';
$$;

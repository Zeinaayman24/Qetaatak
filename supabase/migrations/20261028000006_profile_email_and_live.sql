-- New accounts get their email on the profile (so admins can add staff by email); profiles update live in management.
create or replace function private.handle_new_user()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, email) values (new.id, coalesce(new.email, '')) on conflict do nothing;
  return new;
end $$;

update public.profiles p set email = u.email from auth.users u where u.id = p.id and (p.email is null or p.email = '');

alter publication supabase_realtime add table public.profiles;

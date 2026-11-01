-- C10 «شيل»: a removed team member is signed out immediately (service role only).
create or replace function public.end_sessions(p_user uuid) returns void
language sql security definer set search_path = ''
as $$ delete from auth.sessions where user_id = p_user; delete from auth.refresh_tokens where user_id = p_user::text; $$;
revoke execute on function public.end_sessions(uuid) from public, anon, authenticated;
grant execute on function public.end_sessions(uuid) to service_role;

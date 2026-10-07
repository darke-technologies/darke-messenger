-- DARKE v1 Phase 4 — delete own account
-- Run after phase1.sql.

create or replace function public.delete_own_account()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  uid uuid;
begin
  uid := auth.uid();
  if uid is null then
    raise exception 'not signed in';
  end if;
  -- Listings are unique on install_id. Drop this user’s row so a new
  -- account on the same DARKE install can publish again.
  delete from public.app_listings where owner_id = uid;
  -- Cascades to public.profiles and listing votes via FK.
  delete from auth.users where id = uid;
end;
$$;

revoke all on function public.delete_own_account() from public;
grant execute on function public.delete_own_account() to authenticated;

notify pgrst, 'reload schema';

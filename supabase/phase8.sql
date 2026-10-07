-- DARKE v1 Phase 8 — Delete Account must drop this user’s Apps listing
-- Run after phase5.sql / phase7.sql. Replaces delete_own_account from phase4.sql.
--
-- app_listings is unique on install_id. If the row survives account deletion,
-- a new account on this PC can never list an app.

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
  delete from public.app_listings where owner_id = uid;
  delete from auth.users where id = uid;
end;
$$;

revoke all on function public.delete_own_account() from public;
grant execute on function public.delete_own_account() to authenticated;

notify pgrst, 'reload schema';

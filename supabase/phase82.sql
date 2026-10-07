-- DARKE v1 Phase 82 — Drop @darkestaff listing-admin privilege
-- Run after phase81.sql.
--
-- The live insert trigger still promoted staff_curated when the signed-in
-- username was darkestaff. After this, no account can create TANK staff
-- listings from the app. Existing staff_curated rows are unchanged.
-- Historical seed scripts (phase24 / tank_populate) still mention the old
-- username; they are not live.

create or replace function public.app_listings_set_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  slug text;
begin
  if auth.uid() is null then
    if new.owner_id is null then
      raise exception 'not signed in';
    end if;
    if new.username is null or btrim(new.username) = '' then
      raise exception 'no profile';
    end if;
  else
    new.owner_id := auth.uid();
    select p.username into slug from public.profiles p where p.id = auth.uid();
    if slug is null or slug = '' then
      raise exception 'no profile';
    end if;
    new.username := slug;
    if coalesce(new.staff_curated, false) then
      raise exception 'staff listings are not created from the app';
    end if;
    new.staff_curated := false;
  end if;
  new.thumbs_up := 0;
  new.thumbs_down := 0;
  if new.install_id is null or btrim(new.install_id) = '' then
    raise exception 'install_id required';
  end if;
  return new;
end;
$$;

notify pgrst, 'reload schema';

-- DARKE v1 Phase 21 — Allow listing username to follow profile rename
-- Run in the Supabase SQL editor after phase10.sql.

create or replace function public.app_listings_freeze_immutable()
returns trigger
language plpgsql
as $$
begin
  new.id := old.id;
  new.owner_id := old.owner_id;
  new.name := old.name;
  new.install_id := old.install_id;
  new.thumbs_up := old.thumbs_up;
  new.thumbs_down := old.thumbs_down;
  new.created_at := old.created_at;
  if new.username is distinct from old.username then
    if not exists (
      select 1
      from public.profiles p
      where p.id = old.owner_id
        and p.username = new.username
    ) then
      new.username := old.username;
    end if;
  end if;
  return new;
end;
$$;

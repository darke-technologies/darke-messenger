-- DARKE v1 Phase 11 — Archive listing (no delete)
-- Archived listings stay owned (free slot still used) but are hidden from the directory.
-- Run after phase10.sql.

alter table public.app_listings
  add column if not exists archived boolean not null default false;

create index if not exists app_listings_archived_created
  on public.app_listings (archived, created_at desc);

-- Ensure freeze trigger does not overwrite archived (editable by owner).
create or replace function public.app_listings_freeze_immutable()
returns trigger
language plpgsql
as $$
begin
  new.id := old.id;
  new.owner_id := old.owner_id;
  new.username := old.username;
  new.name := old.name;
  new.install_id := old.install_id;
  new.thumbs_up := old.thumbs_up;
  new.thumbs_down := old.thumbs_down;
  new.created_at := old.created_at;
  return new;
end;
$$;

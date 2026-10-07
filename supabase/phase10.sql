-- DARKE v1 Phase 10 — Edit own Apps listing
-- Owner may update editable fields. Name / owner / install / thumbs stay frozen.
-- Run after phase9.sql.

-- ── UPDATE policy ─────────────────────────────────────────────────────────
drop policy if exists "app_listings_update_own" on public.app_listings;
create policy "app_listings_update_own"
  on public.app_listings
  for update
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

grant update on table public.app_listings to authenticated;

-- Freeze immutable columns even if a client tries to PATCH them.
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

drop trigger if exists app_listings_freeze_immutable on public.app_listings;
create trigger app_listings_freeze_immutable
  before update on public.app_listings
  for each row
  execute procedure public.app_listings_freeze_immutable();

-- ── Storage: allow owner to delete their hero objects on replace ──────────
drop policy if exists "listing_heroes_delete_own" on storage.objects;
create policy "listing_heroes_delete_own"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'listing-heroes'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- DARKE v1 Phase 55 — Drop LinkedIn company slug
-- Run in the Supabase SQL editor after phase54.sql.

alter table public.app_listings
  drop constraint if exists app_listings_linkedin_slug_len;

drop index if exists app_listings_linkedin_slug_uniq;

alter table public.app_listings
  drop column if exists linkedin_slug;

notify pgrst, 'reload schema';

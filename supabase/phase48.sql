-- DARKE v1 Phase 48 — Multiple startups per account
-- Run in the Supabase SQL editor after phase47.sql.
-- Profile listings are free. Public STARTUPS still uses paid columns from phase44/45.

alter table public.app_listings
  drop constraint if exists app_listings_one_per_owner;

drop index if exists public.app_listings_one_per_owner;
drop index if exists public.app_listings_one_per_install;

notify pgrst, 'reload schema';

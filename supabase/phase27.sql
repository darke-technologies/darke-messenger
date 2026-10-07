-- DARKE v1 Phase 27 — Optional listing funding status
-- Run in the Supabase SQL editor after phase16.sql.

alter table public.app_listings
  add column if not exists funding_status text;

alter table public.app_listings
  drop constraint if exists app_listings_funding_status_valid;
alter table public.app_listings
  add constraint app_listings_funding_status_valid
  check (
    funding_status is null
    or funding_status in (
      'bootstrapped',
      'seeking',
      'funded',
      'revenue_funded',
      'open_source'
    )
  );

notify pgrst, 'reload schema';

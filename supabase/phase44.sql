-- DARKE v1 Phase 44 — Startup placement (profile vs paid public directory)
-- Run in the Supabase SQL editor after phase27.sql.
-- Payment / Stripe is Phase 2. These columns let the app split profile vs STARTUPS.

alter table public.app_listings
  add column if not exists show_on_profile boolean not null default false;

alter table public.app_listings
  add column if not exists is_paid_listing boolean not null default false;

alter table public.app_listings
  add column if not exists paid_until timestamptz;

-- Existing live listings stay on profiles until the owner changes the form.
-- They do not automatically stay on the public STARTUPS directory (that requires pay).
update public.app_listings
set show_on_profile = true
where coalesce(archived, false) = false
  and coalesce(staff_curated, false) = false
  and show_on_profile = false;

create index if not exists app_listings_public_paid
  on public.app_listings (paid_until desc)
  where archived = false and is_paid_listing = true;

create index if not exists app_listings_on_profile
  on public.app_listings (username)
  where archived = false and show_on_profile = true;

notify pgrst, 'reload schema';

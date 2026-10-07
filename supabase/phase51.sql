-- DARKE v1 Phase 51 — Startup contact email and location
-- Run in the Supabase SQL editor after phase50.sql.
-- Same location fields as profiles (country, region/state, city).

alter table public.app_listings
  add column if not exists contact_email text,
  add column if not exists country text,
  add column if not exists region text,
  add column if not exists city text;

alter table public.app_listings
  drop constraint if exists app_listings_contact_email_len;
alter table public.app_listings
  add constraint app_listings_contact_email_len check (
    contact_email is null or char_length(btrim(contact_email)) between 3 and 254
  );

alter table public.app_listings
  drop constraint if exists app_listings_country_len;
alter table public.app_listings
  add constraint app_listings_country_len check (
    country is null or char_length(btrim(country)) between 1 and 80
  );

alter table public.app_listings
  drop constraint if exists app_listings_region_len;
alter table public.app_listings
  add constraint app_listings_region_len check (
    region is null or char_length(btrim(region)) between 1 and 80
  );

alter table public.app_listings
  drop constraint if exists app_listings_city_len;
alter table public.app_listings
  add constraint app_listings_city_len check (
    city is null or char_length(btrim(city)) between 1 and 80
  );

notify pgrst, 'reload schema';

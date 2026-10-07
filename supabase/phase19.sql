-- DARKE v1 Phase 19 — Profile location and website
-- Run in the Supabase SQL editor after phase15.sql (profiles).

alter table public.profiles
  add column if not exists country text,
  add column if not exists region text,
  add column if not exists city text,
  add column if not exists website_url text;

alter table public.profiles
  drop constraint if exists profiles_country_len;
alter table public.profiles
  add constraint profiles_country_len
  check (country is null or char_length(country) between 1 and 80);

alter table public.profiles
  drop constraint if exists profiles_region_len;
alter table public.profiles
  add constraint profiles_region_len
  check (region is null or char_length(region) between 1 and 80);

alter table public.profiles
  drop constraint if exists profiles_city_len;
alter table public.profiles
  add constraint profiles_city_len
  check (city is null or char_length(city) between 1 and 80);

alter table public.profiles
  drop constraint if exists profiles_website_url_len;
alter table public.profiles
  add constraint profiles_website_url_len
  check (website_url is null or char_length(website_url) between 8 and 300);

-- DARKE v1 Phase 20 — Profile age
-- Run in the Supabase SQL editor after phase19.sql.

alter table public.profiles
  add column if not exists age smallint,
  add column if not exists show_age boolean not null default false;

alter table public.profiles
  drop constraint if exists profiles_age_range;
alter table public.profiles
  add constraint profiles_age_range
  check (age is null or (age >= 1 and age <= 99));

-- DARKE v1 Phase 32 — Public profile bio
-- Run in the Supabase SQL editor after phase28.sql.

alter table public.profiles
  add column if not exists bio text;

alter table public.profiles
  drop constraint if exists profiles_bio_len;
alter table public.profiles
  add constraint profiles_bio_len
  check (bio is null or char_length(bio) between 1 and 500);

notify pgrst, 'reload schema';

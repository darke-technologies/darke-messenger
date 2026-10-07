-- DARKE v1 Phase 62 — Profile TikTok and LinkedIn links
-- Run in the Supabase SQL editor after phase61.sql.

alter table public.profiles
  add column if not exists tiktok_url text,
  add column if not exists linkedin_url text;

alter table public.profiles
  drop constraint if exists profiles_tiktok_url_len;
alter table public.profiles
  add constraint profiles_tiktok_url_len
  check (tiktok_url is null or char_length(tiktok_url) between 8 and 300);

alter table public.profiles
  drop constraint if exists profiles_linkedin_url_len;
alter table public.profiles
  add constraint profiles_linkedin_url_len
  check (linkedin_url is null or char_length(linkedin_url) between 8 and 300);

notify pgrst, 'reload schema';

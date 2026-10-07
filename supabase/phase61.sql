-- DARKE v1 Phase 61 — Profile social links (YouTube, Facebook, X/Twitter, Instagram)
-- Run in the Supabase SQL editor after phase60.sql.

alter table public.profiles
  add column if not exists youtube_url text,
  add column if not exists facebook_url text,
  add column if not exists twitter_url text,
  add column if not exists instagram_url text;

alter table public.profiles
  drop constraint if exists profiles_youtube_url_len;
alter table public.profiles
  add constraint profiles_youtube_url_len
  check (youtube_url is null or char_length(youtube_url) between 8 and 300);

alter table public.profiles
  drop constraint if exists profiles_facebook_url_len;
alter table public.profiles
  add constraint profiles_facebook_url_len
  check (facebook_url is null or char_length(facebook_url) between 8 and 300);

alter table public.profiles
  drop constraint if exists profiles_twitter_url_len;
alter table public.profiles
  add constraint profiles_twitter_url_len
  check (twitter_url is null or char_length(twitter_url) between 8 and 300);

alter table public.profiles
  drop constraint if exists profiles_instagram_url_len;
alter table public.profiles
  add constraint profiles_instagram_url_len
  check (instagram_url is null or char_length(instagram_url) between 8 and 300);

notify pgrst, 'reload schema';

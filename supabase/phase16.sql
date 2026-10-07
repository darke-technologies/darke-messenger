-- DARKE v1 Phase 16 — Listing media: extra photos + YouTube
-- Run after phase9/10. Keeps hero_image_url as the first photo for older clients.

alter table public.app_listings
  add column if not exists hero_image_urls text[] not null default '{}';

alter table public.app_listings
  add column if not exists hero_youtube_url text;

update public.app_listings
set hero_image_urls = array[hero_image_url]
where hero_image_url is not null
  and hero_image_url <> ''
  and (hero_image_urls is null or cardinality(hero_image_urls) = 0);

alter table public.app_listings
  drop constraint if exists app_listings_hero_urls_len;
alter table public.app_listings
  add constraint app_listings_hero_urls_len
  check (cardinality(hero_image_urls) <= 5);

alter table public.app_listings
  drop constraint if exists app_listings_youtube_len;
alter table public.app_listings
  add constraint app_listings_youtube_len
  check (hero_youtube_url is null or char_length(hero_youtube_url) <= 200);

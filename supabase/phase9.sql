-- DARKE v1 Phase 9 — Apps listing upgrade
-- Tagline, platforms, hero image (Storage), favorites.
-- Run in Supabase SQL editor after phase5/7/8.
-- Legacy rows keep empty tagline/platforms and null hero_image_url.

-- ── Columns ───────────────────────────────────────────────────────────────
alter table public.app_listings
  add column if not exists tagline text not null default '';

alter table public.app_listings
  add column if not exists platforms text[] not null default '{}';

alter table public.app_listings
  add column if not exists hero_image_url text;

alter table public.app_listings
  drop constraint if exists app_listings_tagline_len;
alter table public.app_listings
  add constraint app_listings_tagline_len
  check (char_length(tagline) <= 80);

alter table public.app_listings
  drop constraint if exists app_listings_platforms_valid;
alter table public.app_listings
  add constraint app_listings_platforms_valid
  check (platforms <@ array['web', 'windows', 'mac']::text[]);

-- ── Favorites ─────────────────────────────────────────────────────────────
create table if not exists public.app_listing_favorites (
  listing_id uuid not null references public.app_listings on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  primary key (listing_id, user_id)
);

create index if not exists app_listing_favorites_user
  on public.app_listing_favorites (user_id);

alter table public.app_listing_favorites enable row level security;

drop policy if exists "app_listing_favorites_select_own" on public.app_listing_favorites;
create policy "app_listing_favorites_select_own"
  on public.app_listing_favorites
  for select
  using (auth.uid() = user_id);

drop policy if exists "app_listing_favorites_insert_own" on public.app_listing_favorites;
create policy "app_listing_favorites_insert_own"
  on public.app_listing_favorites
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "app_listing_favorites_delete_own" on public.app_listing_favorites;
create policy "app_listing_favorites_delete_own"
  on public.app_listing_favorites
  for delete
  using (auth.uid() = user_id);

grant select, insert, delete on table public.app_listing_favorites to authenticated;

-- ── Storage: listing-heroes ───────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'listing-heroes',
  'listing-heroes',
  true,
  2097152,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "listing_heroes_public_read" on storage.objects;
create policy "listing_heroes_public_read"
  on storage.objects
  for select
  using (bucket_id = 'listing-heroes');

drop policy if exists "listing_heroes_insert_own" on storage.objects;
create policy "listing_heroes_insert_own"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'listing-heroes'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

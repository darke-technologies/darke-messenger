-- DARKE v1 Phase 43 — IGDB game favorites and wishlist
-- Account-scoped (auth.uid). Not stored in the DARKE ID vault.
-- Run in the Supabase SQL editor after phase39.sql.

create table if not exists public.igdb_favorites (
  user_id uuid not null references auth.users on delete cascade,
  game_id bigint not null,
  name text not null,
  cover_url text,
  released text,
  created_at timestamptz not null default now(),
  primary key (user_id, game_id),
  constraint igdb_favorites_id_pos check (game_id > 0),
  constraint igdb_favorites_name_len check (char_length(name) between 1 and 300),
  constraint igdb_favorites_cover_url_len check (
    cover_url is null or char_length(cover_url) between 8 and 2000
  ),
  constraint igdb_favorites_released_len check (
    released is null or char_length(released) between 1 and 16
  )
);

create index if not exists igdb_favorites_user_created
  on public.igdb_favorites (user_id, created_at desc);

alter table public.igdb_favorites enable row level security;

drop policy if exists "igdb_favorites_select_own" on public.igdb_favorites;
create policy "igdb_favorites_select_own"
  on public.igdb_favorites
  for select
  using (auth.uid() = user_id);

drop policy if exists "igdb_favorites_insert_own" on public.igdb_favorites;
create policy "igdb_favorites_insert_own"
  on public.igdb_favorites
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "igdb_favorites_update_own" on public.igdb_favorites;
create policy "igdb_favorites_update_own"
  on public.igdb_favorites
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "igdb_favorites_delete_own" on public.igdb_favorites;
create policy "igdb_favorites_delete_own"
  on public.igdb_favorites
  for delete
  using (auth.uid() = user_id);

grant select, insert, update, delete on table public.igdb_favorites to authenticated;

create table if not exists public.igdb_wishlist (
  user_id uuid not null references auth.users on delete cascade,
  game_id bigint not null,
  name text not null,
  cover_url text,
  released text,
  created_at timestamptz not null default now(),
  primary key (user_id, game_id),
  constraint igdb_wishlist_id_pos check (game_id > 0),
  constraint igdb_wishlist_name_len check (char_length(name) between 1 and 300),
  constraint igdb_wishlist_cover_url_len check (
    cover_url is null or char_length(cover_url) between 8 and 2000
  ),
  constraint igdb_wishlist_released_len check (
    released is null or char_length(released) between 1 and 16
  )
);

create index if not exists igdb_wishlist_user_created
  on public.igdb_wishlist (user_id, created_at desc);

alter table public.igdb_wishlist enable row level security;

drop policy if exists "igdb_wishlist_select_own" on public.igdb_wishlist;
create policy "igdb_wishlist_select_own"
  on public.igdb_wishlist
  for select
  using (auth.uid() = user_id);

drop policy if exists "igdb_wishlist_insert_own" on public.igdb_wishlist;
create policy "igdb_wishlist_insert_own"
  on public.igdb_wishlist
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "igdb_wishlist_update_own" on public.igdb_wishlist;
create policy "igdb_wishlist_update_own"
  on public.igdb_wishlist
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "igdb_wishlist_delete_own" on public.igdb_wishlist;
create policy "igdb_wishlist_delete_own"
  on public.igdb_wishlist
  for delete
  using (auth.uid() = user_id);

grant select, insert, update, delete on table public.igdb_wishlist to authenticated;

notify pgrst, 'reload schema';

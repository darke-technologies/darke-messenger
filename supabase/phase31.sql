-- DARKE v1 Phase 31 — Movies-Shows watchlist (TMDB)
-- Account-scoped (auth.uid). Not stored in the DARKE ID vault.
-- Run in the Supabase SQL editor after phase29.sql.

create table if not exists public.tmdb_watchlist (
  user_id uuid not null references auth.users on delete cascade,
  media_type text not null check (media_type in ('movie', 'tv')),
  tmdb_id integer not null check (tmdb_id > 0),
  title text not null,
  poster_path text,
  year text,
  created_at timestamptz not null default now(),
  primary key (user_id, media_type, tmdb_id),
  constraint tmdb_watchlist_title_len check (char_length(title) between 1 and 300),
  constraint tmdb_watchlist_poster_len check (
    poster_path is null or char_length(poster_path) between 2 and 200
  ),
  constraint tmdb_watchlist_year_len check (
    year is null or char_length(year) = 4
  )
);

create index if not exists tmdb_watchlist_user_created
  on public.tmdb_watchlist (user_id, created_at desc);

alter table public.tmdb_watchlist enable row level security;

drop policy if exists "tmdb_watchlist_select_own" on public.tmdb_watchlist;
create policy "tmdb_watchlist_select_own"
  on public.tmdb_watchlist
  for select
  using (auth.uid() = user_id);

drop policy if exists "tmdb_watchlist_insert_own" on public.tmdb_watchlist;
create policy "tmdb_watchlist_insert_own"
  on public.tmdb_watchlist
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "tmdb_watchlist_update_own" on public.tmdb_watchlist;
create policy "tmdb_watchlist_update_own"
  on public.tmdb_watchlist
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "tmdb_watchlist_delete_own" on public.tmdb_watchlist;
create policy "tmdb_watchlist_delete_own"
  on public.tmdb_watchlist
  for delete
  using (auth.uid() = user_id);

grant select, insert, update, delete on table public.tmdb_watchlist to authenticated;

notify pgrst, 'reload schema';

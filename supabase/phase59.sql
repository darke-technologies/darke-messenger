-- DARKE v1 Phase 59 — Book wishlist (account-scoped, not on profile)
-- Run in the Supabase SQL editor after phase58.sql.

create table if not exists public.book_wishlist (
  user_id uuid not null references auth.users on delete cascade,
  volume_id text not null,
  title text not null,
  authors text,
  cover_url text,
  year text,
  created_at timestamptz not null default now(),
  primary key (user_id, volume_id),
  constraint book_wishlist_volume_len check (char_length(volume_id) between 1 and 80),
  constraint book_wishlist_title_len check (char_length(title) between 1 and 300),
  constraint book_wishlist_authors_len check (
    authors is null or char_length(authors) between 1 and 300
  ),
  constraint book_wishlist_cover_url_len check (
    cover_url is null or char_length(cover_url) between 8 and 2000
  ),
  constraint book_wishlist_year_len check (
    year is null or char_length(year) between 1 and 8
  )
);

create index if not exists book_wishlist_user_created
  on public.book_wishlist (user_id, created_at desc);

alter table public.book_wishlist enable row level security;

drop policy if exists "book_wishlist_select_own" on public.book_wishlist;
create policy "book_wishlist_select_own"
  on public.book_wishlist
  for select
  using (auth.uid() = user_id);

drop policy if exists "book_wishlist_insert_own" on public.book_wishlist;
create policy "book_wishlist_insert_own"
  on public.book_wishlist
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "book_wishlist_update_own" on public.book_wishlist;
create policy "book_wishlist_update_own"
  on public.book_wishlist
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "book_wishlist_delete_own" on public.book_wishlist;
create policy "book_wishlist_delete_own"
  on public.book_wishlist
  for delete
  using (auth.uid() = user_id);

grant select, insert, update, delete on table public.book_wishlist to authenticated;

notify pgrst, 'reload schema';

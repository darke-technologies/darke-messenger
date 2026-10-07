-- DARKE v1 Phase 38 — Up to 5 Google Books volumes on a public profile
-- Replaces Open Library profile_books (phase37). Run after phase37.sql if that was applied.

drop trigger if exists profile_books_cap on public.profile_books;
drop function if exists public.profile_books_cap();
drop table if exists public.profile_books;

create table public.profile_books (
  user_id uuid not null references auth.users on delete cascade,
  volume_id text not null,
  title text not null,
  authors text,
  cover_url text,
  year text,
  created_at timestamptz not null default now(),
  primary key (user_id, volume_id),
  constraint profile_books_volume_len check (char_length(volume_id) between 1 and 80),
  constraint profile_books_title_len check (char_length(title) between 1 and 300),
  constraint profile_books_authors_len check (
    authors is null or char_length(authors) between 1 and 300
  ),
  constraint profile_books_cover_url_len check (
    cover_url is null or char_length(cover_url) between 8 and 2000
  ),
  constraint profile_books_year_len check (
    year is null or char_length(year) between 1 and 8
  )
);

create index profile_books_user_created
  on public.profile_books (user_id, created_at desc);

create or replace function public.profile_books_cap()
returns trigger
language plpgsql
as $$
begin
  if exists (
    select 1
    from public.profile_books
    where user_id = new.user_id
      and volume_id = new.volume_id
  ) then
    return new;
  end if;
  if (
    select count(*)
    from public.profile_books
    where user_id = new.user_id
  ) >= 5 then
    raise exception 'profile_books_max';
  end if;
  return new;
end;
$$;

create trigger profile_books_cap
  before insert on public.profile_books
  for each row
  execute procedure public.profile_books_cap();

alter table public.profile_books enable row level security;

drop policy if exists "profile_books_select_all" on public.profile_books;
create policy "profile_books_select_all"
  on public.profile_books
  for select
  using (true);

drop policy if exists "profile_books_insert_own" on public.profile_books;
create policy "profile_books_insert_own"
  on public.profile_books
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "profile_books_delete_own" on public.profile_books;
create policy "profile_books_delete_own"
  on public.profile_books
  for delete
  using (auth.uid() = user_id);

grant select on table public.profile_books to anon, authenticated;
grant insert, delete on table public.profile_books to authenticated;

notify pgrst, 'reload schema';

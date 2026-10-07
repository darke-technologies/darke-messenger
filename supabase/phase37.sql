-- DARKE v1 Phase 37 — Up to 5 Open Library books on a public profile
-- Account-scoped, not DARKE ID vault. Run after phase36.sql (or phase35.sql).

create table if not exists public.profile_books (
  user_id uuid not null references auth.users on delete cascade,
  ol_key text not null,
  title text not null,
  author text,
  cover_id integer,
  year text,
  created_at timestamptz not null default now(),
  primary key (user_id, ol_key),
  constraint profile_books_key_len check (char_length(ol_key) between 8 and 80),
  constraint profile_books_key_shape check (ol_key like '/works/%'),
  constraint profile_books_title_len check (char_length(title) between 1 and 300),
  constraint profile_books_author_len check (
    author is null or char_length(author) between 1 and 300
  ),
  constraint profile_books_cover_id check (cover_id is null or cover_id > 0),
  constraint profile_books_year_len check (
    year is null or char_length(year) between 1 and 8
  )
);

create index if not exists profile_books_user_created
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
      and ol_key = new.ol_key
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

drop trigger if exists profile_books_cap on public.profile_books;
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

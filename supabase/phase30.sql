-- DARKE v1 Phase 30 — Feature up to 10 TMDB titles on a public profile
-- Account-scoped, not DARKE ID vault. Run after phase29.sql.

create table if not exists public.tmdb_profile_features (
  user_id uuid not null references auth.users on delete cascade,
  media_type text not null check (media_type in ('movie', 'tv')),
  tmdb_id integer not null check (tmdb_id > 0),
  title text not null,
  poster_path text,
  year text,
  created_at timestamptz not null default now(),
  primary key (user_id, media_type, tmdb_id),
  constraint tmdb_profile_features_title_len check (char_length(title) between 1 and 300),
  constraint tmdb_profile_features_poster_len check (
    poster_path is null or char_length(poster_path) between 2 and 200
  ),
  constraint tmdb_profile_features_year_len check (
    year is null or char_length(year) = 4
  )
);

create index if not exists tmdb_profile_features_user_created
  on public.tmdb_profile_features (user_id, created_at desc);

create or replace function public.tmdb_profile_features_cap()
returns trigger
language plpgsql
as $$
begin
  if exists (
    select 1
    from public.tmdb_profile_features
    where user_id = new.user_id
      and media_type = new.media_type
      and tmdb_id = new.tmdb_id
  ) then
    return new;
  end if;
  if (
    select count(*)
    from public.tmdb_profile_features
    where user_id = new.user_id
  ) >= 10 then
    raise exception 'tmdb_profile_features_max';
  end if;
  return new;
end;
$$;

drop trigger if exists tmdb_profile_features_cap on public.tmdb_profile_features;
create trigger tmdb_profile_features_cap
  before insert on public.tmdb_profile_features
  for each row
  execute procedure public.tmdb_profile_features_cap();

alter table public.tmdb_profile_features enable row level security;

drop policy if exists "tmdb_profile_features_select_all" on public.tmdb_profile_features;
create policy "tmdb_profile_features_select_all"
  on public.tmdb_profile_features
  for select
  using (true);

drop policy if exists "tmdb_profile_features_insert_own" on public.tmdb_profile_features;
create policy "tmdb_profile_features_insert_own"
  on public.tmdb_profile_features
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "tmdb_profile_features_delete_own" on public.tmdb_profile_features;
create policy "tmdb_profile_features_delete_own"
  on public.tmdb_profile_features
  for delete
  using (auth.uid() = user_id);

grant select on table public.tmdb_profile_features to anon, authenticated;
grant insert, delete on table public.tmdb_profile_features to authenticated;

notify pgrst, 'reload schema';

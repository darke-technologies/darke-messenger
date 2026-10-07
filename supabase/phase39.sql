-- DARKE v1 Phase 39 — Up to 5 IGDB games on a public profile

create table if not exists public.profile_games (
  user_id uuid not null references auth.users on delete cascade,
  game_id bigint not null,
  name text not null,
  cover_url text,
  released text,
  created_at timestamptz not null default now(),
  primary key (user_id, game_id),
  constraint profile_games_id_pos check (game_id > 0),
  constraint profile_games_name_len check (char_length(name) between 1 and 300),
  constraint profile_games_cover_url_len check (
    cover_url is null or char_length(cover_url) between 8 and 2000
  ),
  constraint profile_games_released_len check (
    released is null or char_length(released) between 1 and 16
  )
);

create index if not exists profile_games_user_created
  on public.profile_games (user_id, created_at desc);

create or replace function public.profile_games_cap()
returns trigger
language plpgsql
as $$
begin
  if exists (
    select 1
    from public.profile_games
    where user_id = new.user_id
      and game_id = new.game_id
  ) then
    return new;
  end if;
  if (
    select count(*)
    from public.profile_games
    where user_id = new.user_id
  ) >= 5 then
    raise exception 'profile_games_max';
  end if;
  return new;
end;
$$;

drop trigger if exists profile_games_cap on public.profile_games;
create trigger profile_games_cap
  before insert on public.profile_games
  for each row
  execute procedure public.profile_games_cap();

alter table public.profile_games enable row level security;

drop policy if exists "profile_games_select_all" on public.profile_games;
create policy "profile_games_select_all"
  on public.profile_games
  for select
  using (true);

drop policy if exists "profile_games_insert_own" on public.profile_games;
create policy "profile_games_insert_own"
  on public.profile_games
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "profile_games_delete_own" on public.profile_games;
create policy "profile_games_delete_own"
  on public.profile_games
  for delete
  using (auth.uid() = user_id);

grant select on table public.profile_games to anon, authenticated;
grant insert, delete on table public.profile_games to authenticated;

notify pgrst, 'reload schema';

-- DARKE v1 Phase 72 — favorite profiles
-- Run in the Supabase SQL editor after phase71.sql.
-- Private list of people you favorite. No self-favorite.

create table if not exists public.profile_favorites (
  user_id uuid not null references public.profiles (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, profile_id),
  constraint profile_favorites_not_self check (user_id <> profile_id)
);

create index if not exists profile_favorites_profile
  on public.profile_favorites (profile_id, created_at desc);

create index if not exists profile_favorites_user
  on public.profile_favorites (user_id, created_at desc);

alter table public.profile_favorites enable row level security;

drop policy if exists "profile_favorites_select_own" on public.profile_favorites;
create policy "profile_favorites_select_own"
  on public.profile_favorites
  for select
  using (auth.uid() = user_id);

drop policy if exists "profile_favorites_insert_own" on public.profile_favorites;
create policy "profile_favorites_insert_own"
  on public.profile_favorites
  for insert
  with check (
    auth.uid() = user_id
    and user_id <> profile_id
    and exists (select 1 from public.profiles p where p.id = profile_id)
  );

drop policy if exists "profile_favorites_delete_own" on public.profile_favorites;
create policy "profile_favorites_delete_own"
  on public.profile_favorites
  for delete
  using (auth.uid() = user_id);

grant select, insert, delete on table public.profile_favorites to authenticated;

notify pgrst, 'reload schema';

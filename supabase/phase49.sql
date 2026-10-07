-- DARKE v1 Phase 49 — One-way user follows
-- Run in the Supabase SQL editor after phase48.sql.
-- follower_id follows following_id. No mutual requirement. No self-follow.

create table if not exists public.follows (
  follower_id uuid not null references public.profiles (id) on delete cascade,
  following_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, following_id),
  constraint follows_not_self check (follower_id <> following_id)
);

create index if not exists follows_following
  on public.follows (following_id, created_at desc);

create index if not exists follows_follower
  on public.follows (follower_id, created_at desc);

alter table public.follows enable row level security;

drop policy if exists "follows_select_all" on public.follows;
create policy "follows_select_all"
  on public.follows
  for select
  using (true);

drop policy if exists "follows_insert_own" on public.follows;
create policy "follows_insert_own"
  on public.follows
  for insert
  with check (
    auth.uid() = follower_id
    and follower_id <> following_id
    and exists (
      select 1 from public.profiles p where p.id = following_id
    )
  );

drop policy if exists "follows_delete_own" on public.follows;
create policy "follows_delete_own"
  on public.follows
  for delete
  using (auth.uid() = follower_id);

grant select on table public.follows to anon, authenticated;
grant insert, delete on table public.follows to authenticated;

notify pgrst, 'reload schema';

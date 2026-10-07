-- DARKE v1 Phase 78 — Post bookmarks
-- Run after phase77.sql.

create table if not exists public.beep_bookmarks (
  user_id uuid not null references public.profiles (id) on delete cascade,
  beep_id uuid not null references public.beeps (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, beep_id)
);

create index if not exists beep_bookmarks_user_created
  on public.beep_bookmarks (user_id, created_at desc);

alter table public.beep_bookmarks enable row level security;

drop policy if exists "beep_bookmarks_select_own" on public.beep_bookmarks;
create policy "beep_bookmarks_select_own"
  on public.beep_bookmarks for select
  using (auth.uid() = user_id);

drop policy if exists "beep_bookmarks_insert_own" on public.beep_bookmarks;
create policy "beep_bookmarks_insert_own"
  on public.beep_bookmarks for insert
  with check (auth.uid() = user_id);

drop policy if exists "beep_bookmarks_delete_own" on public.beep_bookmarks;
create policy "beep_bookmarks_delete_own"
  on public.beep_bookmarks for delete
  using (auth.uid() = user_id);

grant select, insert, delete on table public.beep_bookmarks to authenticated;

notify pgrst, 'reload schema';

-- DARKE v1 Phase 71 — unique feed-card reads per beep
-- Run in the Supabase SQL editor after phase70.sql.

create table if not exists public.beep_reads (
  beep_id uuid not null references public.beeps (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (beep_id, user_id)
);

create index if not exists beep_reads_beep
  on public.beep_reads (beep_id);

alter table public.beep_reads enable row level security;

drop policy if exists "beep_reads_select_all" on public.beep_reads;
create policy "beep_reads_select_all"
  on public.beep_reads for select using (true);

drop policy if exists "beep_reads_insert_own" on public.beep_reads;
create policy "beep_reads_insert_own"
  on public.beep_reads for insert
  with check (auth.uid() = user_id);

grant select on table public.beep_reads to anon, authenticated;
grant insert on table public.beep_reads to authenticated;

notify pgrst, 'reload schema';

-- DARKE v1 Phase 42 — Recommended builders on public profiles
-- Run in the Supabase SQL editor after phase41.sql (or phase32.sql).

alter table public.profiles
  add column if not exists top_8_users text[] not null default '{}';

alter table public.profiles
  drop constraint if exists profiles_top_8_len;
alter table public.profiles
  add constraint profiles_top_8_len
  check (cardinality(top_8_users) <= 8);

notify pgrst, 'reload schema';

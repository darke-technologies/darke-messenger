-- DARKE v1 Phase 28 — Public Signal handle on profiles
-- Run in the Supabase SQL editor after phase26.sql.

alter table public.profiles
  add column if not exists signal text;

alter table public.profiles
  drop constraint if exists profiles_signal_len;
alter table public.profiles
  add constraint profiles_signal_len
  check (
    signal is null
    or (
      char_length(signal) between 2 and 80
      and signal !~ '[[:space:]]'
    )
  );

notify pgrst, 'reload schema';

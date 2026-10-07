-- DARKE v1 Phase 41 — Drop public hire status from profiles
-- Run in the Supabase SQL editor after phase26.sql (email stays).

alter table public.profiles
  drop column if exists available_for_hire;

notify pgrst, 'reload schema';

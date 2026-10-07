-- DARKE v1 Phase 69 — 1000 character posts (beeps)
-- Run in the Supabase SQL editor after phase68.sql.

alter table public.beeps
  drop constraint if exists beeps_content_len;
alter table public.beeps
  add constraint beeps_content_len
  check (char_length(btrim(content)) between 1 and 1000);

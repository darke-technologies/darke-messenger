-- DARKE v1 Phase 67 — 500 character posts (beeps)
-- Run in the Supabase SQL editor after phase66.sql.
-- Existing posts longer than 500 characters are trimmed so the check can apply.

update public.beeps
set content = left(btrim(content), 500)
where char_length(btrim(content)) > 500;

alter table public.beeps
  drop constraint if exists beeps_content_len;
alter table public.beeps
  add constraint beeps_content_len
  check (char_length(btrim(content)) between 1 and 500);

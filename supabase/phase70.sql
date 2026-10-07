-- DARKE v1 Phase 70 — 3000 character posts, 1250 character comments
-- Run in the Supabase SQL editor after phase69.sql.

alter table public.beeps
  drop constraint if exists beeps_content_len;
alter table public.beeps
  add constraint beeps_content_len
  check (char_length(btrim(content)) between 1 and 3000);

alter table public.beep_comments
  drop constraint if exists beep_comments_content_len;
alter table public.beep_comments
  add constraint beep_comments_content_len
  check (char_length(btrim(content)) between 1 and 1250);

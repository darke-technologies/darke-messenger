-- DARKE v1 Phase 66 — 777 character posts and comments
-- Run in the Supabase SQL editor after phase65.sql.

alter table public.beeps
  drop constraint if exists beeps_content_len;
alter table public.beeps
  add constraint beeps_content_len
  check (char_length(btrim(content)) between 1 and 777);

alter table public.beep_comments
  drop constraint if exists beep_comments_content_len;
alter table public.beep_comments
  add constraint beep_comments_content_len
  check (char_length(btrim(content)) between 1 and 777);

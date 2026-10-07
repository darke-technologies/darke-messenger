-- DARKE v1 Phase 26 — Public hire status and contact email
-- Run in the Supabase SQL editor after phase20.sql.

alter table public.profiles
  add column if not exists available_for_hire boolean not null default false,
  add column if not exists email text;

alter table public.profiles
  drop constraint if exists profiles_email_format;
alter table public.profiles
  add constraint profiles_email_format
  check (
    email is null
    or (
      char_length(email) <= 254
      and email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    )
  );

notify pgrst, 'reload schema';

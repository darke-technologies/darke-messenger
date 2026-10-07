-- DARKE v1 Phase 99 — Discoverable public directory
-- Run after phase98.sql. Safe to re-run.
--
-- Opt-in listing: profiles stay hidden from PEOPLE until
-- is_discoverable is true (Edit Profile toggle, default false).

alter table public.profiles
  add column if not exists is_discoverable boolean not null default false;

comment on column public.profiles.is_discoverable is
  'When true, this profile appears in the public people directory.';

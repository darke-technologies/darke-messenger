-- DARKE v1 Phase 93 — Private operator profiles
-- Run after phase92.sql. Safe to re-run.

alter table public.profiles
  add column if not exists is_private boolean not null default false;

comment on column public.profiles.is_private is
  'When true, hide from public People/feed directories. Still visible in joined workspaces.';

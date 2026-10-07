-- DARKE v1 Phase 91 — DARKE ID + public key on profiles
-- Run after phase90.sql. Safe to re-run.

alter table public.profiles
  add column if not exists darke_id text;

alter table public.profiles
  add column if not exists public_key text;

create unique index if not exists profiles_darke_id_key
  on public.profiles (darke_id)
  where darke_id is not null;

comment on column public.profiles.darke_id is
  'Mullvad-style account number, e.g. DARKE-2455-8902-1143-9012';

comment on column public.profiles.public_key is
  'Hex-encoded ECDH P-256 SPKI public key derived on the client';

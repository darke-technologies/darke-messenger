-- DARKE v1 Phase 105 — Drop unused legacy group tables if they exist
-- Run after phase104.sql. Safe to re-run.
-- This repo never created public.groups / group_members / group_messages.
-- Drops are IF EXISTS only. Does not touch pending_messages or 1:1 mailbox.

drop table if exists public.group_messages cascade;
drop table if exists public.group_members cascade;
drop table if exists public.groups cascade;

notify pgrst, 'reload schema';

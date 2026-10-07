-- DARKE v1 Phase 68 — Remove company experience / listing team
-- Run in the Supabase SQL editor after phase67.sql.
-- Drops user–company experience relations. app_listings is left in place
-- for TANK (off) and historical listing rows.

drop trigger if exists app_listing_team_before_write on public.app_listing_team;
drop trigger if exists app_listing_team_guard_admin on public.app_listing_team;
drop function if exists public.app_listing_team_before_write();
drop function if exists public.app_listing_team_guard_admin();
drop table if exists public.app_listing_team;

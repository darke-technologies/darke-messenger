-- DARKE v1 Phase 104 — Drop Teams tables
-- Run after phase103.sql. Safe to re-run.
-- Removes the former Teams product (teams, members, chats, slug aliases).
-- Does not drop public.workspaces.

drop policy if exists "team_slug_aliases_select" on public.team_slug_aliases;
drop policy if exists "team_slug_aliases_write_owner" on public.team_slug_aliases;
drop policy if exists "team_members_select" on public.team_members;
drop policy if exists "team_members_write_owner" on public.team_members;
drop policy if exists "teams_select_member" on public.teams;

drop table if exists public.team_slug_aliases cascade;
drop table if exists public.team_chats cascade;
drop table if exists public.team_members cascade;
drop table if exists public.teams cascade;

notify pgrst, 'reload schema';

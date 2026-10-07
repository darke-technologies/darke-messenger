-- DARKE v1 Phase 102 — Team display_name vs URL slug + aliases
-- Run after phase101.sql. Safe to re-run.
-- Additive only. Does not replace phase100 teams table.

alter table public.teams
  add column if not exists display_name text;

update public.teams
set display_name = coalesce(nullif(btrim(display_name), ''), name, 'TEAM')
where display_name is null
   or btrim(display_name) = '';

alter table public.teams
  alter column display_name set default 'TEAM';

alter table public.teams
  add column if not exists slug text;

update public.teams
set slug = lower(regexp_replace(regexp_replace(coalesce(display_name, name, 'team'), '[^a-zA-Z0-9]+', '-', 'g'), '(^-|-$)', '', 'g'))
where slug is null or btrim(slug) = '';

update public.teams
set slug = concat('team-', substr(id::text, 1, 8))
where slug is null or btrim(slug) = '';

create unique index if not exists teams_slug_unique on public.teams (slug);

create table if not exists public.team_slug_aliases (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  old_slug text not null,
  created_at timestamptz not null default now(),
  constraint team_slug_aliases_old_unique unique (old_slug)
);

create index if not exists team_slug_aliases_old on public.team_slug_aliases (old_slug);
create index if not exists team_slug_aliases_team on public.team_slug_aliases (team_id);

alter table public.team_slug_aliases enable row level security;

drop policy if exists "team_slug_aliases_select" on public.team_slug_aliases;
create policy "team_slug_aliases_select"
  on public.team_slug_aliases for select
  using (
    exists (
      select 1 from public.teams t
      where t.id = team_slug_aliases.team_id
        and (
          t.owner_id = auth.uid()
          or exists (
            select 1 from public.team_members m
            where m.team_id = t.id and m.user_id = auth.uid()
          )
        )
    )
  );

drop policy if exists "team_slug_aliases_write_owner" on public.team_slug_aliases;
create policy "team_slug_aliases_write_owner"
  on public.team_slug_aliases for all
  using (
    exists (
      select 1 from public.teams t
      where t.id = team_slug_aliases.team_id and t.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.teams t
      where t.id = team_slug_aliases.team_id and t.owner_id = auth.uid()
    )
  );

grant select, insert, update, delete on table public.team_slug_aliases to authenticated;

notify pgrst, 'reload schema';

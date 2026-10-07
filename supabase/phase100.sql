-- DARKE v1 Phase 100 — Teams
-- Run after phase99.sql. Safe to re-run.
--
-- An account may CREATE exactly one team (unique owner_id).
-- The same user may JOIN any number of teams as team_members.
-- Free sandbox is 2 seats on a team (owner + 1) unless Premium.
-- Chat nodes stay local; team_chats links session ids when synced.

create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null default 'TEAM',
  created_at timestamptz not null default now(),
  constraint teams_one_per_owner unique (owner_id)
);

create table if not exists public.team_members (
  team_id uuid not null references public.teams (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'member'
    check (role in ('owner', 'admin', 'member')),
  joined_at timestamptz not null default now(),
  primary key (team_id, user_id)
);

create table if not exists public.team_chats (
  team_id uuid not null references public.teams (id) on delete cascade,
  chat_id text not null,
  added_at timestamptz not null default now(),
  primary key (team_id, chat_id)
);

create index if not exists team_members_user on public.team_members (user_id);
create index if not exists team_chats_chat on public.team_chats (chat_id);

alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.team_chats enable row level security;

drop policy if exists "teams_select_member" on public.teams;
create policy "teams_select_member"
  on public.teams for select
  using (
    owner_id = auth.uid()
    or exists (
      select 1 from public.team_members m
      where m.team_id = teams.id and m.user_id = auth.uid()
    )
  );

drop policy if exists "teams_insert_own" on public.teams;
create policy "teams_insert_own"
  on public.teams for insert
  with check (owner_id = auth.uid());

drop policy if exists "teams_update_owner" on public.teams;
create policy "teams_update_owner"
  on public.teams for update
  using (owner_id = auth.uid());

drop policy if exists "team_members_select" on public.team_members;
create policy "team_members_select"
  on public.team_members for select
  using (
    exists (
      select 1 from public.teams t
      where t.id = team_members.team_id
        and (t.owner_id = auth.uid() or exists (
          select 1 from public.team_members x
          where x.team_id = t.id and x.user_id = auth.uid()
        ))
    )
  );

drop policy if exists "team_members_write_owner" on public.team_members;
create policy "team_members_write_owner"
  on public.team_members for all
  using (
    exists (
      select 1 from public.teams t
      where t.id = team_members.team_id and t.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.teams t
      where t.id = team_members.team_id and t.owner_id = auth.uid()
    )
  );

drop policy if exists "team_chats_select" on public.team_chats;
create policy "team_chats_select"
  on public.team_chats for select
  using (
    exists (
      select 1 from public.teams t
      where t.id = team_chats.team_id
        and (t.owner_id = auth.uid() or exists (
          select 1 from public.team_members m
          where m.team_id = t.id and m.user_id = auth.uid()
        ))
    )
  );

drop policy if exists "team_chats_write_owner" on public.team_chats;
create policy "team_chats_write_owner"
  on public.team_chats for all
  using (
    exists (
      select 1 from public.teams t
      where t.id = team_chats.team_id and t.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.teams t
      where t.id = team_chats.team_id and t.owner_id = auth.uid()
    )
  );

grant select, insert, update, delete on table public.teams to authenticated;
grant select, insert, update, delete on table public.team_members to authenticated;
grant select, insert, update, delete on table public.team_chats to authenticated;

notify pgrst, 'reload schema';

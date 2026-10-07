-- DARKE v1 Phase 95 — Restore team provision + workspaces RLS
-- Run after phase94.sql. Safe to re-run.
-- Fixes: signup 42501 on public.workspaces; missing default team for new profiles.

create or replace function public.workspace_active_limit_for(uid uuid)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  st text;
  pro boolean;
begin
  select lower(coalesce(subscription_status, 'free')), coalesce(is_pro, false)
    into st, pro
  from public.profiles
  where id = uid;
  if not found then
    return 1;
  end if;
  if st in ('pro', 'elite') or pro then
    return -1;
  end if;
  return 1;
end;
$$;

create or replace function public.ensure_default_workspace()
returns public.workspaces
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  row public.workspaces;
  handle text;
  team_name text;
  team_slug text;
begin
  if uid is null then
    raise exception 'Not signed in';
  end if;

  select * into row
  from public.workspaces
  where owner_id = uid
  order by created_at asc
  limit 1;
  if found then
    return row;
  end if;

  select coalesce(nullif(btrim(username), ''), 'my')
    into handle
  from public.profiles
  where id = uid;
  handle := coalesce(nullif(btrim(handle), ''), 'my');
  team_name := initcap(handle) || '''s Team';
  team_slug := public.workspace_unique_slug(handle || '-team', null);

  insert into public.workspaces (owner_id, name, status, slug)
  values (uid, team_name, 'active', team_slug)
  returning * into row;
  return row;
end;
$$;

create or replace function public.provision_default_workspace()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  handle text;
  team_name text;
  team_slug text;
begin
  if exists (
    select 1 from public.workspaces w where w.owner_id = new.id
  ) then
    return new;
  end if;
  handle := coalesce(nullif(btrim(new.username), ''), 'my');
  team_name := initcap(handle) || '''s Team';
  team_slug := public.workspace_unique_slug(handle || '-team', null);
  insert into public.workspaces (owner_id, name, status, slug)
  values (new.id, team_name, 'active', team_slug);
  return new;
end;
$$;

drop trigger if exists profiles_provision_workspace on public.profiles;
create trigger profiles_provision_workspace
after insert on public.profiles
for each row
execute procedure public.provision_default_workspace();

grant execute on function public.ensure_default_workspace() to authenticated;
grant execute on function public.workspace_active_limit_for(uuid) to authenticated;

grant select, insert, update on table public.workspaces to authenticated;

alter table public.workspaces enable row level security;

drop policy if exists "workspaces_select_own" on public.workspaces;
create policy "workspaces_select_own"
  on public.workspaces for select
  using (
    auth.uid() = owner_id
    or public.is_workspace_member(id)
  );

drop policy if exists "workspaces_insert_own" on public.workspaces;
create policy "workspaces_insert_own"
  on public.workspaces for insert
  with check (auth.uid() = owner_id);

drop policy if exists "workspaces_update_own" on public.workspaces;
create policy "workspaces_update_own"
  on public.workspaces for update
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

notify pgrst, 'reload schema';

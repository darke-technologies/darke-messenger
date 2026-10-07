-- DARKE v1 Phase 88 — Workspace-first: every channel belongs to a workspace
-- Free: 1 workspace + 1 channel. Run after phase87.sql.

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

create or replace function public.workspace_channel_limit_for(uid uuid)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return public.workspace_active_limit_for(uid);
end;
$$;

create or replace function public.standalone_channel_limit_for(uid uuid)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return 0;
end;
$$;

-- Fold leftover standalone channels into an owned workspace.
do $$
declare
  r record;
  ws uuid;
  uname text;
begin
  for r in
    select distinct c.created_by as uid
    from public.workspace_channels c
    where c.workspace_id is null
      and c.created_by is not null
  loop
    select w.id into ws
    from public.workspaces w
    where w.owner_id = r.uid
    order by w.created_at asc
    limit 1;
    if ws is null then
      select coalesce(nullif(btrim(p.display_name), ''), p.username, 'Workspace')
        into uname
      from public.profiles p
      where p.id = r.uid;
      insert into public.workspaces (owner_id, name, status)
      values (r.uid, coalesce(uname, 'Workspace'), 'active')
      returning id into ws;
    end if;
    update public.workspace_channels
    set workspace_id = ws
    where workspace_id is null
      and created_by = r.uid;
  end loop;
end;
$$;

delete from public.workspace_channels
where workspace_id is null;

drop index if exists workspace_channels_solo_slug;

alter table public.workspace_channels
  alter column workspace_id set not null;

create or replace function public.channels_enforce_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  owner uuid;
  lim integer;
  n integer;
begin
  if new.id is null then
    new.id := gen_random_uuid();
  end if;
  new.name := btrim(new.name);
  new.slug := lower(btrim(new.slug));
  new.slug_hash := replace(new.id::text, '-', '');
  if new.visibility is null or new.visibility = '' then
    new.visibility := 'private';
  end if;
  if new.created_by is null then
    new.created_by := auth.uid();
  end if;
  if new.workspace_id is null then
    raise exception 'workspace_missing'
      using errcode = 'P0001';
  end if;
  select w.owner_id into owner from public.workspaces w where w.id = new.workspace_id;
  if owner is null then
    raise exception 'workspace_missing';
  end if;
  lim := public.workspace_channel_limit_for(owner);
  if lim >= 0 then
    select count(*)::integer into n
    from public.workspace_channels c
    where c.workspace_id = new.workspace_id
      and c.id is distinct from new.id;
    if n >= lim then
      raise exception 'workspace_channel_limit'
        using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

drop policy if exists "workspace_channels_insert" on public.workspace_channels;
create policy "workspace_channels_insert"
  on public.workspace_channels for insert
  with check (
    coalesce(created_by, auth.uid()) = auth.uid()
    and workspace_id is not null
    and exists (
      select 1 from public.workspaces w
      where w.id = workspace_id
        and w.owner_id = auth.uid()
        and w.status = 'active'
    )
  );

notify pgrst, 'reload schema';

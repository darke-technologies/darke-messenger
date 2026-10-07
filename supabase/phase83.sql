-- DARKE v1 Phase 83 — Standalone channels, no signup workspace, PRO workspaces, tasks
-- Run after phase82.sql.

drop trigger if exists profiles_provision_workspace on public.profiles;

create or replace function public.provision_default_workspace()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  return new;
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
  raise exception 'no_workspace';
end;
$$;

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
    return 0;
  end if;
  if st in ('pro', 'elite') or pro then
    return -1;
  end if;
  return 0;
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
declare
  st text;
  pro boolean;
begin
  select lower(coalesce(subscription_status, 'free')), coalesce(is_pro, false)
    into st, pro
  from public.profiles
  where id = uid;
  if st in ('pro', 'elite') or pro then
    return -1;
  end if;
  return 1;
end;
$$;

create or replace function public.workspace_seat_limit_for(uid uuid)
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

alter table public.workspace_channels
  alter column workspace_id drop not null;

alter table public.workspace_channels
  drop constraint if exists workspace_channels_slug_unique;

drop index if exists workspace_channels_slug_unique;
drop index if exists workspace_channels_ws_slug;
drop index if exists workspace_channels_solo_slug;

create unique index if not exists workspace_channels_ws_slug
  on public.workspace_channels (workspace_id, slug)
  where workspace_id is not null;

create unique index if not exists workspace_channels_solo_slug
  on public.workspace_channels (created_by, slug)
  where workspace_id is null;

alter table public.workspace_invites
  alter column workspace_id drop not null;

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
  st text;
  pro boolean;
begin
  new.name := btrim(new.name);
  new.slug := lower(btrim(new.slug));
  if new.visibility is null or new.visibility = '' then
    new.visibility := 'public';
  end if;
  if new.created_by is null then
    new.created_by := auth.uid();
  end if;
  if new.workspace_id is null then
    if new.created_by is null then
      raise exception 'not signed in';
    end if;
    lim := public.standalone_channel_limit_for(new.created_by);
    if lim >= 0 then
      select count(*)::integer into n
      from public.workspace_channels c
      where c.workspace_id is null
        and c.created_by = new.created_by
        and c.id is distinct from new.id;
      if n >= lim then
        raise exception 'workspace_channel_limit'
          using errcode = 'P0001';
      end if;
    end if;
    return new;
  end if;
  select w.owner_id into owner from public.workspaces w where w.id = new.workspace_id;
  if owner is null then
    raise exception 'workspace_missing';
  end if;
  select lower(coalesce(subscription_status, 'free')), coalesce(is_pro, false)
    into st, pro
  from public.profiles
  where id = owner;
  if st is distinct from 'pro' and st is distinct from 'elite' and not coalesce(pro, false) then
    raise exception 'workspace_channel_limit'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create or replace function public.channel_after_insert_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.created_by is not null then
    insert into public.channel_members (channel_id, user_id, role)
    values (new.id, new.created_by, 'owner')
    on conflict (channel_id, user_id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists channel_after_insert_owner on public.workspace_channels;
create trigger channel_after_insert_owner
after insert on public.workspace_channels
for each row
execute procedure public.channel_after_insert_owner();

create or replace function public.is_channel_member(ch uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.channel_members cm
    where cm.channel_id = ch and cm.user_id = auth.uid()
  ) or exists (
    select 1 from public.workspace_channels c
    where c.id = ch and c.created_by = auth.uid()
  ) or exists (
    select 1
    from public.workspace_channels c
    join public.workspaces w on w.id = c.workspace_id
    where c.id = ch and w.owner_id = auth.uid()
  );
$$;

create or replace function public.can_select_channel(ch uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_channel_member(ch)
    or exists (
      select 1 from public.workspace_channels c
      where c.id = ch
        and c.workspace_id is not null
        and public.is_workspace_staff(c.workspace_id)
    );
$$;

drop policy if exists "workspace_channels_select" on public.workspace_channels;
create policy "workspace_channels_select"
  on public.workspace_channels for select
  using (public.can_select_channel(id));

drop policy if exists "workspace_channels_insert" on public.workspace_channels;
create policy "workspace_channels_insert"
  on public.workspace_channels for insert
  with check (
    coalesce(created_by, auth.uid()) = auth.uid()
    and (
      workspace_id is null
      or exists (
        select 1 from public.workspaces w
        where w.id = workspace_id
          and w.owner_id = auth.uid()
          and w.status = 'active'
      )
    )
  );

drop policy if exists "workspace_channels_update" on public.workspace_channels;
create policy "workspace_channels_update"
  on public.workspace_channels for update
  using (
    created_by = auth.uid()
    or (
      workspace_id is not null
      and exists (
        select 1 from public.workspaces w
        where w.id = workspace_id and w.owner_id = auth.uid()
      )
    )
  )
  with check (
    created_by = auth.uid()
    or (
      workspace_id is not null
      and exists (
        select 1 from public.workspaces w
        where w.id = workspace_id and w.owner_id = auth.uid()
      )
    )
  );

drop policy if exists "workspace_channels_delete" on public.workspace_channels;
create policy "workspace_channels_delete"
  on public.workspace_channels for delete
  using (
    created_by = auth.uid()
    or (
      workspace_id is not null
      and exists (
        select 1 from public.workspaces w
        where w.id = workspace_id and w.owner_id = auth.uid()
      )
    )
  );

drop policy if exists "channel_members_insert" on public.channel_members;
create policy "channel_members_insert"
  on public.channel_members for insert
  with check (
    public.is_channel_member(channel_id)
    or exists (
      select 1 from public.workspace_channels c
      where c.id = channel_id and c.created_by = auth.uid()
    )
    or exists (
      select 1 from public.workspace_channels c
      where c.id = channel_id
        and c.workspace_id is not null
        and public.is_workspace_staff(c.workspace_id)
    )
  );

drop policy if exists "workspace_invites_select" on public.workspace_invites;
create policy "workspace_invites_select"
  on public.workspace_invites for select
  using (
    created_by = auth.uid()
    or (
      workspace_id is not null
      and exists (
        select 1 from public.workspaces w
        where w.id = workspace_id and w.owner_id = auth.uid()
      )
    )
    or (
      channel_id is not null
      and exists (
        select 1 from public.workspace_channels c
        where c.id = channel_id and c.created_by = auth.uid()
      )
    )
  );

create or replace function public.create_channel_invite(
  p_channel_id uuid,
  p_email text default null
)
returns public.workspace_invites
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  ws uuid;
  mail text;
  row public.workspace_invites;
begin
  if uid is null then
    raise exception 'Not signed in';
  end if;
  if not public.can_select_channel(p_channel_id) then
    raise exception 'channel_missing';
  end if;
  if not exists (
    select 1 from public.workspace_channels c
    where c.id = p_channel_id
      and (
        c.created_by = uid
        or (
          c.workspace_id is not null
          and public.is_workspace_staff(c.workspace_id)
        )
      )
  ) then
    raise exception 'Not channel staff';
  end if;
  select c.workspace_id into ws
  from public.workspace_channels c
  where c.id = p_channel_id;
  mail := nullif(lower(btrim(coalesce(p_email, ''))), '');
  insert into public.workspace_invites (
    workspace_id, token, email, created_by, kind, channel_id
  )
  values (
    ws, replace(gen_random_uuid()::text, '-', ''), mail, uid, 'channel', p_channel_id
  )
  returning * into row;
  return row;
end;
$$;

drop function if exists public.accept_workspace_invite(text);
create function public.accept_workspace_invite(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  inv public.workspace_invites;
  member_role text;
begin
  if uid is null then
    raise exception 'Not signed in';
  end if;
  select * into inv
  from public.workspace_invites
  where token = btrim(p_token)
  limit 1;
  if not found then
    raise exception 'invite_invalid';
  end if;
  member_role := case when coalesce(inv.kind, 'workspace') = 'channel' then 'guest' else 'member' end;
  if inv.workspace_id is not null then
    insert into public.workspace_members (workspace_id, user_id, role)
    values (inv.workspace_id, uid, member_role)
    on conflict (workspace_id, user_id) do update
      set role = case
        when public.workspace_members.role = 'owner' then 'owner'
        when public.workspace_members.role = 'member' then 'member'
        else excluded.role
      end;
  end if;
  if inv.channel_id is not null then
    insert into public.channel_members (channel_id, user_id, role)
    values (inv.channel_id, uid, case when member_role = 'member' then 'member' else 'guest' end)
    on conflict (channel_id, user_id) do nothing;
  end if;
  update public.workspace_invites
  set accepted_at = now()
  where id = inv.id and accepted_at is null;
  return jsonb_build_object(
    'ok', true,
    'workspace_id', inv.workspace_id,
    'channel_id', inv.channel_id
  );
end;
$$;

grant execute on function public.accept_workspace_invite(text) to authenticated;
grant execute on function public.create_channel_invite(uuid, text) to authenticated;
grant execute on function public.standalone_channel_limit_for(uuid) to authenticated;

create table if not exists public.channel_tasks (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.workspace_channels (id) on delete cascade,
  title text not null,
  done boolean not null default false,
  sort integer not null default 0,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint channel_tasks_title_len check (
    char_length(btrim(title)) between 1 and 200
  )
);

create index if not exists channel_tasks_channel
  on public.channel_tasks (channel_id, sort asc, created_at asc);

alter table public.channel_tasks enable row level security;

drop policy if exists "channel_tasks_select" on public.channel_tasks;
create policy "channel_tasks_select"
  on public.channel_tasks for select
  using (public.can_select_channel(channel_id));

drop policy if exists "channel_tasks_insert" on public.channel_tasks;
create policy "channel_tasks_insert"
  on public.channel_tasks for insert
  with check (
    created_by = auth.uid()
    and public.can_select_channel(channel_id)
  );

drop policy if exists "channel_tasks_update" on public.channel_tasks;
create policy "channel_tasks_update"
  on public.channel_tasks for update
  using (public.can_select_channel(channel_id))
  with check (public.can_select_channel(channel_id));

drop policy if exists "channel_tasks_delete" on public.channel_tasks;
create policy "channel_tasks_delete"
  on public.channel_tasks for delete
  using (public.can_select_channel(channel_id));

grant select, insert, update, delete on table public.channel_tasks to authenticated;

notify pgrst, 'reload schema';

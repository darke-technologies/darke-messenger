-- DARKE v1 Phase 92 — Workspace/channel access keys
-- Run after phase91.sql. Safe to re-run.

alter table public.workspace_invites
  add column if not exists access_key text;

alter table public.workspace_invites
  add column if not exists max_uses integer;

alter table public.workspace_invites
  add column if not exists use_count integer not null default 0;

alter table public.workspace_invites
  add column if not exists expires_at timestamptz;

alter table public.workspace_invites
  add column if not exists revoked_at timestamptz;

alter table public.workspace_invites
  add column if not exists is_root boolean not null default false;

create unique index if not exists workspace_invites_access_key
  on public.workspace_invites (access_key)
  where access_key is not null;

create table if not exists public.channel_invites (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.workspace_channels (id) on delete cascade,
  workspace_id uuid references public.workspaces (id) on delete cascade,
  token text not null unique,
  access_key text not null unique,
  max_uses integer,
  use_count integer not null default 0,
  expires_at timestamptz,
  revoked_at timestamptz,
  is_root boolean not null default false,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists channel_invites_channel
  on public.channel_invites (channel_id, created_at desc);

alter table public.channel_invites enable row level security;

drop policy if exists "channel_invites_select" on public.channel_invites;
create policy "channel_invites_select"
  on public.channel_invites for select
  using (
    workspace_id is not null
    and public.is_workspace_staff(workspace_id)
  );

drop policy if exists "channel_invites_update" on public.channel_invites;
create policy "channel_invites_update"
  on public.channel_invites for update
  using (
    workspace_id is not null
    and public.is_workspace_staff(workspace_id)
  );

grant select, update on table public.channel_invites to authenticated;

create or replace function public.create_workspace_access_key(
  p_workspace_id uuid,
  p_access_key text,
  p_max_uses integer default null,
  p_ttl_seconds integer default null,
  p_is_root boolean default false
)
returns public.workspace_invites
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  row public.workspace_invites;
  key text := upper(btrim(p_access_key));
begin
  if uid is null then
    raise exception 'Not signed in';
  end if;
  if not public.is_workspace_staff(p_workspace_id) then
    raise exception 'Not workspace staff';
  end if;
  if key is null or key !~ '^DARKE-WKS-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$' then
    raise exception 'access_key_invalid';
  end if;
  insert into public.workspace_invites (
    workspace_id, token, created_by, kind, access_key, max_uses, expires_at, is_root
  )
  values (
    p_workspace_id,
    key,
    uid,
    'workspace',
    key,
    p_max_uses,
    case when p_ttl_seconds is null or p_ttl_seconds <= 0 then null
         else now() + make_interval(secs => p_ttl_seconds) end,
    coalesce(p_is_root, false)
  )
  returning * into row;
  return row;
end;
$$;

create or replace function public.create_channel_access_key(
  p_channel_id uuid,
  p_access_key text,
  p_max_uses integer default null,
  p_ttl_seconds integer default null,
  p_is_root boolean default false
)
returns public.channel_invites
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  ws uuid;
  row public.channel_invites;
  key text := upper(btrim(p_access_key));
begin
  if uid is null then
    raise exception 'Not signed in';
  end if;
  select c.workspace_id into ws
  from public.workspace_channels c
  where c.id = p_channel_id;
  if ws is null or not public.is_workspace_staff(ws) then
    raise exception 'Not channel staff';
  end if;
  if key is null or key !~ '^DARKE-CHN-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$' then
    raise exception 'access_key_invalid';
  end if;
  insert into public.channel_invites (
    channel_id, workspace_id, token, access_key, max_uses, expires_at, is_root, created_by
  )
  values (
    p_channel_id,
    ws,
    key,
    key,
    p_max_uses,
    case when p_ttl_seconds is null or p_ttl_seconds <= 0 then null
         else now() + make_interval(secs => p_ttl_seconds) end,
    coalesce(p_is_root, false),
    uid
  )
  returning * into row;
  return row;
end;
$$;

create or replace function public.revoke_workspace_access_key(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  ws uuid;
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  select workspace_id into ws from public.workspace_invites where id = p_id;
  if ws is null or not public.is_workspace_staff(ws) then
    raise exception 'Not workspace staff';
  end if;
  update public.workspace_invites
  set revoked_at = now()
  where id = p_id and revoked_at is null;
end;
$$;

create or replace function public.revoke_channel_access_key(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  ws uuid;
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  select workspace_id into ws from public.channel_invites where id = p_id;
  if ws is null or not public.is_workspace_staff(ws) then
    raise exception 'Not channel staff';
  end if;
  update public.channel_invites
  set revoked_at = now()
  where id = p_id and revoked_at is null;
end;
$$;

create or replace function public.redeem_access_key(p_key text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  key text := upper(btrim(p_key));
  winv public.workspace_invites;
  cinv public.channel_invites;
  member_role text;
begin
  if uid is null then
    raise exception 'Not signed in';
  end if;

  select * into winv
  from public.workspace_invites
  where access_key = key or token = btrim(p_key)
  limit 1;

  if found then
    if winv.revoked_at is not null then
      raise exception 'invite_revoked';
    end if;
    if winv.expires_at is not null and winv.expires_at < now() then
      raise exception 'invite_expired';
    end if;
    if winv.max_uses is not null and winv.use_count >= winv.max_uses then
      raise exception 'invite_exhausted';
    end if;
    member_role := case when coalesce(winv.kind, 'workspace') = 'channel' then 'guest' else 'member' end;
    if winv.workspace_id is not null then
      insert into public.workspace_members (workspace_id, user_id, role)
      values (winv.workspace_id, uid, member_role)
      on conflict (workspace_id, user_id) do update
        set role = case
          when public.workspace_members.role = 'owner' then 'owner'
          when public.workspace_members.role = 'member' then 'member'
          else excluded.role
        end;
    end if;
    if winv.channel_id is not null then
      insert into public.channel_members (channel_id, user_id, role)
      values (winv.channel_id, uid, case when member_role = 'member' then 'member' else 'guest' end)
      on conflict (channel_id, user_id) do nothing;
    end if;
    update public.workspace_invites
    set use_count = use_count + 1,
        accepted_at = coalesce(accepted_at, now())
    where id = winv.id;
    return jsonb_build_object(
      'ok', true,
      'workspace_id', winv.workspace_id,
      'channel_id', winv.channel_id
    );
  end if;

  select * into cinv
  from public.channel_invites
  where access_key = key or token = btrim(p_key)
  limit 1;

  if not found then
    raise exception 'invite_invalid';
  end if;
  if cinv.revoked_at is not null then
    raise exception 'invite_revoked';
  end if;
  if cinv.expires_at is not null and cinv.expires_at < now() then
    raise exception 'invite_expired';
  end if;
  if cinv.max_uses is not null and cinv.use_count >= cinv.max_uses then
    raise exception 'invite_exhausted';
  end if;
  if cinv.workspace_id is not null then
    insert into public.workspace_members (workspace_id, user_id, role)
    values (cinv.workspace_id, uid, 'guest')
    on conflict (workspace_id, user_id) do nothing;
  end if;
  insert into public.channel_members (channel_id, user_id, role)
  values (cinv.channel_id, uid, 'guest')
  on conflict (channel_id, user_id) do nothing;
  update public.channel_invites
  set use_count = use_count + 1
  where id = cinv.id;
  return jsonb_build_object(
    'ok', true,
    'workspace_id', cinv.workspace_id,
    'channel_id', cinv.channel_id
  );
end;
$$;

grant execute on function public.create_workspace_access_key(uuid, text, integer, integer, boolean) to authenticated;
grant execute on function public.create_channel_access_key(uuid, text, integer, integer, boolean) to authenticated;
grant execute on function public.revoke_workspace_access_key(uuid) to authenticated;
grant execute on function public.revoke_channel_access_key(uuid) to authenticated;
grant execute on function public.redeem_access_key(text) to authenticated;

notify pgrst, 'reload schema';

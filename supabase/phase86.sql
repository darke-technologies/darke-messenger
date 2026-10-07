-- DARKE v1 Phase 86 — Uncap channel/workspace invite velocity
-- Run after phase84.sql (and phase85.sql if you have it).
-- Safe to re-run if you already applied the uncapped copies in phase84.

create or replace function public.create_channel_invite(
  p_channel_id uuid,
  p_email text default null,
  p_invitee_id uuid default null
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
  networked boolean := false;
  oom boolean := true;
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
  if p_invitee_id is not null then
    if p_invitee_id = uid then
      raise exception 'invite_self';
    end if;
    if exists (
      select 1 from public.invite_blocks b
      where b.blocker_id = p_invitee_id and b.blocked_id = uid
    ) then
      raise exception 'invite_blocked';
    end if;
    networked := public.is_mutual_follow(uid, p_invitee_id);
    oom := not networked;
  end if;
  select c.workspace_id into ws
  from public.workspace_channels c
  where c.id = p_channel_id;
  mail := nullif(lower(btrim(coalesce(p_email, ''))), '');
  insert into public.workspace_invites (
    workspace_id, token, email, created_by, kind, channel_id,
    invitee_id, out_of_network
  )
  values (
    ws,
    replace(gen_random_uuid()::text, '-', ''),
    mail,
    uid,
    'channel',
    p_channel_id,
    p_invitee_id,
    oom
  )
  returning * into row;
  if p_invitee_id is not null and networked then
    insert into public.channel_members (channel_id, user_id, role)
    values (p_channel_id, p_invitee_id, 'guest')
    on conflict (channel_id, user_id) do nothing;
    if ws is not null then
      insert into public.workspace_members (workspace_id, user_id, role)
      values (ws, p_invitee_id, 'guest')
      on conflict (workspace_id, user_id) do nothing;
    end if;
  elsif p_invitee_id is not null then
    insert into public.notifications (
      recipient_id, actor_id, type, invite_id
    )
    values (p_invitee_id, uid, 'channel_invite', row.id);
  end if;
  return row;
end;
$$;

create or replace function public.create_workspace_invite(
  p_workspace_id uuid,
  p_email text default null,
  p_invitee_id uuid default null
)
returns public.workspace_invites
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  owner uuid;
  lim integer;
  mail text;
  row public.workspace_invites;
  networked boolean := false;
  oom boolean := true;
begin
  if uid is null then
    raise exception 'Not signed in';
  end if;
  select w.owner_id into owner
  from public.workspaces w
  where w.id = p_workspace_id;
  if owner is null or owner is distinct from uid then
    raise exception 'Not workspace owner';
  end if;
  lim := public.workspace_seat_limit_for(owner);
  if lim = 1 then
    raise exception 'workspace_invite_forbidden'
      using errcode = 'P0001';
  end if;
  if p_invitee_id is not null then
    if p_invitee_id = uid then
      raise exception 'invite_self';
    end if;
    if exists (
      select 1 from public.invite_blocks b
      where b.blocker_id = p_invitee_id and b.blocked_id = uid
    ) then
      raise exception 'invite_blocked';
    end if;
    networked := public.is_mutual_follow(uid, p_invitee_id);
    oom := not networked;
  end if;
  mail := nullif(lower(btrim(coalesce(p_email, ''))), '');
  insert into public.workspace_invites (
    workspace_id, token, email, created_by, kind, invitee_id, out_of_network
  )
  values (
    p_workspace_id,
    replace(gen_random_uuid()::text, '-', ''),
    mail,
    uid,
    'workspace',
    p_invitee_id,
    oom
  )
  returning * into row;
  if p_invitee_id is not null and networked then
    insert into public.workspace_members (workspace_id, user_id, role)
    values (p_workspace_id, p_invitee_id, 'member')
    on conflict (workspace_id, user_id) do update
      set role = case
        when public.workspace_members.role = 'owner' then 'owner'
        else 'member'
      end;
  elsif p_invitee_id is not null then
    insert into public.notifications (
      recipient_id, actor_id, type, invite_id
    )
    values (p_invitee_id, uid, 'workspace_invite', row.id);
  end if;
  return row;
end;
$$;

drop function if exists public.invite_out_of_network_count(uuid);

grant execute on function public.create_channel_invite(uuid, text, uuid) to authenticated;
grant execute on function public.create_workspace_invite(uuid, text, uuid) to authenticated;

notify pgrst, 'reload schema';

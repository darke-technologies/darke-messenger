-- DARKE v1 Phase 89 — Owner/admin-only channel invites
-- Run after phase86.sql (or phase88.sql). Safe to re-run.

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
  owner uuid;
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
  select c.workspace_id, w.owner_id into ws, owner
  from public.workspace_channels c
  left join public.workspaces w on w.id = c.workspace_id
  where c.id = p_channel_id;
  if owner is null or owner is distinct from uid then
    raise exception 'Not workspace owner';
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

grant execute on function public.create_channel_invite(uuid, text, uuid) to authenticated;

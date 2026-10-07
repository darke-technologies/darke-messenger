-- DARKE v1 Phase 98 — Chat guests vs paid team seats
-- Run after phase97.sql. Safe to re-run.
--
-- Chat / channel join never consumes organization.seats_used.
-- MY TEAM invites create paid OrganizationMember rows and gate on
-- seats_used >= max_seats.

create or replace function public.organization_seats_used(p_workspace_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer
  from public.workspace_members m
  where m.workspace_id = p_workspace_id
    and m.role in ('owner', 'member');
$$;

create or replace function public.organization_max_seats(p_workspace_id uuid)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  owner uuid;
begin
  select w.owner_id into owner
  from public.workspaces w
  where w.id = p_workspace_id;
  if owner is null then
    return 1;
  end if;
  return public.workspace_seat_limit_for(owner);
end;
$$;

create or replace function public.workspace_seats_enforce()
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
  -- Chat guests never consume paid seats.
  if new.role not in ('owner', 'member') then
    return new;
  end if;
  select w.owner_id into owner from public.workspaces w where w.id = new.workspace_id;
  if owner is null then
    raise exception 'workspace_missing';
  end if;
  lim := public.workspace_seat_limit_for(owner);
  if lim < 0 then
    return new;
  end if;
  select count(*)::integer into n
  from public.workspace_members m
  where m.workspace_id = new.workspace_id
    and m.role in ('owner', 'member')
    and m.user_id is distinct from new.user_id;
  if n >= lim then
    raise exception 'workspace_seat_limit'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists workspace_seats_enforce on public.workspace_members;
create trigger workspace_seats_enforce
before insert or update on public.workspace_members
for each row
execute procedure public.workspace_seats_enforce();

-- Individual chat / channel invite: ChatGuest only. No seat check.
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
  if not exists (
    select 1 from public.workspace_channels c
    where c.id = p_channel_id
      and (
        c.created_by = uid
        or owner is not distinct from uid
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
  elsif p_invitee_id is not null then
    insert into public.notifications (
      recipient_id, actor_id, type, invite_id
    )
    values (p_invitee_id, uid, 'channel_invite', row.id);
  end if;
  return row;
end;
$$;

-- MY TEAM invite: OrganizationMember + seat gate.
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
  used integer;
  already_paid boolean := false;
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
  used := public.organization_seats_used(p_workspace_id);
  lim := public.organization_max_seats(p_workspace_id);
  if p_invitee_id is not null then
    already_paid := exists (
      select 1 from public.workspace_members m
      where m.workspace_id = p_workspace_id
        and m.user_id = p_invitee_id
        and m.role in ('owner', 'member')
    );
  end if;
  if not already_paid and lim >= 0 and used >= lim then
    raise exception 'workspace_seat_limit'
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
  if coalesce(inv.kind, 'workspace') = 'channel' then
    if inv.channel_id is not null then
      insert into public.channel_members (channel_id, user_id, role)
      values (inv.channel_id, uid, 'guest')
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
  end if;
  if inv.workspace_id is null then
    raise exception 'invite_invalid';
  end if;
  insert into public.workspace_members (workspace_id, user_id, role)
  values (inv.workspace_id, uid, 'member')
  on conflict (workspace_id, user_id) do update
    set role = case
      when public.workspace_members.role = 'owner' then 'owner'
      else 'member'
    end;
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
    if coalesce(winv.kind, 'workspace') = 'channel' then
      if winv.channel_id is not null then
        insert into public.channel_members (channel_id, user_id, role)
        values (winv.channel_id, uid, 'guest')
        on conflict (channel_id, user_id) do nothing;
      end if;
    elsif winv.workspace_id is not null then
      insert into public.workspace_members (workspace_id, user_id, role)
      values (winv.workspace_id, uid, 'member')
      on conflict (workspace_id, user_id) do update
        set role = case
          when public.workspace_members.role = 'owner' then 'owner'
          else 'member'
        end;
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

grant execute on function public.organization_seats_used(uuid) to authenticated;
grant execute on function public.organization_max_seats(uuid) to authenticated;
grant execute on function public.create_channel_invite(uuid, text, uuid) to authenticated;
grant execute on function public.create_workspace_invite(uuid, text, uuid) to authenticated;
grant execute on function public.accept_workspace_invite(text) to authenticated;
grant execute on function public.redeem_access_key(text) to authenticated;

notify pgrst, 'reload schema';

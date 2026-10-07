-- DARKE v1 Phase 84 — Invite search, rate limits, pending invites, blocks
-- Run after phase83.sql.

drop function if exists public.create_channel_invite(uuid, text);
drop function if exists public.create_channel_invite(uuid, text, uuid);
drop function if exists public.create_workspace_invite(uuid, text);
drop function if exists public.create_workspace_invite(uuid, text, uuid);

alter table public.workspace_invites
  add column if not exists invitee_id uuid references public.profiles (id) on delete cascade;

alter table public.workspace_invites
  add column if not exists out_of_network boolean;

update public.workspace_invites
set out_of_network = true
where out_of_network is null;

alter table public.workspace_invites
  alter column out_of_network set default true;

alter table public.workspace_invites
  alter column out_of_network set not null;

create index if not exists workspace_invites_rate
  on public.workspace_invites (created_by, created_at desc)
  where out_of_network;

create table if not exists public.invite_blocks (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint invite_blocks_not_self check (blocker_id <> blocked_id)
);

create index if not exists invite_blocks_blocked
  on public.invite_blocks (blocked_id);

alter table public.invite_blocks enable row level security;

drop policy if exists "invite_blocks_select_own" on public.invite_blocks;
create policy "invite_blocks_select_own"
  on public.invite_blocks for select
  using (blocker_id = auth.uid() or blocked_id = auth.uid());

drop policy if exists "invite_blocks_insert_own" on public.invite_blocks;
create policy "invite_blocks_insert_own"
  on public.invite_blocks for insert
  with check (blocker_id = auth.uid() and blocker_id <> blocked_id);

drop policy if exists "invite_blocks_delete_own" on public.invite_blocks;
create policy "invite_blocks_delete_own"
  on public.invite_blocks for delete
  using (blocker_id = auth.uid());

grant select, insert, delete on table public.invite_blocks to authenticated;

create or replace function public.is_mutual_follow(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select a is not null and b is not null and a <> b and exists (
    select 1 from public.follows f1
    where f1.follower_id = a and f1.following_id = b
  ) and exists (
    select 1 from public.follows f2
    where f2.follower_id = b and f2.following_id = a
  );
$$;

alter table public.notifications
  add column if not exists invite_id uuid references public.workspace_invites (id) on delete cascade;

do $$
declare r record;
begin
  for r in
    select c.conname
    from pg_constraint c
    where c.conrelid = 'public.notifications'::regclass
      and c.contype = 'c'
      and (
        pg_get_constraintdef(c.oid) ilike '%type%'
        or pg_get_constraintdef(c.oid) ilike '%payload%'
      )
  loop
    execute format('alter table public.notifications drop constraint if exists %I', r.conname);
  end loop;
end $$;

alter table public.notifications
  add constraint notifications_type_check
  check (type in (
    'beep_comment', 'beep_reply', 'follow',
    'channel_invite', 'workspace_invite'
  ));

alter table public.notifications
  add constraint notifications_payload_check
  check (
    (type = 'follow' and beep_id is null and comment_id is null and invite_id is null)
    or (type in ('beep_comment', 'beep_reply') and beep_id is not null)
    or (
      type in ('channel_invite', 'workspace_invite')
      and invite_id is not null
      and beep_id is null
      and comment_id is null
    )
  );

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

create or replace function public.accept_pending_invite(p_invite_id uuid)
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
  where id = p_invite_id
  limit 1;
  if not found then
    raise exception 'invite_invalid';
  end if;
  if inv.invitee_id is distinct from uid then
    raise exception 'invite_invalid';
  end if;
  return public.accept_workspace_invite(inv.token);
end;
$$;

create or replace function public.decline_pending_invite(p_invite_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Not signed in';
  end if;
  delete from public.notifications
  where invite_id = p_invite_id and recipient_id = uid;
  update public.workspace_invites
  set accepted_at = now()
  where id = p_invite_id
    and invitee_id = uid
    and accepted_at is null;
end;
$$;

create or replace function public.block_inviter(p_actor_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Not signed in';
  end if;
  if p_actor_id is null or p_actor_id = uid then
    raise exception 'invite_self';
  end if;
  insert into public.invite_blocks (blocker_id, blocked_id)
  values (uid, p_actor_id)
  on conflict do nothing;
  delete from public.notifications n
  using public.workspace_invites i
  where n.invite_id = i.id
    and n.recipient_id = uid
    and i.created_by = p_actor_id;
  update public.workspace_invites
  set accepted_at = now()
  where invitee_id = uid
    and created_by = p_actor_id
    and accepted_at is null;
end;
$$;

grant execute on function public.is_mutual_follow(uuid, uuid) to authenticated;
grant execute on function public.create_channel_invite(uuid, text, uuid) to authenticated;
grant execute on function public.create_workspace_invite(uuid, text, uuid) to authenticated;
grant execute on function public.accept_pending_invite(uuid) to authenticated;
grant execute on function public.decline_pending_invite(uuid) to authenticated;
grant execute on function public.block_inviter(uuid) to authenticated;

notify pgrst, 'reload schema';

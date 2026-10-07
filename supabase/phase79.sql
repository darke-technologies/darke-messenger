-- DARKE v1 Phase 79 — Single workspace, seats, guests, channel visibility
-- Run after phase78.sql.

-- Always 1 owned workspace. Channels unlimited.
create or replace function public.workspace_active_limit_for(uid uuid)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
begin
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
  return -1;
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

alter table public.workspace_members
  drop constraint if exists workspace_members_role_ok;
alter table public.workspace_members
  add constraint workspace_members_role_ok
  check (role in ('owner', 'member', 'guest'));

alter table public.workspace_channels
  add column if not exists visibility text;
update public.workspace_channels
set visibility = 'public'
where visibility is null;
alter table public.workspace_channels
  alter column visibility set default 'public';
alter table public.workspace_channels
  alter column visibility set not null;
alter table public.workspace_channels
  drop constraint if exists workspace_channels_visibility_ok;
alter table public.workspace_channels
  add constraint workspace_channels_visibility_ok
  check (visibility in ('public', 'private'));

alter table public.workspace_channels
  add column if not exists onboarding_complete boolean;
update public.workspace_channels
set onboarding_complete = true
where onboarding_complete is null;
alter table public.workspace_channels
  alter column onboarding_complete set default false;
alter table public.workspace_channels
  alter column onboarding_complete set not null;

create table if not exists public.channel_members (
  channel_id uuid not null references public.workspace_channels (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'member',
  created_at timestamptz not null default now(),
  primary key (channel_id, user_id),
  constraint channel_members_role_ok check (role in ('owner', 'member', 'guest'))
);

create index if not exists channel_members_user
  on public.channel_members (user_id);

alter table public.workspace_invites
  add column if not exists kind text;
update public.workspace_invites
set kind = 'workspace'
where kind is null;
alter table public.workspace_invites
  alter column kind set default 'workspace';
alter table public.workspace_invites
  drop constraint if exists workspace_invites_kind_ok;
alter table public.workspace_invites
  add constraint workspace_invites_kind_ok
  check (kind in ('workspace', 'channel'));

alter table public.workspace_invites
  add column if not exists channel_id uuid references public.workspace_channels (id) on delete cascade;

create or replace function public.channels_enforce_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.name := btrim(new.name);
  new.slug := lower(btrim(new.slug));
  if new.visibility is null or new.visibility = '' then
    new.visibility := 'public';
  end if;
  return new;
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

create or replace function public.is_workspace_member(ws uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.workspaces w
    where w.id = ws and w.owner_id = auth.uid()
  ) or exists (
    select 1 from public.workspace_members m
    where m.workspace_id = ws and m.user_id = auth.uid()
  );
$$;

create or replace function public.is_workspace_staff(ws uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.workspaces w
    where w.id = ws and w.owner_id = auth.uid()
  ) or exists (
    select 1 from public.workspace_members m
    where m.workspace_id = ws
      and m.user_id = auth.uid()
      and m.role in ('owner', 'member')
  );
$$;

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
  select exists (
    select 1
    from public.workspace_channels c
    where c.id = ch
      and (
        public.is_workspace_staff(c.workspace_id)
        or public.is_channel_member(ch)
      )
  );
$$;

drop policy if exists "workspace_channels_select" on public.workspace_channels;
create policy "workspace_channels_select"
  on public.workspace_channels for select
  using (
    public.is_workspace_staff(workspace_id)
    or public.is_channel_member(id)
  );

alter table public.channel_members enable row level security;

drop policy if exists "channel_members_select" on public.channel_members;
create policy "channel_members_select"
  on public.channel_members for select
  using (
    user_id = auth.uid()
    or public.can_select_channel(channel_id)
  );

drop policy if exists "channel_members_insert" on public.channel_members;
create policy "channel_members_insert"
  on public.channel_members for insert
  with check (
    exists (
      select 1 from public.workspace_channels c
      where c.id = channel_id
        and public.is_workspace_staff(c.workspace_id)
    )
  );

grant select, insert, delete on table public.channel_members to authenticated;
grant execute on function public.is_workspace_staff(uuid) to authenticated;
grant execute on function public.is_channel_member(uuid) to authenticated;
grant execute on function public.can_select_channel(uuid) to authenticated;
grant execute on function public.workspace_seat_limit_for(uuid) to authenticated;

create or replace function public.create_workspace_invite(p_workspace_id uuid, p_email text default null)
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
  mail := nullif(lower(btrim(coalesce(p_email, ''))), '');
  insert into public.workspace_invites (workspace_id, token, email, created_by, kind)
  values (p_workspace_id, replace(gen_random_uuid()::text, '-', ''), mail, uid, 'workspace')
  returning * into row;
  return row;
end;
$$;

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
  owner uuid;
  lim integer;
  mail text;
  row public.workspace_invites;
begin
  if uid is null then
    raise exception 'Not signed in';
  end if;
  select c.workspace_id into ws
  from public.workspace_channels c
  where c.id = p_channel_id;
  if ws is null then
    raise exception 'channel_missing';
  end if;
  select w.owner_id into owner from public.workspaces w where w.id = ws;
  if owner is null or not public.is_workspace_staff(ws) then
    raise exception 'Not workspace staff';
  end if;
  lim := public.workspace_seat_limit_for(owner);
  if lim = 1 then
    raise exception 'workspace_invite_forbidden'
      using errcode = 'P0001';
  end if;
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

create or replace function public.accept_workspace_invite(p_token text)
returns public.workspace_members
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  inv public.workspace_invites;
  row public.workspace_members;
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
  if inv.accepted_at is not null then
    select * into row
    from public.workspace_members
    where workspace_id = inv.workspace_id and user_id = uid;
    if found then
      return row;
    end if;
  end if;
  insert into public.workspace_members (workspace_id, user_id, role)
  values (inv.workspace_id, uid, member_role)
  on conflict (workspace_id, user_id) do update
    set role = case
      when public.workspace_members.role = 'owner' then 'owner'
      when public.workspace_members.role = 'member' then 'member'
      else excluded.role
    end
  returning * into row;
  if inv.channel_id is not null then
    insert into public.channel_members (channel_id, user_id, role)
    values (inv.channel_id, uid, 'guest')
    on conflict (channel_id, user_id) do nothing;
  end if;
  update public.workspace_invites
  set accepted_at = now()
  where id = inv.id and accepted_at is null;
  return row;
end;
$$;

grant execute on function public.create_channel_invite(uuid, text) to authenticated;

notify pgrst, 'reload schema';

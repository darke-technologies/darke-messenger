-- DARKE v1 Phase 75 — Channels, members, invites, workspace avatar
-- Run in the Supabase SQL editor after phase74.sql.

alter table public.workspaces
  add column if not exists avatar_url text;

alter table public.workspaces
  add column if not exists website_url text;

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

create table if not exists public.workspace_channels (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null,
  slug text not null,
  description text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint workspace_channels_name_len check (
    char_length(btrim(name)) between 1 and 40
  ),
  constraint workspace_channels_slug_ok check (
    slug ~ '^[a-z0-9][a-z0-9-]{0,39}$'
  ),
  constraint workspace_channels_slug_unique unique (workspace_id, slug)
);

create index if not exists workspace_channels_ws
  on public.workspace_channels (workspace_id, created_at asc);

create table if not exists public.workspace_members (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'member',
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id),
  constraint workspace_members_role_ok check (role in ('owner', 'member'))
);

create index if not exists workspace_members_user
  on public.workspace_members (user_id);

create table if not exists public.workspace_invites (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  token text not null unique,
  email text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  constraint workspace_invites_email_len check (
    email is null or char_length(btrim(email)) between 3 and 320
  )
);

create index if not exists workspace_invites_ws
  on public.workspace_invites (workspace_id, created_at desc);

alter table public.beeps
  add column if not exists channel_id uuid references public.workspace_channels (id) on delete set null;

create index if not exists beeps_channel
  on public.beeps (channel_id, created_at desc)
  where channel_id is not null;

create or replace function public.is_workspace_member(ws uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.workspace_members m
    where m.workspace_id = ws and m.user_id = auth.uid()
  ) or exists (
    select 1 from public.workspaces w
    where w.id = ws and w.owner_id = auth.uid()
  );
$$;

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
  new.name := btrim(new.name);
  new.slug := lower(btrim(new.slug));
  select w.owner_id into owner from public.workspaces w where w.id = new.workspace_id;
  if owner is null then
    raise exception 'workspace_missing';
  end if;
  lim := public.workspace_channel_limit_for(owner);
  if lim < 0 then
    return new;
  end if;
  select count(*)::integer into n
  from public.workspace_channels c
  where c.workspace_id = new.workspace_id
    and c.id is distinct from new.id;
  if n >= lim then
    raise exception 'workspace_channel_limit'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists channels_enforce_limit on public.workspace_channels;
create trigger channels_enforce_limit
before insert on public.workspace_channels
for each row
execute procedure public.channels_enforce_limit();

create or replace function public.provision_workspace_defaults()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.workspace_members (workspace_id, user_id, role)
  values (new.id, new.owner_id, 'owner')
  on conflict (workspace_id, user_id) do nothing;
  insert into public.workspace_channels (workspace_id, name, slug, description, created_by)
  values (new.id, 'Channel 1', 'channel-1', null, new.owner_id)
  on conflict (workspace_id, slug) do nothing;
  return new;
end;
$$;

drop trigger if exists workspaces_provision_defaults on public.workspaces;
create trigger workspaces_provision_defaults
after insert on public.workspaces
for each row
execute procedure public.provision_workspace_defaults();

insert into public.workspace_members (workspace_id, user_id, role)
select w.id, w.owner_id, 'owner'
from public.workspaces w
on conflict (workspace_id, user_id) do nothing;

insert into public.workspace_channels (workspace_id, name, slug, description, created_by)
select w.id, 'Channel 1', 'channel-1', null, w.owner_id
from public.workspaces w
on conflict (workspace_id, slug) do nothing;

update public.workspace_channels
set name = 'Channel 1',
    slug = 'channel-1'
where slug = 'general'
  and not exists (
    select 1 from public.workspace_channels x
    where x.workspace_id = workspace_channels.workspace_id
      and x.slug = 'channel-1'
  );

create or replace function public.create_workspace_invite(p_workspace_id uuid, p_email text default null)
returns public.workspace_invites
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  mail text;
  row public.workspace_invites;
begin
  if uid is null then
    raise exception 'Not signed in';
  end if;
  if not exists (
    select 1 from public.workspaces w
    where w.id = p_workspace_id and w.owner_id = uid
  ) then
    raise exception 'Not workspace owner';
  end if;
  mail := nullif(lower(btrim(coalesce(p_email, ''))), '');
  insert into public.workspace_invites (workspace_id, token, email, created_by)
  values (p_workspace_id, replace(gen_random_uuid()::text, '-', ''), mail, uid)
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
  if inv.accepted_at is not null then
    select * into row
    from public.workspace_members
    where workspace_id = inv.workspace_id and user_id = uid;
    if found then
      return row;
    end if;
  end if;
  insert into public.workspace_members (workspace_id, user_id, role)
  values (inv.workspace_id, uid, 'member')
  on conflict (workspace_id, user_id) do update
    set role = public.workspace_members.role
  returning * into row;
  update public.workspace_invites
  set accepted_at = now()
  where id = inv.id and accepted_at is null;
  return row;
end;
$$;

grant execute on function public.is_workspace_member(uuid) to authenticated;
grant execute on function public.create_workspace_invite(uuid, text) to authenticated;
grant execute on function public.accept_workspace_invite(text) to authenticated;
grant execute on function public.workspace_channel_limit_for(uuid) to authenticated;

drop policy if exists "workspaces_select_own" on public.workspaces;
create policy "workspaces_select_own"
  on public.workspaces for select
  using (public.is_workspace_member(id));

alter table public.workspace_channels enable row level security;
alter table public.workspace_members enable row level security;
alter table public.workspace_invites enable row level security;

drop policy if exists "workspace_channels_select" on public.workspace_channels;
create policy "workspace_channels_select"
  on public.workspace_channels for select
  using (public.is_workspace_member(workspace_id));

drop policy if exists "workspace_channels_insert" on public.workspace_channels;
create policy "workspace_channels_insert"
  on public.workspace_channels for insert
  with check (
    exists (
      select 1 from public.workspaces w
      where w.id = workspace_id
        and w.owner_id = auth.uid()
        and w.status = 'active'
    )
  );

drop policy if exists "workspace_channels_update" on public.workspace_channels;
create policy "workspace_channels_update"
  on public.workspace_channels for update
  using (
    exists (
      select 1 from public.workspaces w
      where w.id = workspace_id and w.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.workspaces w
      where w.id = workspace_id and w.owner_id = auth.uid()
    )
  );

drop policy if exists "workspace_channels_delete" on public.workspace_channels;
create policy "workspace_channels_delete"
  on public.workspace_channels for delete
  using (
    exists (
      select 1 from public.workspaces w
      where w.id = workspace_id and w.owner_id = auth.uid()
    )
  );

drop policy if exists "workspace_members_select" on public.workspace_members;
create policy "workspace_members_select"
  on public.workspace_members for select
  using (public.is_workspace_member(workspace_id));

drop policy if exists "workspace_members_insert" on public.workspace_members;
create policy "workspace_members_insert"
  on public.workspace_members for insert
  with check (
    exists (
      select 1 from public.workspaces w
      where w.id = workspace_id and w.owner_id = auth.uid()
    )
  );

drop policy if exists "workspace_invites_select" on public.workspace_invites;
create policy "workspace_invites_select"
  on public.workspace_invites for select
  using (
    exists (
      select 1 from public.workspaces w
      where w.id = workspace_id and w.owner_id = auth.uid()
    )
  );

drop policy if exists "workspace_invites_insert" on public.workspace_invites;
create policy "workspace_invites_insert"
  on public.workspace_invites for insert
  with check (
    created_by = auth.uid()
    and exists (
      select 1 from public.workspaces w
      where w.id = workspace_id and w.owner_id = auth.uid()
    )
  );

grant select, insert, update, delete on table public.workspace_channels to authenticated;
grant select, insert on table public.workspace_members to authenticated;
grant select, insert, update on table public.workspace_invites to authenticated;

drop policy if exists "beeps_insert_own" on public.beeps;
create policy "beeps_insert_own"
  on public.beeps for insert
  with check (
    auth.uid() = user_id
    and (
      workspace_id is null
      or (
        public.is_workspace_member(workspace_id)
        and exists (
          select 1 from public.workspaces w
          where w.id = workspace_id and w.status = 'active'
        )
        and (
          channel_id is null
          or exists (
            select 1 from public.workspace_channels c
            where c.id = channel_id and c.workspace_id = workspace_id
          )
        )
      )
    )
  );

notify pgrst, 'reload schema';

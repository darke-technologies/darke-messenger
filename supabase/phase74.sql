-- DARKE v1 Phase 74 — Workspaces (owner, active/archived, default seed)
-- Run in the Supabase SQL editor after phase73.sql.
-- No member invites in this phase.

alter table public.profiles
  drop constraint if exists profiles_subscription_status_ok;
alter table public.profiles
  add constraint profiles_subscription_status_ok
  check (subscription_status in ('free', 'pro', 'elite'));

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  name text not null default 'Workspace 1',
  status text not null default 'active',
  created_at timestamptz not null default now(),
  constraint workspaces_status_ok check (status in ('active', 'archived')),
  constraint workspaces_name_len check (
    char_length(btrim(name)) between 1 and 80
  )
);

create index if not exists workspaces_owner_created
  on public.workspaces (owner_id, created_at asc);

create index if not exists workspaces_owner_status
  on public.workspaces (owner_id, status);

alter table public.beeps
  add column if not exists workspace_id uuid references public.workspaces (id) on delete set null;

create index if not exists beeps_workspace
  on public.beeps (workspace_id, created_at desc)
  where workspace_id is not null;

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
  if st = 'elite' then
    return -1;
  end if;
  if st = 'pro' or pro then
    return 3;
  end if;
  return 1;
end;
$$;

create or replace function public.workspaces_enforce_active_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  lim integer;
  n integer;
begin
  new.name := btrim(new.name);
  if new.name = '' then
    new.name := 'Workspace 1';
  end if;
  if new.status is distinct from 'active' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status = 'active' then
    return new;
  end if;
  lim := public.workspace_active_limit_for(new.owner_id);
  if lim < 0 then
    return new;
  end if;
  select count(*)::integer into n
  from public.workspaces w
  where w.owner_id = new.owner_id
    and w.status = 'active'
    and w.id is distinct from new.id;
  if n >= lim then
    raise exception 'workspace_active_limit'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists workspaces_enforce_active_limit on public.workspaces;
create trigger workspaces_enforce_active_limit
before insert or update on public.workspaces
for each row
execute procedure public.workspaces_enforce_active_limit();

create or replace function public.provision_default_workspace()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.workspaces (owner_id, name, status)
  select new.id, 'Workspace 1', 'active'
  where not exists (
    select 1 from public.workspaces w where w.owner_id = new.id
  );
  return new;
end;
$$;

drop trigger if exists profiles_provision_workspace on public.profiles;
create trigger profiles_provision_workspace
after insert on public.profiles
for each row
execute procedure public.provision_default_workspace();

insert into public.workspaces (owner_id, name, status)
select p.id, 'Workspace 1', 'active'
from public.profiles p
where not exists (
  select 1 from public.workspaces w where w.owner_id = p.id
);

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
  insert into public.workspaces (owner_id, name, status)
  values (uid, 'Workspace 1', 'active')
  returning * into row;
  return row;
end;
$$;

grant execute on function public.ensure_default_workspace() to authenticated;
grant execute on function public.workspace_active_limit_for(uuid) to authenticated;

alter table public.workspaces enable row level security;

drop policy if exists "workspaces_select_own" on public.workspaces;
create policy "workspaces_select_own"
  on public.workspaces for select
  using (auth.uid() = owner_id);

drop policy if exists "workspaces_insert_own" on public.workspaces;
create policy "workspaces_insert_own"
  on public.workspaces for insert
  with check (auth.uid() = owner_id);

drop policy if exists "workspaces_update_own" on public.workspaces;
create policy "workspaces_update_own"
  on public.workspaces for update
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

grant select, insert, update on table public.workspaces to authenticated;

drop policy if exists "beeps_insert_own" on public.beeps;
create policy "beeps_insert_own"
  on public.beeps for insert
  with check (
    auth.uid() = user_id
    and (
      workspace_id is null
      or exists (
        select 1
        from public.workspaces w
        where w.id = workspace_id
          and w.owner_id = auth.uid()
          and w.status = 'active'
      )
    )
  );

notify pgrst, 'reload schema';

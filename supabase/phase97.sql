-- DARKE v1 Phase 97 — Add missing channel columns, then provision without ON CONFLICT
-- Run after phase96.sql. Safe to re-run.
-- Fixes signup 42703: column "slug_hash" of relation "workspace_channels" does not exist.

alter table public.workspace_channels
  add column if not exists slug_hash text;

alter table public.workspace_channels
  add column if not exists visibility text;

alter table public.workspace_channels
  add column if not exists onboarding_complete boolean;

update public.workspace_channels
set slug_hash = replace(id::text, '-', '')
where slug_hash is null or btrim(slug_hash) = '';

update public.workspace_channels
set visibility = 'private'
where visibility is null or btrim(visibility) = '';

update public.workspace_channels
set onboarding_complete = coalesce(onboarding_complete, false)
where onboarding_complete is null;

alter table public.workspace_channels
  alter column visibility set default 'private';

alter table public.workspace_channels
  alter column onboarding_complete set default false;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.workspace_channels'::regclass
      and conname = 'workspace_channels_visibility_ok'
  ) then
    alter table public.workspace_channels
      add constraint workspace_channels_visibility_ok
      check (visibility in ('public', 'private'));
  end if;
end $$;

create unique index if not exists workspace_channels_slug_hash
  on public.workspace_channels (slug_hash);

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
  new.slug := lower(btrim(coalesce(new.slug, '')));
  if new.slug = '' then
    new.slug := 'channel';
  end if;
  new.slug_hash := replace(new.id::text, '-', '');
  if new.visibility is null or new.visibility = '' then
    new.visibility := 'private';
  end if;
  if new.onboarding_complete is null then
    new.onboarding_complete := false;
  end if;
  if new.created_by is null then
    new.created_by := coalesce(auth.uid(), new.created_by);
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

create or replace function public.provision_workspace_defaults()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.workspace_members (workspace_id, user_id, role)
  select new.id, new.owner_id, 'owner'
  where new.owner_id is not null
    and not exists (
      select 1
      from public.workspace_members m
      where m.workspace_id = new.id
        and m.user_id = new.owner_id
    );

  insert into public.workspace_channels (
    workspace_id,
    name,
    slug,
    description,
    created_by
  )
  select
    new.id,
    'general',
    'general',
    null,
    new.owner_id
  where not exists (
    select 1
    from public.workspace_channels c
    where c.workspace_id = new.id
  );

  return new;
end;
$$;

drop trigger if exists workspaces_provision_defaults on public.workspaces;
create trigger workspaces_provision_defaults
after insert on public.workspaces
for each row
execute procedure public.provision_workspace_defaults();

do $$
begin
  if not exists (
    select 1
    from public.workspace_channels
    where slug_hash is null or btrim(slug_hash) = ''
  ) then
    begin
      alter table public.workspace_channels
        alter column slug_hash set not null;
    exception
      when others then
        null;
    end;
  end if;
end $$;

notify pgrst, 'reload schema';

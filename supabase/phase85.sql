-- DARKE v1 Phase 85 — Channel identity: UUID PK, non-unique names, slug_hash
-- Run after phase84.sql.
--
-- workspace_channels.id is already uuid primary key.
-- name must not be unique so many users (and the same workspace) can use
-- #general, #support, #dev. Lookups use id or slug_hash, never name.

alter table public.workspace_channels
  drop constraint if exists workspace_channels_slug_unique;

alter table public.workspace_channels
  drop constraint if exists workspace_channels_name_key;

alter table public.workspace_channels
  drop constraint if exists workspace_channels_name_unique;

drop index if exists workspace_channels_slug_unique;
drop index if exists workspace_channels_ws_slug;
drop index if exists workspace_channels_solo_slug;
drop index if exists workspace_channels_name_key;
drop index if exists workspace_channels_name_unique;

alter table public.workspace_channels
  add column if not exists slug_hash text;

update public.workspace_channels
set slug_hash = replace(id::text, '-', '')
where slug_hash is null or btrim(slug_hash) = '';

alter table public.workspace_channels
  alter column slug_hash set not null;

create unique index if not exists workspace_channels_slug_hash
  on public.workspace_channels (slug_hash);

create index if not exists workspace_channels_slug
  on public.workspace_channels (slug);

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
  if new.id is null then
    new.id := gen_random_uuid();
  end if;
  new.name := btrim(new.name);
  new.slug := lower(btrim(new.slug));
  new.slug_hash := replace(new.id::text, '-', '');
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

notify pgrst, 'reload schema';

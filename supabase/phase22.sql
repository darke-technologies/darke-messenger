-- DARKE v1 Phase 22 — Login slug stays stable when public username changes
-- Run in the Supabase SQL editor after phase1.sql.

alter table public.profiles
  add column if not exists auth_slug text;

update public.profiles
set auth_slug = username
where auth_slug is null;

alter table public.profiles
  alter column auth_slug set not null;

alter table public.profiles
  drop constraint if exists profiles_auth_slug_format;
alter table public.profiles
  add constraint profiles_auth_slug_format
  check (
    auth_slug = lower(auth_slug)
    and auth_slug ~ '^[a-z0-9]+$'
  );

create unique index if not exists profiles_auth_slug_key
  on public.profiles (auth_slug);

create or replace function public.profiles_freeze_auth_slug()
returns trigger
language plpgsql
as $$
begin
  new.auth_slug := old.auth_slug;
  return new;
end;
$$;

drop trigger if exists profiles_freeze_auth_slug on public.profiles;
create trigger profiles_freeze_auth_slug
  before update on public.profiles
  for each row
  execute procedure public.profiles_freeze_auth_slug();

create or replace function public.username_available(name text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  slug text;
begin
  slug := lower(regexp_replace(coalesce(name, ''), '[^a-zA-Z0-9]', '', 'g'));
  if slug = '' then
    return false;
  end if;
  return not exists (
    select 1
    from public.profiles p
    where p.username = slug
      and p.id is distinct from auth.uid()
  );
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  slug text;
begin
  slug := lower(coalesce(new.raw_user_meta_data->>'username', ''));
  slug := regexp_replace(slug, '[^a-z0-9]', '', 'g');
  if slug = '' then
    return new;
  end if;
  insert into public.profiles (id, username, auth_slug)
  values (new.id, slug, slug)
  on conflict (id) do nothing;
  return new;
end;
$$;

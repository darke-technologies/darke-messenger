-- DARKE v1 Phase 80 — Drop workspace archive; unique workspace URL slug
-- Run after phase79.sql.

update public.workspaces
set status = 'active'
where status is distinct from 'active';

alter table public.workspaces
  drop constraint if exists workspaces_status_ok;
alter table public.workspaces
  add constraint workspaces_status_ok
  check (status = 'active');

create or replace function public.workspace_normalize_slug(raw text)
returns text
language plpgsql
immutable
as $$
declare
  s text;
begin
  s := lower(btrim(coalesce(raw, '')));
  s := regexp_replace(s, '[^a-z0-9]+', '-', 'g');
  s := regexp_replace(s, '-+', '-', 'g');
  s := regexp_replace(s, '^-+|-+$', '', 'g');
  s := left(s, 40);
  if s = '' then
    return null;
  end if;
  return s;
end;
$$;

create or replace function public.workspace_slug_is_reserved(s text)
returns boolean
language sql
immutable
as $$
  select s in (
    'admin', 'api', 'app', 'apps', 'www', 'mail', 'ftp', 'smtp', 'imap',
    'blog', 'support', 'help', 'docs', 'status', 'news', 'cdn', 'static',
    'assets', 'auth', 'login', 'logout', 'signup', 'signin', 'register',
    'account', 'accounts', 'billing', 'pay', 'checkout', 'stripe',
    'webhook', 'webhooks', 'graphql', 'rest', 'v1', 'v2',
    'darke', 'workspace', 'workspaces', 'channel', 'channels',
    'me', 'user', 'users', 'profile', 'profiles', 'people',
    'home', 'about', 'legal', 'privacy', 'terms', 'settings',
    'movies', 'games', 'books', 'tank', 'invite', 'invites', 'join',
    'new', 'create', 'edit', 'delete', 'system', 'root', 'localhost',
    'null', 'undefined', 'test', 'staging', 'prod', 'production', 'beta',
    'alpha', 'dashboard', 'console', 'staff', 'owner', 'guest', 'members',
    'files', 'schedule', 'tasks', 'notifications', 'feed', 'following',
    'bookmarks', 'search', 'www-darke', 'darke-ai'
  );
$$;

create or replace function public.workspace_unique_slug(base text, exclude_id uuid default null)
returns text
language plpgsql
as $$
declare
  stem text := coalesce(public.workspace_normalize_slug(base), 'workspace');
  candidate text;
  n integer := 1;
begin
  if public.workspace_slug_is_reserved(stem) then
    stem := stem || '-ws';
  end if;
  candidate := stem;
  loop
    if not exists (
      select 1 from public.workspaces w
      where w.slug = candidate
        and w.id is distinct from exclude_id
    ) then
      return candidate;
    end if;
    n := n + 1;
    candidate := left(stem, greatest(1, 40 - char_length(n::text) - 1)) || '-' || n::text;
  end loop;
end;
$$;

alter table public.workspaces
  add column if not exists slug text;

do $$
declare
  r record;
begin
  for r in
    select id, name
    from public.workspaces
    where slug is null or btrim(slug) = ''
    order by created_at asc
  loop
    update public.workspaces
    set slug = public.workspace_unique_slug(coalesce(nullif(r.name, ''), 'workspace'), r.id)
    where id = r.id;
  end loop;
end
$$;

alter table public.workspaces
  alter column slug set not null;

drop index if exists workspaces_slug_unique;
create unique index if not exists workspaces_slug_unique
  on public.workspaces (slug);

alter table public.workspaces
  drop constraint if exists workspaces_slug_format;
alter table public.workspaces
  add constraint workspaces_slug_format
  check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 1 and 40);

create or replace function public.workspaces_enforce_slug()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  s text;
begin
  s := public.workspace_normalize_slug(new.slug);
  if s is null then
    s := public.workspace_unique_slug(coalesce(nullif(new.name, ''), 'workspace'), new.id);
  elsif public.workspace_slug_is_reserved(s) then
    raise exception 'workspace_slug_reserved'
      using errcode = 'P0001';
  elsif exists (
    select 1 from public.workspaces w
    where w.slug = s and w.id is distinct from new.id
  ) then
    raise exception 'workspace_slug_taken'
      using errcode = 'P0001';
  end if;
  new.slug := s;
  new.status := 'active';
  return new;
end;
$$;

drop trigger if exists workspaces_enforce_slug on public.workspaces;
create trigger workspaces_enforce_slug
before insert or update on public.workspaces
for each row
execute procedure public.workspaces_enforce_slug();

create or replace function public.workspace_slug_check(
  p_slug text,
  p_workspace_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  s text := public.workspace_normalize_slug(p_slug);
begin
  if s is null then
    return jsonb_build_object('ok', false, 'reason', 'invalid', 'slug', null);
  end if;
  if public.workspace_slug_is_reserved(s) then
    return jsonb_build_object('ok', false, 'reason', 'reserved', 'slug', s);
  end if;
  if exists (
    select 1 from public.workspaces w
    where w.slug = s and w.id is distinct from p_workspace_id
  ) then
    return jsonb_build_object('ok', false, 'reason', 'taken', 'slug', s);
  end if;
  return jsonb_build_object('ok', true, 'reason', null, 'slug', s);
end;
$$;

create or replace function public.provision_default_workspace()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.workspaces (owner_id, name, status, slug)
  select
    new.id,
    'Workspace 1',
    'active',
    public.workspace_unique_slug(coalesce(nullif(new.username, ''), 'workspace'))
  where not exists (
    select 1 from public.workspaces w where w.owner_id = new.id
  );
  return new;
end;
$$;

create or replace function public.ensure_default_workspace()
returns public.workspaces
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  uname text;
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
    if row.status is distinct from 'active' then
      update public.workspaces set status = 'active' where id = row.id
      returning * into row;
    end if;
    return row;
  end if;
  select username into uname from public.profiles where id = uid;
  insert into public.workspaces (owner_id, name, status, slug)
  values (
    uid,
    'Workspace 1',
    'active',
    public.workspace_unique_slug(coalesce(nullif(uname, ''), 'workspace'))
  )
  returning * into row;
  return row;
end;
$$;

grant execute on function public.workspace_normalize_slug(text) to authenticated;
grant execute on function public.workspace_slug_is_reserved(text) to authenticated;
grant execute on function public.workspace_slug_check(text, uuid) to authenticated;

notify pgrst, 'reload schema';

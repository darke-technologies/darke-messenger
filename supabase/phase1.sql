-- DARKE v1 Phase 1
-- Run in the Supabase SQL editor.

create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  username text not null unique,
  created_at timestamptz default now(),
  constraint profiles_username_slug check (
    username = lower(username)
    and username ~ '^[a-z0-9]+$'
  )
);

grant usage on schema public to anon, authenticated;

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_all" on public.profiles;
create policy "profiles_select_all"
  on public.profiles
  for select
  using (true);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
  on public.profiles
  for insert
  with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles
  for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

drop policy if exists "profiles_delete_own" on public.profiles;
create policy "profiles_delete_own"
  on public.profiles
  for delete
  using (auth.uid() = id);

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
    select 1 from public.profiles p where p.username = slug
  );
end;
$$;

revoke all on function public.username_available(text) from public;
grant execute on function public.username_available(text) to anon, authenticated;

grant select on table public.profiles to anon, authenticated;
grant insert, update, delete on table public.profiles to authenticated;

-- Auto-create profiles from Auth signup metadata (username).
-- App still inserts explicitly; this is the DB safety net so Room never sees "no profile".
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
  insert into public.profiles (id, username)
  values (new.id, slug)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

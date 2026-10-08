-- DARKE v1 Phase 103 — Signal Protocol directory (libsignal)
-- Run after phase102.sql. Safe to re-run.
-- Additive only. Private identity material stays on-device (IndexedDB).
-- Public identity + signed prekey live in public.users; one-time prekeys in public.prekeys.

create table if not exists public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique,
  identity_key text not null,
  registration_id integer not null,
  signed_prekey_id integer not null,
  signed_prekey text not null,
  signed_prekey_sig text not null,
  updated_at timestamptz not null default now(),
  constraint users_username_slug check (
    username = lower(username)
    and username ~ '^[a-z0-9]+$'
  )
);

create table if not exists public.prekeys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  key_id integer not null,
  public_key text not null,
  used boolean not null default false,
  created_at timestamptz not null default now(),
  constraint prekeys_user_key unique (user_id, key_id)
);

create index if not exists prekeys_user_unused on public.prekeys (user_id) where used = false;
create index if not exists users_username on public.users (username);

alter table public.users enable row level security;
alter table public.prekeys enable row level security;

drop policy if exists "users_select_all" on public.users;
create policy "users_select_all"
  on public.users for select
  using (true);

drop policy if exists "users_write_own" on public.users;
create policy "users_write_own"
  on public.users for insert
  with check (auth.uid() = id);

drop policy if exists "users_update_own" on public.users;
create policy "users_update_own"
  on public.users for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

drop policy if exists "prekeys_select_unused_or_own" on public.prekeys;
create policy "prekeys_select_unused_or_own"
  on public.prekeys for select
  using (used = false or user_id = auth.uid());

drop policy if exists "prekeys_insert_own" on public.prekeys;
create policy "prekeys_insert_own"
  on public.prekeys for insert
  with check (user_id = auth.uid());

drop policy if exists "prekeys_update_own_or_claim" on public.prekeys;
create policy "prekeys_update_own_or_claim"
  on public.prekeys for update
  using (user_id = auth.uid() or used = false)
  with check (user_id = auth.uid() or used = true);

drop policy if exists "prekeys_delete_own" on public.prekeys;
create policy "prekeys_delete_own"
  on public.prekeys for delete
  using (user_id = auth.uid());

grant select, insert, update on table public.users to authenticated;
grant select on table public.users to anon;
grant select, insert, update, delete on table public.prekeys to authenticated;

create or replace function public.claim_prekey(p_username text)
returns table (key_id integer, public_key text)
language plpgsql
security definer
set search_path = public
as $$
declare
  target uuid;
  picked integer;
  picked_key text;
begin
  select u.id into target
  from public.users u
  where u.username = lower(regexp_replace(coalesce(p_username, ''), '[^a-zA-Z0-9]', '', 'g'))
  limit 1;
  if target is null then
    return;
  end if;

  select p.key_id, p.public_key
    into picked, picked_key
  from public.prekeys p
  where p.user_id = target and p.used = false
  order by p.key_id
  for update skip locked
  limit 1;

  if picked is null then
    return;
  end if;

  update public.prekeys
  set used = true
  where public.prekeys.user_id = target and public.prekeys.key_id = picked;

  key_id := picked;
  public_key := picked_key;
  return next;
end;
$$;

revoke all on function public.claim_prekey(text) from public;
grant execute on function public.claim_prekey(text) to authenticated, anon;

notify pgrst, 'reload schema';

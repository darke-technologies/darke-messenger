-- DARKE v1 Phase 5 — Apps directory listings + thumbs
-- Run after phase1.sql (profiles) in the Supabase SQL editor.
-- Fields: icon, name, description, url, live|in_development. No screenshots / pain point.

create table if not exists public.app_listings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users on delete cascade,
  username text not null,
  name text not null,
  description text not null,
  url text not null,
  status text not null check (status in ('live', 'in_development')),
  icon_data_url text not null,
  install_id text not null,
  thumbs_up integer not null default 0 check (thumbs_up >= 0),
  thumbs_down integer not null default 0 check (thumbs_down >= 0),
  created_at timestamptz not null default now(),
  constraint app_listings_one_per_owner unique (owner_id),
  constraint app_listings_name_len check (char_length(name) between 1 and 80),
  constraint app_listings_desc_len check (char_length(description) between 1 and 500),
  constraint app_listings_url_len check (char_length(url) between 1 and 500)
);

-- One listing per DARKE install (also enforced/backfilled in phase7.sql).
create unique index if not exists app_listings_one_per_install
  on public.app_listings (install_id);

-- If an earlier draft of phase5 added these columns, drop them.
alter table public.app_listings drop constraint if exists app_listings_pain_len;
alter table public.app_listings drop constraint if exists app_listings_screenshots_max;
alter table public.app_listings drop column if exists pain_point;
alter table public.app_listings drop column if exists screenshots;

create index if not exists app_listings_created_at
  on public.app_listings (created_at desc);

create table if not exists public.app_listing_votes (
  listing_id uuid not null references public.app_listings on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  vote smallint not null check (vote in (-1, 1)),
  primary key (listing_id, user_id)
);

alter table public.app_listings enable row level security;
alter table public.app_listing_votes enable row level security;

-- Public read for v1 (no approval queue).
drop policy if exists "app_listings_select_all" on public.app_listings;
create policy "app_listings_select_all"
  on public.app_listings
  for select
  using (true);

drop policy if exists "app_listings_insert_own" on public.app_listings;
create policy "app_listings_insert_own"
  on public.app_listings
  for insert
  with check (owner_id = auth.uid());

-- No update/delete in v1 (name frozen; no delete-and-replace).

drop policy if exists "app_listing_votes_select_all" on public.app_listing_votes;
create policy "app_listing_votes_select_all"
  on public.app_listing_votes
  for select
  using (true);

drop policy if exists "app_listing_votes_upsert_own" on public.app_listing_votes;
drop policy if exists "app_listing_votes_insert_own" on public.app_listing_votes;
create policy "app_listing_votes_insert_own"
  on public.app_listing_votes
  for insert
  with check (user_id = auth.uid());

drop policy if exists "app_listing_votes_update_own" on public.app_listing_votes;
create policy "app_listing_votes_update_own"
  on public.app_listing_votes
  for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create or replace function public.app_listings_set_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  slug text;
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  new.owner_id := auth.uid();
  select p.username into slug from public.profiles p where p.id = auth.uid();
  if slug is null or slug = '' then
    raise exception 'no profile';
  end if;
  new.username := slug;
  new.thumbs_up := 0;
  new.thumbs_down := 0;
  if new.install_id is null or btrim(new.install_id) = '' then
    raise exception 'install_id required';
  end if;
  return new;
end;
$$;

drop trigger if exists app_listings_set_owner on public.app_listings;
create trigger app_listings_set_owner
  before insert on public.app_listings
  for each row
  execute procedure public.app_listings_set_owner();

create or replace function public.app_listing_votes_refresh_counts()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  lid uuid;
begin
  lid := coalesce(new.listing_id, old.listing_id);
  update public.app_listings l
  set
    thumbs_up = (select count(*)::int from public.app_listing_votes v where v.listing_id = lid and v.vote = 1),
    thumbs_down = (select count(*)::int from public.app_listing_votes v where v.listing_id = lid and v.vote = -1)
  where l.id = lid;
  return coalesce(new, old);
end;
$$;

drop trigger if exists app_listing_votes_refresh on public.app_listing_votes;
create trigger app_listing_votes_refresh
  after insert or update or delete on public.app_listing_votes
  for each row
  execute procedure public.app_listing_votes_refresh_counts();

-- One vote per user per listing: upsert via RPC.
create or replace function public.vote_app_listing(p_listing_id uuid, p_vote smallint)
returns public.app_listings
language plpgsql
security definer
set search_path = public
as $$
declare
  row public.app_listings;
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  if p_vote is distinct from 1 and p_vote is distinct from -1 then
    raise exception 'invalid vote';
  end if;
  if not exists (select 1 from public.app_listings l where l.id = p_listing_id) then
    raise exception 'listing not found';
  end if;

  insert into public.app_listing_votes (listing_id, user_id, vote)
  values (p_listing_id, auth.uid(), p_vote)
  on conflict (listing_id, user_id)
  do update set vote = excluded.vote;

  select * into row from public.app_listings where id = p_listing_id;
  return row;
end;
$$;

revoke all on function public.vote_app_listing(uuid, smallint) from public;
grant execute on function public.vote_app_listing(uuid, smallint) to authenticated;

grant select on table public.app_listings to anon, authenticated;
grant insert on table public.app_listings to authenticated;
grant select on table public.app_listing_votes to anon, authenticated;
grant insert, update on table public.app_listing_votes to authenticated;

notify pgrst, 'reload schema';

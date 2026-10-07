-- DARKE v1 Phase 24 — DARKE TANK
-- Run in the Supabase SQL editor after phase22.sql (and Apps phases 5–16).
--
-- Safe to run without darkestaff: schema always applies. Seed is skipped
-- until a DARKE account username darkestaff exists, then run this file again.
-- Existing users are NOT given $100k — set tank_balances by hand.
-- New signups get tank_balances.balance = 100000 via handle_new_user.

-- ── Listing columns (TANK) ───────────────────────────────────────────────
alter table public.app_listings
  add column if not exists staff_curated boolean not null default false;

alter table public.app_listings
  add column if not exists raised_total integer not null default 0;

alter table public.app_listings
  add column if not exists backer_count integer not null default 0;

alter table public.app_listings
  drop constraint if exists app_listings_raised_nonneg;
alter table public.app_listings
  add constraint app_listings_raised_nonneg
  check (raised_total >= 0);

alter table public.app_listings
  drop constraint if exists app_listings_backers_nonneg;
alter table public.app_listings
  add constraint app_listings_backers_nonneg
  check (backer_count >= 0);

alter table public.app_listings
  drop constraint if exists app_listings_one_per_owner;

drop index if exists app_listings_one_per_owner;
create unique index if not exists app_listings_one_per_owner
  on public.app_listings (owner_id)
  where staff_curated = false;

drop index if exists app_listings_one_per_install;
create unique index if not exists app_listings_one_per_install
  on public.app_listings (install_id)
  where staff_curated = false;

create unique index if not exists app_listings_staff_name
  on public.app_listings (name)
  where staff_curated;

create index if not exists app_listings_staff_curated
  on public.app_listings (staff_curated, archived, name);

-- Freeze raised/backers/staff unless a TANK RPC is writing.
create or replace function public.app_listings_freeze_immutable()
returns trigger
language plpgsql
as $$
begin
  new.id := old.id;
  new.owner_id := old.owner_id;
  new.username := old.username;
  new.name := old.name;
  new.install_id := old.install_id;
  new.thumbs_up := old.thumbs_up;
  new.thumbs_down := old.thumbs_down;
  new.created_at := old.created_at;
  new.staff_curated := old.staff_curated;
  if current_setting('darke.tank_rpc', true) is distinct from '1' then
    new.raised_total := old.raised_total;
    new.backer_count := old.backer_count;
  end if;
  return new;
end;
$$;

drop trigger if exists app_listings_freeze_immutable on public.app_listings;
create trigger app_listings_freeze_immutable
  before update on public.app_listings
  for each row
  execute procedure public.app_listings_freeze_immutable();

-- SQL editor cannot set session_replication_role. Allow seed inserts when
-- auth.uid() is null but owner_id/username are already set (RLS still blocks clients).
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
    if new.owner_id is null then
      raise exception 'not signed in';
    end if;
    if new.username is null or btrim(new.username) = '' then
      raise exception 'no profile';
    end if;
  else
    new.owner_id := auth.uid();
    select p.username into slug from public.profiles p where p.id = auth.uid();
    if slug is null or slug = '' then
      raise exception 'no profile';
    end if;
    new.username := slug;
  end if;
  new.thumbs_up := 0;
  new.thumbs_down := 0;
  if new.install_id is null or btrim(new.install_id) = '' then
    raise exception 'install_id required';
  end if;
  return new;
end;
$$;

-- ── Balances (new users only via trigger; no backfill) ───────────────────
create table if not exists public.tank_balances (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  balance integer not null check (balance >= 0),
  updated_at timestamptz not null default now()
);

alter table public.tank_balances enable row level security;

drop policy if exists "tank_balances_select_own" on public.tank_balances;
create policy "tank_balances_select_own"
  on public.tank_balances
  for select
  to authenticated
  using (auth.uid() = user_id);

grant select on table public.tank_balances to authenticated;

-- ── Investments / outs ───────────────────────────────────────────────────
create table if not exists public.tank_investments (
  user_id uuid not null references public.profiles (id) on delete cascade,
  listing_id uuid not null references public.app_listings (id) on delete cascade,
  amount integer not null check (amount >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, listing_id)
);

create index if not exists tank_investments_listing
  on public.tank_investments (listing_id, created_at desc);

create table if not exists public.tank_outs (
  user_id uuid not null references public.profiles (id) on delete cascade,
  listing_id uuid not null references public.app_listings (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, listing_id)
);

alter table public.tank_investments enable row level security;
alter table public.tank_outs enable row level security;

drop policy if exists "tank_investments_select_own" on public.tank_investments;
create policy "tank_investments_select_own"
  on public.tank_investments
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "tank_outs_select_own" on public.tank_outs;
create policy "tank_outs_select_own"
  on public.tank_outs
  for select
  to authenticated
  using (auth.uid() = user_id);

-- Writes only through RPCs (security definer).
revoke insert, update, delete on table public.tank_investments from authenticated;
revoke insert, update, delete on table public.tank_outs from authenticated;
revoke insert, update, delete on table public.tank_balances from authenticated;

grant select on table public.tank_investments to authenticated;
grant select on table public.tank_outs to authenticated;

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
  insert into public.tank_balances (user_id, balance)
  values (new.id, 100000)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

create or replace function public.tank_invest(p_listing_id uuid, p_amount integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid;
  listing public.app_listings%rowtype;
  first_in boolean;
begin
  uid := auth.uid();
  if uid is null then
    raise exception 'not signed in';
  end if;
  if p_amount is null or p_amount < 10000 then
    raise exception 'invalid amount';
  end if;

  select * into listing
  from public.app_listings
  where id = p_listing_id
    and archived = false
    and staff_curated = true
  for update;
  if not found then
    raise exception 'listing not found';
  end if;
  if listing.owner_id = uid then
    raise exception 'own listing';
  end if;
  if exists (
    select 1 from public.tank_outs o
    where o.user_id = uid and o.listing_id = p_listing_id
  ) then
    raise exception 'already out';
  end if;

  perform 1 from public.tank_balances b where b.user_id = uid for update;
  if not found then
    raise exception 'no tank balance';
  end if;
  update public.tank_balances
  set balance = balance - p_amount, updated_at = now()
  where user_id = uid and balance >= p_amount;
  if not found then
    raise exception 'insufficient balance';
  end if;

  first_in := not exists (
    select 1 from public.tank_investments i
    where i.user_id = uid and i.listing_id = p_listing_id
  );

  insert into public.tank_investments (user_id, listing_id, amount)
  values (uid, p_listing_id, p_amount)
  on conflict (user_id, listing_id)
  do update set
    amount = public.tank_investments.amount + excluded.amount,
    updated_at = now();

  perform set_config('darke.tank_rpc', '1', true);
  update public.app_listings
  set
    raised_total = raised_total + p_amount,
    backer_count = backer_count + case when first_in then 1 else 0 end
  where id = p_listing_id;
end;
$$;

create or replace function public.tank_out(p_listing_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid;
begin
  uid := auth.uid();
  if uid is null then
    raise exception 'not signed in';
  end if;
  if not exists (
    select 1 from public.app_listings l
    where l.id = p_listing_id
      and l.archived = false
      and l.staff_curated = true
  ) then
    raise exception 'listing not found';
  end if;
  if exists (
    select 1 from public.app_listings l
    where l.id = p_listing_id and l.owner_id = uid
  ) then
    raise exception 'own listing';
  end if;
  if exists (
    select 1 from public.tank_investments i
    where i.user_id = uid and i.listing_id = p_listing_id
  ) then
    raise exception 'already in';
  end if;
  insert into public.tank_outs (user_id, listing_id)
  values (uid, p_listing_id)
  on conflict (user_id, listing_id) do nothing;
end;
$$;

create or replace function public.tank_recent_backers(p_listing_id uuid, lim integer default 8)
returns table(username text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  return query
  select p.username
  from public.tank_investments i
  join public.profiles p on p.id = i.user_id
  where i.listing_id = p_listing_id
  order by i.updated_at desc
  limit greatest(1, least(coalesce(lim, 8), 20));
end;
$$;

revoke all on function public.tank_invest(uuid, integer) from public;
revoke all on function public.tank_out(uuid) from public;
revoke all on function public.tank_recent_backers(uuid, integer) from public;
grant execute on function public.tank_invest(uuid, integer) to authenticated;
grant execute on function public.tank_out(uuid) to authenticated;
grant execute on function public.tank_recent_backers(uuid, integer) to authenticated;

-- ── Staff seed (idempotent by app name; skip if no darkestaff) ──────────
do $$
declare
  staff_id uuid;
  rec record;
begin
  select p.id into staff_id from public.profiles p where p.username = 'darkestaff';
  if staff_id is null then
    raise notice 'phase24 schema applied. Create DARKE username darkestaff, then run phase24_seed.sql.';
    return;
  end if;

  for rec in
    select * from (values
      ('WhatsApp', 'https://www.whatsapp.com', 'Messaging for friends, groups, and calls.'),
      ('Instagram', 'https://www.instagram.com', 'Photos, stories, and short video from people you follow.'),
      ('X', 'https://x.com', 'Public posts and conversations in real time.'),
      ('YouTube', 'https://www.youtube.com', 'Watch and upload video on the open web.'),
      ('TikTok', 'https://www.tiktok.com', 'Short-form video feed you can scroll for hours.'),
      ('Facebook', 'https://www.facebook.com', 'Friends, groups, and pages in one social graph.'),
      ('Gmail', 'https://mail.google.com', 'Email, search, and labels in the browser.'),
      ('Google Maps', 'https://maps.google.com', 'Maps, directions, and places worldwide.'),
      ('ChatGPT', 'https://chatgpt.com', 'General-purpose AI chat from OpenAI.'),
      ('Grok', 'https://grok.com', 'AI chat with a live view of the public web.'),
      ('Claude', 'https://claude.ai', 'AI assistant for writing, analysis, and code.'),
      ('Gemini', 'https://gemini.google.com', 'Google AI chat across text and images.'),
      ('Notion', 'https://www.notion.so', 'Docs, wikis, and project databases in one workspace.'),
      ('Figma', 'https://www.figma.com', 'Collaborative interface design in the browser.'),
      ('Slack', 'https://slack.com', 'Team chat, channels, and file threads.'),
      ('Discord', 'https://discord.com', 'Voice, video, and text communities.'),
      ('Zoom', 'https://zoom.us', 'Video meetings in the browser or desktop app.'),
      ('Netflix', 'https://www.netflix.com', 'Stream TV and movies on demand.'),
      ('Spotify', 'https://www.spotify.com', 'Music and podcasts with playlists you control.'),
      ('Amazon', 'https://www.amazon.com', 'Shopping, orders, and product search.'),
      ('Reddit', 'https://www.reddit.com', 'Threaded communities organized by topic.'),
      ('LinkedIn', 'https://www.linkedin.com', 'Professional profiles, jobs, and posts.'),
      ('Pinterest', 'https://www.pinterest.com', 'Visual boards for ideas and products.'),
      ('Snapchat', 'https://www.snapchat.com', 'Camera-first chat and stories.'),
      ('Telegram', 'https://telegram.org', 'Cloud messaging with large groups and channels.'),
      ('Shopify', 'https://www.shopify.com', 'Storefronts and checkout for online sellers.'),
      ('GitHub', 'https://github.com', 'Git hosting, issues, and code review.'),
      ('Dropbox', 'https://www.dropbox.com', 'Files in the cloud with sharing links.'),
      ('Trello', 'https://trello.com', 'Kanban boards for tasks and teams.'),
      ('Canva', 'https://www.canva.com', 'Templates for graphics, decks, and social posts.')
    ) as t(app_name, app_url, app_desc)
  loop
    insert into public.app_listings (
      owner_id,
      username,
      name,
      tagline,
      description,
      url,
      status,
      platforms,
      icon_data_url,
      install_id,
      staff_curated,
      raised_total,
      backer_count,
      archived
    )
    values (
      staff_id,
      'darkestaff',
      rec.app_name,
      rec.app_desc,
      rec.app_desc,
      rec.app_url,
      'live',
      array['web']::text[],
      '',
      'staff-tank-' || lower(regexp_replace(rec.app_name, '[^a-zA-Z0-9]+', '-', 'g')),
      true,
      0,
      0,
      false
    )
    on conflict (name) where staff_curated
    do update set
      url = excluded.url,
      tagline = excluded.tagline,
      description = excluded.description,
      status = 'live',
      archived = false,
      username = 'darkestaff',
      owner_id = staff_id;
  end loop;
end;
$$;

notify pgrst, 'reload schema';

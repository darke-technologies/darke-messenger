-- DARKE TANK seed — run this whole file in the SQL editor.
-- If the editor only allows one statement: run the CREATE FUNCTION first,
-- then run:  select public.seed_darke_tank();

create or replace function public.seed_darke_tank()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  staff_id uuid;
  staff_slug text;
  n int;
  bal int;
begin
  alter table public.app_listings add column if not exists staff_curated boolean not null default false;
  alter table public.app_listings add column if not exists raised_total integer not null default 0;
  alter table public.app_listings add column if not exists backer_count integer not null default 0;

  alter table public.app_listings drop constraint if exists app_listings_one_per_owner;
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

  create table if not exists public.tank_balances (
    user_id uuid primary key references public.profiles (id) on delete cascade,
    balance integer not null check (balance >= 0),
    updated_at timestamptz not null default now()
  );

  select p.id, p.username into staff_id, staff_slug
  from public.profiles p
  where p.username = 'darkestaff';

  if staff_id is null then
    raise exception 'No profile named darkestaff. Sign up that username in DARKE, then run select public.seed_darke_tank();';
  end if;

  alter table public.app_listings disable trigger app_listings_set_owner;

  delete from public.app_listings where staff_curated = true;

  insert into public.app_listings (
    owner_id, username, name, tagline, description, url, status, platforms,
    icon_data_url, install_id, staff_curated, raised_total, backer_count, archived
  )
  select
    staff_id,
    staff_slug,
    v.app_name,
    v.app_desc,
    v.app_desc,
    v.app_url,
    'live',
    array['web']::text[],
    '',
    'staff-tank-' || lower(regexp_replace(v.app_name, '[^a-zA-Z0-9]+', '-', 'g')),
    true,
    0,
    0,
    false
  from (values
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
  ) as v(app_name, app_url, app_desc);

  alter table public.app_listings enable trigger app_listings_set_owner;

  insert into public.tank_balances (user_id, balance)
  values (staff_id, 100000)
  on conflict (user_id) do update
    set balance = 100000, updated_at = now();

  select count(*)::int into n
  from public.app_listings
  where staff_curated = true;

  select b.balance into bal
  from public.tank_balances b
  where b.user_id = staff_id;

  return format('%s TANK apps for %s. tank_balances.balance=%s', n, staff_slug, coalesce(bal, 0));
end;
$$;

select public.seed_darke_tank();

-- Run ONE query at a time in the SQL editor (Success each time).
-- Then reload DARKE → Games.

-- 1) Let the app read balances
grant select on table public.tank_balances to authenticated;

-- 2) $100,000 for EVERY existing DARKE profile (including whoever is logged in)
insert into public.tank_balances (user_id, balance)
select p.id, 100000
from public.profiles p
on conflict (user_id) do update
set balance = 100000, updated_at = now();

-- 3) Allow many listings on the staff account
alter table public.app_listings add column if not exists staff_curated boolean not null default false;
alter table public.app_listings add column if not exists raised_total integer not null default 0;
alter table public.app_listings add column if not exists backer_count integer not null default 0;
alter table public.app_listings drop constraint if exists app_listings_one_per_owner;
drop index if exists app_listings_one_per_owner;
create unique index if not exists app_listings_one_per_owner
  on public.app_listings (owner_id) where staff_curated = false;
drop index if exists app_listings_one_per_install;
create unique index if not exists app_listings_one_per_install
  on public.app_listings (install_id) where staff_curated = false;
create unique index if not exists app_listings_staff_name
  on public.app_listings (name) where staff_curated;

-- 4) Skip the “must be signed in” insert trigger
alter table public.app_listings disable trigger app_listings_set_owner;

-- 5) Insert the 30 TANK apps (uses darkestaff)
insert into public.app_listings (
  owner_id, username, name, tagline, description, url, status, platforms,
  icon_data_url, install_id, staff_curated, raised_total, backer_count, archived
)
select
  p.id,
  p.username,
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
from public.profiles p
cross join (values
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
) as v(app_name, app_url, app_desc)
where p.username = 'darkestaff'
  and not exists (
    select 1 from public.app_listings l
    where l.staff_curated = true and l.name = v.app_name
  );

-- 6) Turn the insert trigger back on
alter table public.app_listings enable trigger app_listings_set_owner;

-- 7) Confirm
-- select count(*) from public.app_listings where staff_curated = true;
-- select p.username, b.balance from public.tank_balances b join public.profiles p on p.id = b.user_id;

-- DARKE v1 Phase 50 — Status updates, flat comments, notifications
-- Run in the Supabase SQL editor after phase49.sql.
-- Status posts are 80 chars. Comments are single-level (no nested replies).

create table if not exists public.status_updates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now(),
  constraint status_updates_content_len check (char_length(btrim(content)) between 1 and 80)
);

create index if not exists status_updates_user_created
  on public.status_updates (user_id, created_at desc);

create table if not exists public.status_comments (
  id uuid primary key default gen_random_uuid(),
  status_id uuid not null references public.status_updates (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now(),
  constraint status_comments_content_len check (char_length(btrim(content)) between 1 and 280)
);

create index if not exists status_comments_status_created
  on public.status_comments (status_id, created_at);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  actor_id uuid not null references public.profiles (id) on delete cascade,
  type text not null check (type in ('status_comment', 'status_reply')),
  status_id uuid not null references public.status_updates (id) on delete cascade,
  read boolean not null default false,
  created_at timestamptz not null default now(),
  constraint notifications_not_self check (recipient_id <> actor_id)
);

create index if not exists notifications_recipient_created
  on public.notifications (recipient_id, created_at desc);

create index if not exists notifications_recipient_unread
  on public.notifications (recipient_id)
  where read = false;

create or replace function public.status_comment_notify()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  author uuid;
  commenter uuid;
begin
  select s.user_id into author
  from public.status_updates s
  where s.id = new.status_id;
  if author is null then
    return new;
  end if;

  if new.user_id is distinct from author then
    insert into public.notifications (recipient_id, actor_id, type, status_id)
    values (author, new.user_id, 'status_comment', new.status_id);
  else
    for commenter in
      select distinct c.user_id
      from public.status_comments c
      where c.status_id = new.status_id
        and c.user_id is distinct from author
        and c.id is distinct from new.id
    loop
      insert into public.notifications (recipient_id, actor_id, type, status_id)
      values (commenter, new.user_id, 'status_reply', new.status_id);
    end loop;
  end if;
  return new;
end;
$$;

drop trigger if exists status_comment_notify on public.status_comments;
create trigger status_comment_notify
  after insert on public.status_comments
  for each row
  execute procedure public.status_comment_notify();

alter table public.status_updates enable row level security;
alter table public.status_comments enable row level security;
alter table public.notifications enable row level security;

drop policy if exists "status_updates_select_all" on public.status_updates;
create policy "status_updates_select_all"
  on public.status_updates for select using (true);

drop policy if exists "status_updates_insert_own" on public.status_updates;
create policy "status_updates_insert_own"
  on public.status_updates for insert
  with check (auth.uid() = user_id);

drop policy if exists "status_updates_delete_own" on public.status_updates;
create policy "status_updates_delete_own"
  on public.status_updates for delete
  using (auth.uid() = user_id);

drop policy if exists "status_comments_select_all" on public.status_comments;
create policy "status_comments_select_all"
  on public.status_comments for select using (true);

drop policy if exists "status_comments_insert_own" on public.status_comments;
create policy "status_comments_insert_own"
  on public.status_comments for insert
  with check (auth.uid() = user_id);

drop policy if exists "status_comments_delete_own" on public.status_comments;
create policy "status_comments_delete_own"
  on public.status_comments for delete
  using (auth.uid() = user_id);

drop policy if exists "notifications_select_own" on public.notifications;
create policy "notifications_select_own"
  on public.notifications for select
  using (auth.uid() = recipient_id);

drop policy if exists "notifications_update_own" on public.notifications;
create policy "notifications_update_own"
  on public.notifications for update
  using (auth.uid() = recipient_id)
  with check (auth.uid() = recipient_id);

drop policy if exists "notifications_delete_own" on public.notifications;
create policy "notifications_delete_own"
  on public.notifications for delete
  using (auth.uid() = recipient_id);

grant select on table public.status_updates to anon, authenticated;
grant insert, delete on table public.status_updates to authenticated;
grant select on table public.status_comments to anon, authenticated;
grant insert, delete on table public.status_comments to authenticated;
grant select, update, delete on table public.notifications to authenticated;

notify pgrst, 'reload schema';

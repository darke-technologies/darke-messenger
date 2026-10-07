-- DARKE v1 Phase 52 — Beeps, Beep Backs, BEEPER notifications
-- Run in the Supabase SQL editor after phase51.sql.
-- Migrates status_updates / status_comments into beeps / beep_comments.

create table if not exists public.beeps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now(),
  constraint beeps_content_len check (char_length(btrim(content)) between 1 and 80)
);

create index if not exists beeps_user_created
  on public.beeps (user_id, created_at desc);

create index if not exists beeps_created
  on public.beeps (created_at desc);

create table if not exists public.beep_comments (
  id uuid primary key default gen_random_uuid(),
  beep_id uuid not null references public.beeps (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now(),
  constraint beep_comments_content_len check (char_length(btrim(content)) between 1 and 280)
);

create index if not exists beep_comments_beep_created
  on public.beep_comments (beep_id, created_at);

do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'status_updates'
  ) then
    insert into public.beeps (id, user_id, content, created_at)
    select id, user_id, content, created_at from public.status_updates
    on conflict (id) do nothing;
  end if;

  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'status_comments'
  ) then
    insert into public.beep_comments (id, beep_id, user_id, content, created_at)
    select id, status_id, user_id, content, created_at from public.status_comments
    on conflict (id) do nothing;
  end if;
end $$;

alter table public.notifications
  add column if not exists beep_id uuid references public.beeps (id) on delete cascade;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'notifications' and column_name = 'status_id'
  ) then
    update public.notifications
    set beep_id = status_id
    where beep_id is null and status_id is not null;
  end if;
end $$;

update public.notifications set type = 'beep_comment' where type = 'status_comment';
update public.notifications set type = 'beep_reply' where type = 'status_reply';

delete from public.notifications where beep_id is null;

do $$
declare r record;
begin
  for r in
    select c.conname
    from pg_constraint c
    where c.conrelid = 'public.notifications'::regclass
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%type%'
  loop
    execute format('alter table public.notifications drop constraint if exists %I', r.conname);
  end loop;
end $$;

alter table public.notifications drop constraint if exists notifications_status_id_fkey;

alter table public.notifications
  alter column beep_id set not null;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'notifications' and column_name = 'status_id'
  ) then
    alter table public.notifications alter column status_id drop not null;
    alter table public.notifications drop column status_id;
  end if;
end $$;

alter table public.notifications
  add constraint notifications_type_check
  check (type in ('beep_comment', 'beep_reply'));

create or replace function public.beep_comment_notify()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  author uuid;
  commenter uuid;
begin
  select b.user_id into author
  from public.beeps b
  where b.id = new.beep_id;
  if author is null then
    return new;
  end if;

  if new.user_id is distinct from author then
    insert into public.notifications (recipient_id, actor_id, type, beep_id)
    values (author, new.user_id, 'beep_comment', new.beep_id);
  else
    for commenter in
      select distinct c.user_id
      from public.beep_comments c
      where c.beep_id = new.beep_id
        and c.user_id is distinct from author
        and c.id is distinct from new.id
    loop
      insert into public.notifications (recipient_id, actor_id, type, beep_id)
      values (commenter, new.user_id, 'beep_reply', new.beep_id);
    end loop;
  end if;
  return new;
end;
$$;

drop trigger if exists status_comment_notify on public.status_comments;
drop trigger if exists beep_comment_notify on public.beep_comments;
create trigger beep_comment_notify
  after insert on public.beep_comments
  for each row
  execute procedure public.beep_comment_notify();

alter table public.beeps enable row level security;
alter table public.beep_comments enable row level security;
alter table public.notifications enable row level security;

drop policy if exists "beeps_select_all" on public.beeps;
create policy "beeps_select_all"
  on public.beeps for select using (true);

drop policy if exists "beeps_insert_own" on public.beeps;
create policy "beeps_insert_own"
  on public.beeps for insert
  with check (auth.uid() = user_id);

drop policy if exists "beeps_delete_own" on public.beeps;
create policy "beeps_delete_own"
  on public.beeps for delete
  using (auth.uid() = user_id);

drop policy if exists "beep_comments_select_all" on public.beep_comments;
create policy "beep_comments_select_all"
  on public.beep_comments for select using (true);

drop policy if exists "beep_comments_insert_own" on public.beep_comments;
create policy "beep_comments_insert_own"
  on public.beep_comments for insert
  with check (auth.uid() = user_id);

drop policy if exists "beep_comments_delete_own" on public.beep_comments;
create policy "beep_comments_delete_own"
  on public.beep_comments for delete
  using (auth.uid() = user_id);

grant select on table public.beeps to anon, authenticated;
grant insert, delete on table public.beeps to authenticated;
grant select on table public.beep_comments to anon, authenticated;
grant insert, delete on table public.beep_comments to authenticated;

notify pgrst, 'reload schema';

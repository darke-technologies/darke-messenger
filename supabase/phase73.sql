-- DARKE v1 Phase 73 — follow notifications + comment id on notifications
-- Run in the Supabase SQL editor after phase72.sql.

alter table public.notifications
  add column if not exists comment_id uuid references public.beep_comments (id) on delete cascade;

alter table public.notifications
  alter column beep_id drop not null;

create index if not exists notifications_comment
  on public.notifications (comment_id);

do $$
declare r record;
begin
  for r in
    select c.conname
    from pg_constraint c
    where c.conrelid = 'public.notifications'::regclass
      and c.contype = 'c'
      and (
        pg_get_constraintdef(c.oid) ilike '%type%'
        or pg_get_constraintdef(c.oid) ilike '%payload%'
      )
  loop
    execute format('alter table public.notifications drop constraint if exists %I', r.conname);
  end loop;
end $$;

alter table public.notifications
  add constraint notifications_type_check
  check (type in ('beep_comment', 'beep_reply', 'follow'));

alter table public.notifications
  add constraint notifications_payload_check
  check (
    (type = 'follow' and beep_id is null and comment_id is null)
    or (type in ('beep_comment', 'beep_reply') and beep_id is not null)
  );

create or replace function public.beep_comment_notify()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  author uuid;
  parent_author uuid;
begin
  select b.user_id into author
  from public.beeps b
  where b.id = new.beep_id;
  if author is null then
    return new;
  end if;

  if new.parent_id is not null then
    select c.user_id into parent_author
    from public.beep_comments c
    where c.id = new.parent_id;
    if parent_author is not null and parent_author is distinct from new.user_id then
      insert into public.notifications (recipient_id, actor_id, type, beep_id, comment_id)
      values (parent_author, new.user_id, 'beep_reply', new.beep_id, new.id);
    end if;
    return new;
  end if;

  if new.user_id is distinct from author then
    insert into public.notifications (recipient_id, actor_id, type, beep_id, comment_id)
    values (author, new.user_id, 'beep_comment', new.beep_id, new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists beep_comment_notify on public.beep_comments;
create trigger beep_comment_notify
  after insert on public.beep_comments
  for each row
  execute procedure public.beep_comment_notify();

create or replace function public.follow_notify()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.follower_id is distinct from new.following_id then
    insert into public.notifications (recipient_id, actor_id, type)
    values (new.following_id, new.follower_id, 'follow');
  end if;
  return new;
end;
$$;

drop trigger if exists follow_notify on public.follows;
create trigger follow_notify
  after insert on public.follows
  for each row
  execute procedure public.follow_notify();

notify pgrst, 'reload schema';

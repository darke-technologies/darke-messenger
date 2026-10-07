-- DARKE v1 Phase 53 — Nested newsfeed comment threads
-- Run in the Supabase SQL editor after phase52.sql.

alter table public.beep_comments
  add column if not exists parent_id uuid references public.beep_comments (id) on delete cascade;

create index if not exists beep_comments_parent
  on public.beep_comments (parent_id);

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
      insert into public.notifications (recipient_id, actor_id, type, beep_id)
      values (parent_author, new.user_id, 'beep_reply', new.beep_id);
    end if;
    return new;
  end if;

  if new.user_id is distinct from author then
    insert into public.notifications (recipient_id, actor_id, type, beep_id)
    values (author, new.user_id, 'beep_comment', new.beep_id);
  end if;
  return new;
end;
$$;

notify pgrst, 'reload schema';

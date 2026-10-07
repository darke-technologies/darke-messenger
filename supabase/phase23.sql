-- DARKE v1 Phase 23 — Remove Channels / chat
-- Run in the Supabase SQL editor. Drops chat schema so rooms can be redesigned later.

drop trigger if exists chat_messages_set_identity on public.chat_messages;
drop trigger if exists chat_presence_set_identity on public.chat_presence;
drop trigger if exists messages_set_username on public.messages;

drop function if exists public.chat_messages_set_identity();
drop function if exists public.chat_presence_set_identity();
drop function if exists public.messages_set_username();

do $$
begin
  if exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'messages'
  ) then
    execute 'alter publication supabase_realtime drop table public.messages';
  end if;
end
$$;

drop table if exists public.chat_presence cascade;
drop table if exists public.chat_messages cascade;
drop table if exists public.chat_rooms cascade;
drop table if exists public.messages cascade;

notify pgrst, 'reload schema';

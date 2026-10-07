-- DARKE v1 Phase 94 — Zero-knowledge pending mailbox relay
-- Run after phase93.sql. Safe to re-run.
-- User applies this in the Supabase SQL editor.

create table if not exists public.pending_messages (
  id uuid default gen_random_uuid() primary key,
  recipient_username text not null,
  sender_username text not null,
  encrypted_content text,
  file_path text,
  created_at timestamptz default now()
);

create index if not exists pending_messages_recipient_idx
  on public.pending_messages (recipient_username, created_at);

create index if not exists pending_messages_sender_idx
  on public.pending_messages (sender_username, created_at);

alter table public.pending_messages enable row level security;

drop policy if exists "Allow message insertion" on public.pending_messages;
create policy "Allow message insertion"
  on public.pending_messages
  for insert
  with check (true);

drop policy if exists "Allow recipient fetch" on public.pending_messages;
create policy "Allow recipient fetch"
  on public.pending_messages
  for select
  using (true);

drop policy if exists "Allow recipient delete" on public.pending_messages;
create policy "Allow recipient delete"
  on public.pending_messages
  for delete
  using (true);

insert into storage.buckets (id, name, public, file_size_limit)
values ('pending-mailbox', 'pending-mailbox', false, 26214400)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit;

drop policy if exists "pending_mailbox_insert" on storage.objects;
create policy "pending_mailbox_insert"
  on storage.objects
  for insert
  with check (bucket_id = 'pending-mailbox');

drop policy if exists "pending_mailbox_select" on storage.objects;
create policy "pending_mailbox_select"
  on storage.objects
  for select
  using (bucket_id = 'pending-mailbox');

drop policy if exists "pending_mailbox_delete" on storage.objects;
create policy "pending_mailbox_delete"
  on storage.objects
  for delete
  using (bucket_id = 'pending-mailbox');

comment on table public.pending_messages is
  'Client-encrypted offline mailbox. Rows and storage objects are purged after the recipient fetches.';

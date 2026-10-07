-- DARKE v1 Phase 81 — Channel message attachments
-- Run after phase80.sql.

alter table public.beep_comments
  add column if not exists attachments jsonb;

update public.beep_comments
set attachments = '[]'::jsonb
where attachments is null;

alter table public.beep_comments
  alter column attachments set default '[]'::jsonb;

alter table public.beep_comments
  alter column attachments set not null;

alter table public.beep_comments
  drop constraint if exists beep_comments_content_len;
alter table public.beep_comments
  add constraint beep_comments_content_len
  check (char_length(coalesce(content, '')) <= 1250);

alter table public.beep_comments
  drop constraint if exists beep_comments_has_body;
alter table public.beep_comments
  add constraint beep_comments_has_body
  check (
    char_length(btrim(coalesce(content, ''))) >= 1
    or (
      jsonb_typeof(attachments) = 'array'
      and jsonb_array_length(attachments) > 0
    )
  );

insert into storage.buckets (id, name, public, file_size_limit)
values ('channel-files', 'channel-files', true, 8388608)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit;

drop policy if exists "channel_files_public_read" on storage.objects;
create policy "channel_files_public_read"
  on storage.objects
  for select
  using (bucket_id = 'channel-files');

drop policy if exists "channel_files_insert_own" on storage.objects;
create policy "channel_files_insert_own"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'channel-files'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "channel_files_delete_own" on storage.objects;
create policy "channel_files_delete_own"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'channel-files'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

notify pgrst, 'reload schema';

-- DARKE v1 Phase 65 — profile headline + edit own beeps/comments
-- Run in the Supabase SQL editor after phase64.sql.

alter table public.profiles
  add column if not exists headline text;

alter table public.profiles
  drop constraint if exists profiles_headline_len;
alter table public.profiles
  add constraint profiles_headline_len
  check (headline is null or char_length(btrim(headline)) between 1 and 80);

drop policy if exists "beeps_update_own" on public.beeps;
create policy "beeps_update_own"
  on public.beeps for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "beep_comments_update_own" on public.beep_comments;
create policy "beep_comments_update_own"
  on public.beep_comments for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant update on table public.beeps to authenticated;
grant update on table public.beep_comments to authenticated;

notify pgrst, 'reload schema';

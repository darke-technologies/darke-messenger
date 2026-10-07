-- DARKE v1 Phase 47 — Startup team job titles
-- Run in the Supabase SQL editor after phase46.sql.
-- Job title is required when adding a member. Team membership is what
-- shows the startup on that member’s profile (no extra flag).

alter table public.app_listing_team
  add column if not exists job_title text not null default '';

alter table public.app_listing_team
  drop constraint if exists app_listing_team_title_len;
alter table public.app_listing_team
  add constraint app_listing_team_title_len
  check (char_length(job_title) <= 80);

create index if not exists app_listing_team_member
  on public.app_listing_team (member_id);

create or replace function public.app_listing_team_before_write()
returns trigger
language plpgsql
as $$
declare
  owner uuid;
  n int;
  uname text;
  title text;
begin
  select l.owner_id into owner
  from public.app_listings l
  where l.id = new.listing_id;
  if owner is null then
    raise exception 'listing not found';
  end if;
  if new.member_id = owner then
    raise exception 'founder is already on this startup';
  end if;
  select p.username into uname
  from public.profiles p
  where p.id = new.member_id;
  if uname is null or btrim(uname) = '' then
    raise exception 'no profile';
  end if;
  new.username := uname;
  title := btrim(coalesce(new.job_title, ''));
  if title = '' then
    raise exception 'job title required';
  end if;
  new.job_title := title;
  select count(*)::int into n
  from public.app_listing_team t
  where t.listing_id = new.listing_id
    and t.member_id is distinct from new.member_id;
  if n >= 10 then
    raise exception 'team is full';
  end if;
  return new;
end;
$$;

notify pgrst, 'reload schema';

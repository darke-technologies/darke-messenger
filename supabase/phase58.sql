-- DARKE v1 Phase 58 — Optional People job/years, drop listing contact email
-- Run in the Supabase SQL editor after phase57.sql.

alter table public.app_listings
  drop constraint if exists app_listings_contact_email_len;

alter table public.app_listings
  drop column if exists contact_email;

create or replace function public.app_listing_team_before_write()
returns trigger
language plpgsql
as $$
declare
  owner uuid;
  n int;
  uname text;
begin
  select l.owner_id into owner
  from public.app_listings l
  where l.id = new.listing_id;
  if owner is null then
    raise exception 'listing not found';
  end if;
  select p.username into uname
  from public.profiles p
  where p.id = new.member_id;
  if uname is null or btrim(uname) = '' then
    raise exception 'no profile';
  end if;
  new.username := uname;
  new.job_title := btrim(coalesce(new.job_title, ''));
  if new.ended_year is not null
    and (new.started_year is null or new.ended_year < new.started_year) then
    raise exception 'end year before start';
  end if;
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

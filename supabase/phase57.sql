-- DARKE v1 Phase 57 — Experience years, self-join, minimal company pages
-- Run in the Supabase SQL editor after phase56.sql.

alter table public.app_listings
  drop constraint if exists app_listings_url_len;
alter table public.app_listings
  add constraint app_listings_url_len
  check (char_length(url) <= 500);
alter table public.app_listings
  alter column url set default '';
alter table public.app_listings
  alter column icon_data_url set default '';

alter table public.app_listing_team
  add column if not exists started_year smallint,
  add column if not exists ended_year smallint;

alter table public.app_listing_team
  drop constraint if exists app_listing_team_years;
alter table public.app_listing_team
  add constraint app_listing_team_years check (
    started_year is null
    or (
      started_year between 1900 and 2100
      and (ended_year is null or ended_year between started_year and 2100)
    )
  );

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
  if new.started_year is null then
    raise exception 'start year required';
  end if;
  if new.ended_year is not null and new.ended_year < new.started_year then
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

drop policy if exists "app_listing_team_insert_owner" on public.app_listing_team;
create policy "app_listing_team_insert_owner"
  on public.app_listing_team
  for insert
  with check (
    (
      public.user_manages_company(listing_id)
      and (is_admin = false or public.user_owns_company(listing_id))
    )
    or (
      member_id = auth.uid()
      and is_admin = false
    )
  );

drop policy if exists "app_listing_team_delete_owner" on public.app_listing_team;
create policy "app_listing_team_delete_owner"
  on public.app_listing_team
  for delete
  using (
    public.user_owns_company(listing_id)
    or (public.user_admins_company(listing_id) and is_admin = false)
    or member_id = auth.uid()
  );

drop policy if exists "app_listing_team_update_owner" on public.app_listing_team;
create policy "app_listing_team_update_owner"
  on public.app_listing_team
  for update
  using (public.user_owns_company(listing_id))
  with check (public.user_owns_company(listing_id));

drop policy if exists "app_listing_team_update_self" on public.app_listing_team;
create policy "app_listing_team_update_self"
  on public.app_listing_team
  for update
  using (member_id = auth.uid())
  with check (member_id = auth.uid());

notify pgrst, 'reload schema';

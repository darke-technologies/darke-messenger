-- DARKE v1 Phase 46 — Startup team members (max 10)
-- Run in the Supabase SQL editor after phase45.sql.
-- Founder adds existing DARKE users immediately. No accept / notify flow.

create table if not exists public.app_listing_team (
  listing_id uuid not null references public.app_listings (id) on delete cascade,
  member_id uuid not null references public.profiles (id) on delete cascade,
  username text not null,
  created_at timestamptz not null default now(),
  primary key (listing_id, member_id)
);

create index if not exists app_listing_team_listing
  on public.app_listing_team (listing_id, created_at);

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

drop trigger if exists app_listing_team_before_write on public.app_listing_team;
create trigger app_listing_team_before_write
  before insert on public.app_listing_team
  for each row
  execute procedure public.app_listing_team_before_write();

alter table public.app_listing_team enable row level security;

drop policy if exists "app_listing_team_select_all" on public.app_listing_team;
create policy "app_listing_team_select_all"
  on public.app_listing_team
  for select
  using (true);

drop policy if exists "app_listing_team_insert_owner" on public.app_listing_team;
create policy "app_listing_team_insert_owner"
  on public.app_listing_team
  for insert
  with check (
    exists (
      select 1
      from public.app_listings l
      where l.id = listing_id
        and l.owner_id = auth.uid()
        and coalesce(l.staff_curated, false) = false
    )
  );

drop policy if exists "app_listing_team_delete_owner" on public.app_listing_team;
create policy "app_listing_team_delete_owner"
  on public.app_listing_team
  for delete
  using (
    exists (
      select 1
      from public.app_listings l
      where l.id = listing_id
        and l.owner_id = auth.uid()
        and coalesce(l.staff_curated, false) = false
    )
  );

grant select on table public.app_listing_team to anon, authenticated;
grant insert, delete on table public.app_listing_team to authenticated;

notify pgrst, 'reload schema';

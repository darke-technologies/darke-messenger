-- DARKE v1 Phase 56 — Free Company Directory, People admins, longer Overview
-- Run in the Supabase SQL editor after phase55.sql.

alter table public.app_listings
  drop constraint if exists app_listings_desc_len;
alter table public.app_listings
  add constraint app_listings_desc_len
  check (char_length(description) <= 2000);

alter table public.app_listing_team
  add column if not exists is_admin boolean not null default false;

create or replace function public.user_owns_company(p_listing uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.app_listings l
    where l.id = p_listing
      and l.owner_id = auth.uid()
      and coalesce(l.staff_curated, false) = false
  );
$$;

create or replace function public.user_admins_company(p_listing uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.app_listing_team t
    where t.listing_id = p_listing
      and t.member_id = auth.uid()
      and t.is_admin = true
  );
$$;

create or replace function public.user_manages_company(p_listing uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.user_owns_company(p_listing)
    or public.user_admins_company(p_listing);
$$;

revoke all on function public.user_owns_company(uuid) from public;
revoke all on function public.user_admins_company(uuid) from public;
revoke all on function public.user_manages_company(uuid) from public;
grant execute on function public.user_owns_company(uuid) to authenticated;
grant execute on function public.user_admins_company(uuid) to authenticated;
grant execute on function public.user_manages_company(uuid) to authenticated;

drop policy if exists "app_listings_update_own" on public.app_listings;
create policy "app_listings_update_own"
  on public.app_listings
  for update
  using (public.user_manages_company(id))
  with check (public.user_manages_company(id));

drop policy if exists "app_listing_team_insert_owner" on public.app_listing_team;
create policy "app_listing_team_insert_owner"
  on public.app_listing_team
  for insert
  with check (
    public.user_manages_company(listing_id)
    and (is_admin = false or public.user_owns_company(listing_id))
  );

drop policy if exists "app_listing_team_delete_owner" on public.app_listing_team;
create policy "app_listing_team_delete_owner"
  on public.app_listing_team
  for delete
  using (
    public.user_owns_company(listing_id)
    or (public.user_admins_company(listing_id) and is_admin = false)
  );

drop policy if exists "app_listing_team_update_owner" on public.app_listing_team;
create policy "app_listing_team_update_owner"
  on public.app_listing_team
  for update
  using (public.user_owns_company(listing_id))
  with check (public.user_owns_company(listing_id));

grant update on table public.app_listing_team to authenticated;

create or replace function public.app_listing_team_guard_admin()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    if new.is_admin and not public.user_owns_company(new.listing_id) then
      new.is_admin := false;
    end if;
    return new;
  end if;
  if tg_op = 'UPDATE' then
    if new.is_admin is distinct from old.is_admin
      and not public.user_owns_company(new.listing_id) then
      raise exception 'only owner can appoint admins';
    end if;
    return new;
  end if;
  return new;
end;
$$;

drop trigger if exists app_listing_team_guard_admin on public.app_listing_team;
create trigger app_listing_team_guard_admin
  before insert or update on public.app_listing_team
  for each row
  execute procedure public.app_listing_team_guard_admin();

notify pgrst, 'reload schema';

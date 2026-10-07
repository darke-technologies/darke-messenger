-- DARKE v1 Phase 36 — TANK includes public app listings plus @darkestaff apps
-- IN/OUT no longer require staff_curated. Run after tank_tables.sql.

create or replace function public.tank_invest(p_listing_id uuid, p_amount integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid;
  listing public.app_listings%rowtype;
  first_in boolean;
begin
  uid := auth.uid();
  if uid is null then
    raise exception 'not signed in';
  end if;
  if p_amount is null or p_amount < 10000 then
    raise exception 'invalid amount';
  end if;

  select * into listing
  from public.app_listings
  where id = p_listing_id
    and archived = false
  for update;
  if not found then
    raise exception 'listing not found';
  end if;
  if listing.owner_id = uid then
    raise exception 'own listing';
  end if;
  if exists (
    select 1 from public.tank_outs o
    where o.user_id = uid and o.listing_id = p_listing_id
  ) then
    raise exception 'already out';
  end if;

  perform 1 from public.tank_balances b where b.user_id = uid for update;
  if not found then
    raise exception 'no tank balance';
  end if;
  update public.tank_balances
  set balance = balance - p_amount, updated_at = now()
  where user_id = uid and balance >= p_amount;
  if not found then
    raise exception 'insufficient balance';
  end if;

  first_in := not exists (
    select 1 from public.tank_investments i
    where i.user_id = uid and i.listing_id = p_listing_id
  );

  insert into public.tank_investments (user_id, listing_id, amount)
  values (uid, p_listing_id, p_amount)
  on conflict (user_id, listing_id)
  do update set
    amount = public.tank_investments.amount + excluded.amount,
    updated_at = now();

  perform set_config('darke.tank_rpc', '1', true);
  update public.app_listings
  set
    raised_total = raised_total + p_amount,
    backer_count = backer_count + case when first_in then 1 else 0 end
  where id = p_listing_id;
end;
$$;

create or replace function public.tank_out(p_listing_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid;
begin
  uid := auth.uid();
  if uid is null then
    raise exception 'not signed in';
  end if;
  if not exists (
    select 1 from public.app_listings l
    where l.id = p_listing_id
      and l.archived = false
  ) then
    raise exception 'listing not found';
  end if;
  if exists (
    select 1 from public.app_listings l
    where l.id = p_listing_id and l.owner_id = uid
  ) then
    raise exception 'own listing';
  end if;
  if exists (
    select 1 from public.tank_investments i
    where i.user_id = uid and i.listing_id = p_listing_id
  ) then
    raise exception 'already in';
  end if;
  insert into public.tank_outs (user_id, listing_id)
  values (uid, p_listing_id)
  on conflict (user_id, listing_id) do nothing;
end;
$$;

revoke all on function public.tank_invest(uuid, integer) from public;
revoke all on function public.tank_out(uuid) from public;
grant execute on function public.tank_invest(uuid, integer) to authenticated;
grant execute on function public.tank_out(uuid) to authenticated;

notify pgrst, 'reload schema';

-- DARKE TANK: create investment tables + IN/OUT RPCs.
-- Run this whole file in the Supabase SQL editor until it says Success.
-- Listings can exist without these tables; Confirm I'M IN then fails with 42P01.

create table if not exists public.tank_balances (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  balance integer not null check (balance >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.tank_investments (
  user_id uuid not null references public.profiles (id) on delete cascade,
  listing_id uuid not null references public.app_listings (id) on delete cascade,
  amount integer not null check (amount >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, listing_id)
);

create index if not exists tank_investments_listing
  on public.tank_investments (listing_id, created_at desc);

create table if not exists public.tank_outs (
  user_id uuid not null references public.profiles (id) on delete cascade,
  listing_id uuid not null references public.app_listings (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, listing_id)
);

alter table public.tank_balances enable row level security;
alter table public.tank_investments enable row level security;
alter table public.tank_outs enable row level security;

drop policy if exists "tank_balances_select_own" on public.tank_balances;
create policy "tank_balances_select_own"
  on public.tank_balances
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "tank_investments_select_own" on public.tank_investments;
drop policy if exists "tank_investments_select_all" on public.tank_investments;
create policy "tank_investments_select_all"
  on public.tank_investments
  for select
  to authenticated
  using (true);

drop policy if exists "tank_outs_select_own" on public.tank_outs;
create policy "tank_outs_select_own"
  on public.tank_outs
  for select
  to authenticated
  using (auth.uid() = user_id);

revoke insert, update, delete on table public.tank_investments from authenticated;
revoke insert, update, delete on table public.tank_outs from authenticated;
revoke insert, update, delete on table public.tank_balances from authenticated;

grant select on table public.tank_balances to authenticated;
grant select on table public.tank_investments to authenticated;
grant select on table public.tank_outs to authenticated;

insert into public.tank_balances (user_id, balance)
select p.id, 100000
from public.profiles p
on conflict (user_id) do nothing;

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

drop function if exists public.tank_listing_investors(uuid);

create function public.tank_listing_investors(p_listing_id uuid)
returns table(username text, avatar_url text, amount integer, invested_at timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  return query
  select p.username, p.avatar_url, i.amount, i.updated_at
  from public.tank_investments i
  join public.profiles p on p.id = i.user_id
  where i.listing_id = p_listing_id
  order by i.updated_at desc, i.created_at desc
  limit 100;
end;
$$;

revoke all on function public.tank_invest(uuid, integer) from public;
revoke all on function public.tank_out(uuid) from public;
revoke all on function public.tank_listing_investors(uuid) from public;
grant execute on function public.tank_invest(uuid, integer) to authenticated;
grant execute on function public.tank_out(uuid) to authenticated;
grant execute on function public.tank_listing_investors(uuid) to authenticated;

notify pgrst, 'reload schema';

-- Fix DARKE balance so the signed-in app can read tank_balances
-- (Table Editor uses postgres and bypasses RLS; the app does not).
-- Run the whole file, then reload DARKE.

grant select on table public.tank_balances to authenticated;

alter table public.tank_balances enable row level security;

drop policy if exists "tank_balances_select_own" on public.tank_balances;
create policy "tank_balances_select_own"
  on public.tank_balances
  for select
  to authenticated
  using (user_id = auth.uid());

create or replace function public.tank_my_balance()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid;
  n integer;
begin
  uid := auth.uid();
  if uid is null then
    raise exception 'not signed in';
  end if;

  select b.balance into n
  from public.tank_balances b
  where b.user_id = uid;

  if n is not null then
    return n;
  end if;

  insert into public.tank_balances (user_id, balance)
  values (uid, 100000)
  on conflict (user_id) do update
    set updated_at = now()
  returning balance into n;

  return coalesce(n, 100000);
end;
$$;

revoke all on function public.tank_my_balance() from public;
grant execute on function public.tank_my_balance() to authenticated;

-- Attach $100,000 if these usernames have a profile but no balance row.
-- Does not lower an existing balance.
insert into public.tank_balances (user_id, balance)
select p.id, 100000
from public.profiles p
where lower(p.username) in ('darkestaff', 'mikedarke')
on conflict (user_id) do nothing;

create or replace function public.tank_credit_shooter(p_amount integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid;
  n integer;
begin
  uid := auth.uid();
  if uid is null then
    raise exception 'not signed in';
  end if;
  if p_amount is null or p_amount < 1 or p_amount > 10000000 then
    raise exception 'invalid amount';
  end if;

  insert into public.tank_balances (user_id, balance)
  values (uid, 100000)
  on conflict (user_id) do nothing;

  update public.tank_balances
  set balance = balance + p_amount,
      updated_at = now()
  where user_id = uid
  returning balance into n;

  return coalesce(n, p_amount);
end;
$$;

revoke all on function public.tank_credit_shooter(integer) from public;
grant execute on function public.tank_credit_shooter(integer) to authenticated;

create table if not exists public.shooter_high_scores (
  user_id uuid primary key references auth.users (id) on delete cascade,
  high_score integer not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.shooter_high_scores enable row level security;

drop policy if exists "shooter_high_scores_select_own" on public.shooter_high_scores;
create policy "shooter_high_scores_select_own"
  on public.shooter_high_scores
  for select
  to authenticated
  using (user_id = auth.uid());

revoke insert, update, delete on table public.shooter_high_scores from authenticated;
grant select on table public.shooter_high_scores to authenticated;

create or replace function public.shooter_my_high_score()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid;
  n integer;
begin
  uid := auth.uid();
  if uid is null then
    raise exception 'not signed in';
  end if;
  select s.high_score into n
  from public.shooter_high_scores s
  where s.user_id = uid;
  return coalesce(n, 0);
end;
$$;

create or replace function public.shooter_report_score(p_score integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid;
  n integer;
begin
  uid := auth.uid();
  if uid is null then
    raise exception 'not signed in';
  end if;
  if p_score is null or p_score < 0 or p_score > 100000000 then
    raise exception 'invalid amount';
  end if;

  insert into public.shooter_high_scores (user_id, high_score)
  values (uid, p_score)
  on conflict (user_id) do update
    set high_score = greatest(public.shooter_high_scores.high_score, excluded.high_score),
        updated_at = now()
  returning high_score into n;

  return coalesce(n, p_score);
end;
$$;

revoke all on function public.shooter_my_high_score() from public;
revoke all on function public.shooter_report_score(integer) from public;
grant execute on function public.shooter_my_high_score() to authenticated;
grant execute on function public.shooter_report_score(integer) to authenticated;

notify pgrst, 'reload schema';

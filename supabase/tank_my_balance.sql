-- Run this whole file in the SQL editor, then reload DARKE.
-- Gives the signed-in user a readable TANK balance (creates $100,000 if missing).

grant select on table public.tank_balances to authenticated;

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

grant execute on function public.tank_my_balance() to authenticated;

insert into public.tank_balances (user_id, balance)
select p.id, 100000
from public.profiles p
where lower(p.username) = 'darkestaff'
on conflict (user_id) do update
set balance = 100000, updated_at = now();

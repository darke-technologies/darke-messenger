-- Run in the SQL editor so boulder points can credit DARKE balance.
-- Then: notify pgrst, 'reload schema';

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

notify pgrst, 'reload schema';

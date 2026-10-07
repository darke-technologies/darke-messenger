-- DARKE TANK — staff (darkestaff) may insert/update TANK listings from the app.
-- Run once in the SQL editor.

create or replace function public.app_listings_set_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  slug text;
begin
  if auth.uid() is null then
    if new.owner_id is null then
      raise exception 'not signed in';
    end if;
    if new.username is null or btrim(new.username) = '' then
      raise exception 'no profile';
    end if;
  else
    new.owner_id := auth.uid();
    select p.username into slug from public.profiles p where p.id = auth.uid();
    if slug is null or slug = '' then
      raise exception 'no profile';
    end if;
    new.username := slug;
    if slug = 'darkestaff' then
      new.staff_curated := true;
    elsif coalesce(new.staff_curated, false) then
      raise exception 'only staff can create TANK listings';
    end if;
  end if;
  new.thumbs_up := 0;
  new.thumbs_down := 0;
  if new.install_id is null or btrim(new.install_id) = '' then
    raise exception 'install_id required';
  end if;
  return new;
end;
$$;

grant select on table public.tank_balances to authenticated;

alter table public.tank_balances enable row level security;

drop policy if exists "tank_balances_select_own" on public.tank_balances;
create policy "tank_balances_select_own"
  on public.tank_balances
  for select
  to authenticated
  using (auth.uid() = user_id);

insert into public.tank_balances (user_id, balance)
select p.id, 100000
from public.profiles p
where lower(p.username) = 'darkestaff'
on conflict (user_id) do update
set balance = 100000, updated_at = now();

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

notify pgrst, 'reload schema';

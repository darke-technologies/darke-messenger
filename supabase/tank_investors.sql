-- Investors on a TANK listing: newest first, with profile photo URL.
-- Run in the Supabase SQL editor (Success). Return type changed, so drop first.

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

revoke all on function public.tank_listing_investors(uuid) from public;
grant execute on function public.tank_listing_investors(uuid) to authenticated;
notify pgrst, 'reload schema';

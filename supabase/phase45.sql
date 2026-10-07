-- DARKE v1 Phase 45 — Activate paid STARTUPS listings after Stripe checkout
-- Run in the Supabase SQL editor after phase44.sql.
-- The desktop app verifies Stripe, then the owner calls this RPC.

create or replace function public.activate_paid_startup_listing(p_listing_id uuid)
returns public.app_listings
language plpgsql
security definer
set search_path = public
as $$
declare
  row public.app_listings;
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  if p_listing_id is null then
    raise exception 'listing not found';
  end if;

  update public.app_listings
  set
    is_paid_listing = true,
    paid_until = case
      when paid_until is not null and paid_until > now()
        then paid_until + interval '1 year'
      else now() + interval '1 year'
    end
  where id = p_listing_id
    and owner_id = auth.uid()
    and coalesce(staff_curated, false) = false
  returning * into row;

  if not found then
    raise exception 'listing not found';
  end if;
  return row;
end;
$$;

revoke all on function public.activate_paid_startup_listing(uuid) from public;
grant execute on function public.activate_paid_startup_listing(uuid) to authenticated;

notify pgrst, 'reload schema';

-- DARKE v1 Phase 64 — Enterprise tier (FREE / PRO)
-- Run in the Supabase SQL editor after phase63.sql.

alter table public.profiles
  add column if not exists is_pro boolean not null default false;

alter table public.profiles
  add column if not exists subscription_status text not null default 'free';

alter table public.profiles
  drop constraint if exists profiles_subscription_status_ok;
alter table public.profiles
  add constraint profiles_subscription_status_ok
  check (subscription_status in ('free', 'pro'));

update public.profiles
set subscription_status = case when is_pro then 'pro' else 'free' end
where subscription_status is distinct from (case when is_pro then 'pro' else 'free' end);

create or replace function public.profiles_preserve_tier()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() is distinct from 'service_role' then
    new.is_pro := old.is_pro;
    new.subscription_status := old.subscription_status;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_preserve_tier on public.profiles;
create trigger profiles_preserve_tier
before update on public.profiles
for each row
execute procedure public.profiles_preserve_tier();

notify pgrst, 'reload schema';

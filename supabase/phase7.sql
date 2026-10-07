-- DARKE v1 Phase 7 — one Apps listing per DARKE install
-- Run after phase5.sql in the Supabase SQL editor.

alter table public.app_listings
  add column if not exists install_id text;

-- Give legacy rows a unique placeholder so NOT NULL + unique can apply.
update public.app_listings
set install_id = 'legacy-' || id::text
where install_id is null or btrim(install_id) = '';

alter table public.app_listings
  alter column install_id set not null;

create unique index if not exists app_listings_one_per_install
  on public.app_listings (install_id);

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
    raise exception 'not signed in';
  end if;
  new.owner_id := auth.uid();
  select p.username into slug from public.profiles p where p.id = auth.uid();
  if slug is null or slug = '' then
    raise exception 'no profile';
  end if;
  new.username := slug;
  new.thumbs_up := 0;
  new.thumbs_down := 0;
  if new.install_id is null or btrim(new.install_id) = '' then
    raise exception 'install_id required';
  end if;
  return new;
end;
$$;

notify pgrst, 'reload schema';

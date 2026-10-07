-- DARKE v1 Phase 60 — Display names on profiles (auth signup metadata)
-- Run in the Supabase SQL editor after phase59.sql.

alter table public.profiles
  add column if not exists display_name text;

alter table public.profiles
  drop constraint if exists profiles_display_name_len;
alter table public.profiles
  add constraint profiles_display_name_len
  check (
    display_name is null
    or (
      char_length(btrim(display_name)) between 1 and 80
    )
  );

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  slug text;
  display text;
  mail text;
begin
  slug := lower(coalesce(new.raw_user_meta_data->>'username', ''));
  slug := regexp_replace(slug, '[^a-z0-9]', '', 'g');
  if slug = '' then
    return new;
  end if;

  display := btrim(coalesce(new.raw_user_meta_data->>'display_name', ''));
  if char_length(display) = 0 then
    display := slug;
  end if;
  if char_length(display) > 80 then
    display := left(display, 80);
  end if;

  mail := lower(btrim(coalesce(new.email, new.raw_user_meta_data->>'email', '')));
  if mail = '' or mail like '%@users.darke.local' then
    mail := null;
  end if;

  insert into public.profiles (id, username, auth_slug, display_name, email)
  values (new.id, slug, slug, display, mail)
  on conflict (id) do nothing;
  return new;
end;
$$;

notify pgrst, 'reload schema';

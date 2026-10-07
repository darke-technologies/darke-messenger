-- DARKE v1 Phase 101 — Required display_name + username shape
-- Run after phase100.sql. Safe to re-run.
--
-- display_name: 1–50 characters (unicode/spaces).
-- username: 3–30, letters/numbers/underscores, unique, lowercase.

update public.profiles
set display_name = username
where display_name is null
   or btrim(display_name) = '';

alter table public.profiles
  alter column username set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_username_shape'
  ) then
    alter table public.profiles
      add constraint profiles_username_shape
      check (username ~ '^[a-z0-9_]{1,30}$');
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_display_name_len'
  ) then
    alter table public.profiles
      add constraint profiles_display_name_len
      check (
        display_name is null
        or char_length(btrim(display_name)) between 1 and 50
      );
  end if;
end $$;

notify pgrst, 'reload schema';

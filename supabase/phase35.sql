-- DARKE v1 Phase 35 — Allow up to 10 TMDB titles on a public profile
-- Run in the Supabase SQL editor after phase33.sql (or phase30.sql).

create or replace function public.tmdb_profile_features_cap()
returns trigger
language plpgsql
as $$
begin
  if exists (
    select 1
    from public.tmdb_profile_features
    where user_id = new.user_id
      and media_type = new.media_type
      and tmdb_id = new.tmdb_id
  ) then
    return new;
  end if;
  if (
    select count(*)
    from public.tmdb_profile_features
    where user_id = new.user_id
  ) >= 10 then
    raise exception 'tmdb_profile_features_max';
  end if;
  return new;
end;
$$;

notify pgrst, 'reload schema';

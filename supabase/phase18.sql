-- DARKE v1 Phase 18 — Recruit leaderboard
-- Run in the Supabase SQL editor after phase17.sql.

create or replace function public.recruit_leaderboard(lim int default 500)
returns table(username text, recruits bigint)
language sql
stable
security definer
set search_path = public
as $$
  select p.username, count(*)::bigint as recruits
  from public.invite_visits v
  join public.profiles p on p.id = v.referrer_id
  group by p.username
  having count(*) > 0
  order by recruits desc, p.username asc
  limit greatest(1, coalesce(lim, 500));
$$;

revoke all on function public.recruit_leaderboard(int) from public;
grant execute on function public.recruit_leaderboard(int) to authenticated;

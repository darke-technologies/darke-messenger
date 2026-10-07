create table if not exists public.shooter_high_scores (
  user_id uuid primary key references auth.users (id) on delete cascade,
  high_score integer not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.shooter_high_scores enable row level security;

drop policy if exists "shooter_high_scores_select_own" on public.shooter_high_scores;
create policy "shooter_high_scores_select_own"
  on public.shooter_high_scores
  for select
  to authenticated
  using (user_id = auth.uid());

revoke insert, update, delete on table public.shooter_high_scores from authenticated;
grant select on table public.shooter_high_scores to authenticated;

create or replace function public.shooter_my_high_score()
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
  select s.high_score into n
  from public.shooter_high_scores s
  where s.user_id = uid;
  return coalesce(n, 0);
end;
$$;

create or replace function public.shooter_report_score(p_score integer)
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
  if p_score is null or p_score < 0 or p_score > 100000000 then
    raise exception 'invalid amount';
  end if;

  insert into public.shooter_high_scores (user_id, high_score)
  values (uid, p_score)
  on conflict (user_id) do update
    set high_score = greatest(public.shooter_high_scores.high_score, excluded.high_score),
        updated_at = now()
  returning high_score into n;

  return coalesce(n, p_score);
end;
$$;

revoke all on function public.shooter_my_high_score() from public;
revoke all on function public.shooter_report_score(integer) from public;
grant execute on function public.shooter_my_high_score() to authenticated;
grant execute on function public.shooter_report_score(integer) to authenticated;

notify pgrst, 'reload schema';

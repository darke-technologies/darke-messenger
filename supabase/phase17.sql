-- DARKE v1 Phase 17 — Invite links
-- Run in the Supabase SQL editor after phase1.sql (profiles).
-- Invite URL shape: https://darke.ai/?ref=<username>
-- Unique visitors: darke.ai calls record_invite_visit (see web/darke-ai-invite.js).

create table if not exists public.invite_visits (
  referrer_id uuid not null references public.profiles (id) on delete cascade,
  visitor_key text not null,
  first_seen_at timestamptz not null default now(),
  primary key (referrer_id, visitor_key),
  constraint invite_visits_key_check check (
    char_length(visitor_key) between 8 and 80
    and visitor_key ~ '^[a-zA-Z0-9._-]+$'
  )
);

create index if not exists invite_visits_referrer_idx
  on public.invite_visits (referrer_id);

alter table public.invite_visits enable row level security;

drop policy if exists "invite_visits_select_own" on public.invite_visits;
create policy "invite_visits_select_own"
  on public.invite_visits
  for select
  to authenticated
  using (auth.uid() = referrer_id);

grant select on table public.invite_visits to authenticated;

create or replace function public.record_invite_visit(referrer text, visitor_key text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  rid uuid;
  slug text;
  key text;
begin
  slug := lower(regexp_replace(coalesce(referrer, ''), '[^a-zA-Z0-9]', '', 'g'));
  key := trim(coalesce(visitor_key, ''));
  if slug = '' or length(key) < 8 or length(key) > 80 then
    return;
  end if;
  if key !~ '^[a-zA-Z0-9._-]+$' then
    return;
  end if;
  select p.id into rid from public.profiles p where p.username = slug;
  if rid is null then
    return;
  end if;
  insert into public.invite_visits (referrer_id, visitor_key)
  values (rid, key)
  on conflict (referrer_id, visitor_key) do nothing;
end;
$$;

revoke all on function public.record_invite_visit(text, text) from public;
grant execute on function public.record_invite_visit(text, text) to anon, authenticated;

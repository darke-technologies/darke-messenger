-- Run this ONE statement first. Then refresh Table Editor (schema: public).
-- The table is named tank_balances (not tanks_balances).

create table if not exists public.tank_balances (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  balance integer not null check (balance >= 0),
  updated_at timestamptz not null default now()
);

alter table public.tank_balances enable row level security;

drop policy if exists "tank_balances_select_own" on public.tank_balances;
create policy "tank_balances_select_own"
  on public.tank_balances
  for select
  to authenticated
  using (auth.uid() = user_id);

grant select on table public.tank_balances to authenticated;

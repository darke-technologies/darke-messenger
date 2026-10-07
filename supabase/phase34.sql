-- DARKE v1 Phase 34 — Public TANK investments on profiles
-- Lets any signed-in user read who backed which TANK listing and how much.
-- Balances and OUT records stay private. Run after tank_tables.sql.

drop policy if exists "tank_investments_select_own" on public.tank_investments;
drop policy if exists "tank_investments_select_all" on public.tank_investments;
create policy "tank_investments_select_all"
  on public.tank_investments
  for select
  to authenticated
  using (true);

grant select on table public.tank_investments to authenticated;

notify pgrst, 'reload schema';

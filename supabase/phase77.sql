-- DARKE v1 Phase 77 — Owner can delete channels
-- Run after phase76.sql.

drop policy if exists "workspace_channels_delete" on public.workspace_channels;
create policy "workspace_channels_delete"
  on public.workspace_channels for delete
  using (
    exists (
      select 1 from public.workspaces w
      where w.id = workspace_id and w.owner_id = auth.uid()
    )
  );

grant delete on table public.workspace_channels to authenticated;

notify pgrst, 'reload schema';

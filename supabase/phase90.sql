-- DARKE v1 Phase 90 — Owner can remove channel members
-- Run after phase89.sql. Safe to re-run.

drop policy if exists "channel_members_delete" on public.channel_members;
create policy "channel_members_delete"
  on public.channel_members for delete
  using (
    exists (
      select 1
      from public.workspace_channels c
      join public.workspaces w on w.id = c.workspace_id
      where c.id = channel_id
        and w.owner_id = auth.uid()
    )
  );

create or replace function public.remove_channel_member(
  p_channel_id uuid,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  owner uuid;
  ws uuid;
begin
  if uid is null then
    raise exception 'Not signed in';
  end if;
  select c.workspace_id, w.owner_id into ws, owner
  from public.workspace_channels c
  left join public.workspaces w on w.id = c.workspace_id
  where c.id = p_channel_id;
  if owner is null or owner is distinct from uid then
    raise exception 'Not workspace owner';
  end if;
  if p_user_id = owner then
    raise exception 'cannot_remove_owner';
  end if;
  delete from public.channel_members
  where channel_id = p_channel_id
    and user_id = p_user_id;
  if ws is not null then
    delete from public.workspace_members
    where workspace_id = ws
      and user_id = p_user_id
      and role = 'guest';
  end if;
end;
$$;

grant execute on function public.remove_channel_member(uuid, uuid) to authenticated;

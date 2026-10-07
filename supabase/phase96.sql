-- DARKE v1 Phase 96 — Fix default team/channel provision (ON CONFLICT 42P10)
-- Run after phase95.sql. Safe to re-run.
--
-- workspace_channels no longer has UNIQUE (workspace_id, slug) (dropped in
-- phase85). The after-insert workspace trigger still used
-- ON CONFLICT (workspace_id, slug), which aborts signup.

create or replace function public.provision_workspace_defaults()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  ch_id uuid;
begin
  insert into public.workspace_members (workspace_id, user_id, role)
  select new.id, new.owner_id, 'owner'
  where new.owner_id is not null
    and not exists (
      select 1
      from public.workspace_members m
      where m.workspace_id = new.id
        and m.user_id = new.owner_id
    );

  if not exists (
    select 1
    from public.workspace_channels c
    where c.workspace_id = new.id
  ) then
    ch_id := gen_random_uuid();
    insert into public.workspace_channels (
      id,
      workspace_id,
      name,
      slug,
      slug_hash,
      description,
      created_by,
      visibility
    )
    values (
      ch_id,
      new.id,
      'general',
      'general',
      replace(ch_id::text, '-', ''),
      null,
      new.owner_id,
      'private'
    );
  end if;

  return new;
end;
$$;

drop trigger if exists workspaces_provision_defaults on public.workspaces;
create trigger workspaces_provision_defaults
after insert on public.workspaces
for each row
execute procedure public.provision_workspace_defaults();

notify pgrst, 'reload schema';

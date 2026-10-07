-- DARKE v1 Phase 76 — Workspace description + default Channel 1
-- Run after phase75.sql. Workspace default name stays Workspace 1.

alter table public.workspaces
  add column if not exists description text;

alter table public.workspaces
  drop constraint if exists workspaces_description_len;
alter table public.workspaces
  add constraint workspaces_description_len
  check (
    description is null
    or char_length(btrim(description)) <= 200
  );

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
  values (new.id, new.owner_id, 'owner')
  on conflict (workspace_id, user_id) do nothing;
  insert into public.workspace_channels (workspace_id, name, slug, description, created_by)
  values (new.id, 'Channel 1', 'channel-1', null, new.owner_id)
  on conflict (workspace_id, slug) do nothing
  returning id into ch_id;
  if ch_id is not null then
    insert into public.beeps (user_id, content, workspace_id, channel_id)
    values (new.owner_id, 'Channel 1', new.id, ch_id);
  end if;
  return new;
end;
$$;

update public.workspace_channels
set name = 'Channel 1',
    slug = 'channel-1'
where slug in ('general', 'workspace-1')
  and not exists (
    select 1 from public.workspace_channels x
    where x.workspace_id = workspace_channels.workspace_id
      and x.slug = 'channel-1'
  );

update public.workspace_channels
set name = 'Channel 1'
where slug in ('general', 'workspace-1', 'channel-1')
  and name in ('general', 'Workspace 1', 'Workspace channel')
  and name is distinct from 'Channel 1';

insert into public.beeps (user_id, content, workspace_id, channel_id)
select w.owner_id,
       coalesce(nullif(btrim(c.description), ''), c.name),
       c.workspace_id,
       c.id
from public.workspace_channels c
join public.workspaces w on w.id = c.workspace_id
where not exists (
  select 1 from public.beeps b
  where b.channel_id = c.id
);

notify pgrst, 'reload schema';

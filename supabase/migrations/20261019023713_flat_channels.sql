-- New servers start with a flat channel list (no categories), like Discord;
-- categories only exist once someone creates one and drags channels into it.

create or replace function public.create_server(p_name text, p_icon_url text default null)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  srv uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  insert into public.servers (name, icon_url, owner_id)
  values (trim(p_name), p_icon_url, auth.uid())
  returning id into srv;

  insert into public.server_members (server_id, user_id) values (srv, auth.uid());

  insert into public.roles (server_id, name, permissions, is_default, position)
  values (srv, '@everyone', 70372929, true, 0);

  insert into public.channels (server_id, type, name, position)
  values
    (srv, 'text', 'geral', 0),
    (srv, 'voice', 'Geral', 1);

  return srv;
end;
$$;

-- Drop the two categories the previous version created automatically (only
-- when they still have their original names); their channels become loose.
delete from public.channels c
using public.servers s
where c.server_id = s.id
  and c.type = 'category'
  and c.name in ('Canais de texto', 'Canais de voz')
  and c.created_at - s.created_at < interval '5 seconds';

-- Persist a whole new channel order in one call (drag & drop).
create or replace function public.reorder_channels(p_server uuid, p_layout jsonb)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not coalesce(public.has_permission(p_server, 16), false) then
    raise exception 'missing permission' using errcode = '42501';
  end if;

  update public.channels c
  set position = (item ->> 'position')::int,
      parent_id = nullif(item ->> 'parent_id', '')::uuid
  from jsonb_array_elements(p_layout) item
  where c.id = (item ->> 'id')::uuid
    and c.server_id = p_server;
end;
$$;

revoke execute on function public.reorder_channels(uuid, jsonb) from anon, public;
grant execute on function public.reorder_channels(uuid, jsonb) to authenticated;

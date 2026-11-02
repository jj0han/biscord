-- System messages, like Discord: every server has a system channel (the
-- first text channel by default, changeable in the server settings) where
-- Biscord posts "X entrou no servidor" when someone joins.

alter table public.servers
  add column system_channel_id uuid references public.channels (id) on delete set null;

alter table public.messages
  add column type text not null default 'default'
    check (type in ('default', 'member_join'));

update public.servers s
set system_channel_id = (
  select c.id from public.channels c
  where c.server_id = s.id and c.type = 'text'
  order by c.position, c.created_at
  limit 1
);

grant update (system_channel_id) on public.servers to authenticated;

-- the system channel must be one of the server's own text channels
create or replace function public.servers_before_update()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.system_channel_id is distinct from old.system_channel_id
     and new.system_channel_id is not null
     and not exists (
       select 1 from public.channels c
       where c.id = new.system_channel_id
         and c.server_id = new.id
         and c.type = 'text'
     ) then
    raise exception 'invalid system channel';
  end if;
  return new;
end;
$$;

create trigger servers_before_update
  before update on public.servers
  for each row execute function public.servers_before_update();

revoke execute on function public.servers_before_update() from public, anon, authenticated;

create or replace function public.create_server(p_name text, p_icon_url text default null)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  srv uuid;
  general uuid;
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
  values (srv, 'text', 'geral', 0)
  returning id into general;

  insert into public.channels (server_id, type, name, position)
  values (srv, 'voice', 'Geral', 1);

  update public.servers set system_channel_id = general where id = srv;

  return srv;
end;
$$;

-- Imported history can arrive out of order: never move these backwards.
create or replace function public.messages_after_insert()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  update public.channels
  set last_message_at = greatest(coalesce(last_message_at, new.created_at), new.created_at)
  where id = new.channel_id;

  if new.type = 'default' then
    insert into public.read_states (user_id, channel_id, last_read_at)
    values (new.author_id, new.channel_id, new.created_at)
    on conflict (user_id, channel_id)
    do update set last_read_at = greatest(public.read_states.last_read_at, excluded.last_read_at);
  end if;

  return new;
end;
$$;

-- Users can't edit system messages (or forge them: `type` isn't insertable).
drop policy "authors edit messages" on public.messages;
create policy "authors edit messages" on public.messages
  for update to authenticated
  using (author_id = auth.uid() and type = 'default')
  with check (author_id = auth.uid() and type = 'default');

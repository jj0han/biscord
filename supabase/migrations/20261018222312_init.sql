-- Biscord initial schema
-- Servers, channels, roles, messages, reactions, invites, DMs, friendships.
-- Permission bits mirror Discord's values so the mental model carries over.

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  discord_id text unique,
  username text not null,
  display_name text,
  avatar_url text,
  banner_url text,
  banner_color text,
  accent_color integer,
  avatar_decoration_url text,
  guild_tag text,
  guild_tag_badge_url text,
  status text not null default 'online'
    check (status in ('online', 'idle', 'dnd', 'invisible')),
  custom_status text check (char_length(custom_status) <= 128),
  synced_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.servers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 100),
  icon_url text,
  owner_id uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);

create table public.server_members (
  server_id uuid not null references public.servers (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  nickname text check (char_length(nickname) <= 32),
  joined_at timestamptz not null default now(),
  primary key (server_id, user_id)
);

create table public.server_bans (
  server_id uuid not null references public.servers (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  reason text,
  created_at timestamptz not null default now(),
  primary key (server_id, user_id)
);

create table public.roles (
  id uuid primary key default gen_random_uuid(),
  server_id uuid not null references public.servers (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  color integer not null default 0,
  position integer not null default 0,
  permissions bigint not null default 0,
  hoist boolean not null default false,
  mentionable boolean not null default false,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

create unique index roles_one_default_per_server
  on public.roles (server_id) where is_default;

create table public.member_roles (
  server_id uuid not null,
  user_id uuid not null,
  role_id uuid not null references public.roles (id) on delete cascade,
  primary key (user_id, role_id),
  foreign key (server_id, user_id)
    references public.server_members (server_id, user_id) on delete cascade
);

create table public.channels (
  id uuid primary key default gen_random_uuid(),
  server_id uuid references public.servers (id) on delete cascade,
  type text not null
    check (type in ('text', 'voice', 'category', 'dm', 'group_dm')),
  name text check (char_length(name) <= 100),
  topic text check (char_length(topic) <= 1024),
  position integer not null default 0,
  parent_id uuid references public.channels (id) on delete set null,
  owner_id uuid references public.profiles (id),
  last_message_at timestamptz,
  created_at timestamptz not null default now(),
  check (
    (server_id is null and type in ('dm', 'group_dm'))
    or (server_id is not null and type in ('text', 'voice', 'category'))
  )
);

create index channels_server_idx on public.channels (server_id, position);

create table public.channel_recipients (
  channel_id uuid not null references public.channels (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  primary key (channel_id, user_id)
);

create index channel_recipients_user_idx on public.channel_recipients (user_id);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.channels (id) on delete cascade,
  author_id uuid not null default auth.uid() references public.profiles (id),
  content text not null default '' check (char_length(content) <= 4000),
  reply_to_id uuid references public.messages (id) on delete set null,
  attachments jsonb not null default '[]'::jsonb,
  embeds jsonb not null default '[]'::jsonb,
  mentions uuid[] not null default '{}',
  mention_everyone boolean not null default false,
  pinned boolean not null default false,
  edited_at timestamptz,
  created_at timestamptz not null default now()
);

create index messages_channel_created_idx
  on public.messages (channel_id, created_at desc);

create table public.reactions (
  message_id uuid not null references public.messages (id) on delete cascade,
  user_id uuid not null default auth.uid()
    references public.profiles (id) on delete cascade,
  emoji text not null check (char_length(emoji) <= 64),
  channel_id uuid not null references public.channels (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, emoji)
);

create index reactions_channel_idx on public.reactions (channel_id);

create table public.invites (
  code text primary key,
  server_id uuid not null references public.servers (id) on delete cascade,
  inviter_id uuid not null references public.profiles (id) on delete cascade,
  max_uses integer not null default 0,
  uses integer not null default 0,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.friendships (
  requester_id uuid not null references public.profiles (id) on delete cascade,
  addressee_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  primary key (requester_id, addressee_id),
  check (requester_id <> addressee_id)
);

create unique index friendships_pair_idx on public.friendships (
  least(requester_id, addressee_id),
  greatest(requester_id, addressee_id)
);

create table public.blocks (
  user_id uuid not null default auth.uid()
    references public.profiles (id) on delete cascade,
  target_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, target_id)
);

create table public.read_states (
  user_id uuid not null default auth.uid()
    references public.profiles (id) on delete cascade,
  channel_id uuid not null references public.channels (id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (user_id, channel_id)
);

-- ---------------------------------------------------------------------------
-- Permission helpers
-- ---------------------------------------------------------------------------

-- Bits (same values as Discord):
--   CREATE_INSTANT_INVITE 1, KICK_MEMBERS 2, BAN_MEMBERS 4, ADMINISTRATOR 8,
--   MANAGE_CHANNELS 16, MANAGE_GUILD 32, ADD_REACTIONS 64, STREAM 512,
--   VIEW_CHANNEL 1024, SEND_MESSAGES 2048, MANAGE_MESSAGES 8192,
--   EMBED_LINKS 16384, ATTACH_FILES 32768, READ_MESSAGE_HISTORY 65536,
--   MENTION_EVERYONE 131072, CONNECT 1048576, SPEAK 2097152,
--   MUTE_MEMBERS 4194304, CHANGE_NICKNAME 67108864,
--   MANAGE_NICKNAMES 134217728, MANAGE_ROLES 268435456

create or replace function public.is_server_member(p_server uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.server_members m
    where m.server_id = p_server and m.user_id = auth.uid()
  )
$$;

create or replace function public.is_channel_recipient(p_channel uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.channel_recipients cr
    where cr.channel_id = p_channel and cr.user_id = auth.uid()
  )
$$;

create or replace function public.member_permissions(
  p_server uuid,
  p_user uuid default auth.uid()
)
returns bigint
language sql stable security definer set search_path = ''
as $$
  select case
    when exists (
      select 1 from public.servers s
      where s.id = p_server and s.owner_id = p_user
    ) then -1::bigint
    when not exists (
      select 1 from public.server_members m
      where m.server_id = p_server and m.user_id = p_user
    ) then 0::bigint
    else coalesce((
      select bit_or(r.permissions) from public.roles r
      where r.server_id = p_server
        and (
          r.is_default
          or r.id in (
            select mr.role_id from public.member_roles mr
            where mr.server_id = p_server and mr.user_id = p_user
          )
        )
    ), 0)
  end
$$;

create or replace function public.has_permission(p_server uuid, p_perm bigint)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select (perms & 8) = 8 or (perms & p_perm) = p_perm
  from (select public.member_permissions(p_server) as perms) p
  where perms <> 0
$$;

create or replace function public.can_view_channel(p_channel uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((
    select case
      when c.server_id is null then exists (
        select 1 from public.channel_recipients cr
        where cr.channel_id = c.id and cr.user_id = auth.uid()
      )
      else coalesce(public.has_permission(c.server_id, 1024), false)
    end
    from public.channels c where c.id = p_channel
  ), false)
$$;

create or replace function public.can_send_message(p_channel uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((
    select case
      when c.type = 'dm' then exists (
        select 1 from public.channel_recipients me
        where me.channel_id = c.id and me.user_id = auth.uid()
      ) and not exists (
        select 1 from public.channel_recipients other
        join public.blocks b
          on (b.user_id = other.user_id and b.target_id = auth.uid())
          or (b.user_id = auth.uid() and b.target_id = other.user_id)
        where other.channel_id = c.id and other.user_id <> auth.uid()
      )
      when c.type = 'group_dm' then exists (
        select 1 from public.channel_recipients me
        where me.channel_id = c.id and me.user_id = auth.uid()
      )
      when c.type = 'text' then
        coalesce(public.has_permission(c.server_id, 1024 | 2048), false)
      else false
    end
    from public.channels c where c.id = p_channel
  ), false)
$$;

create or replace function public.channel_permission(p_channel uuid, p_perm bigint)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((
    select case
      when c.server_id is null then exists (
        select 1 from public.channel_recipients cr
        where cr.channel_id = c.id and cr.user_id = auth.uid()
      )
      else coalesce(public.has_permission(c.server_id, p_perm), false)
    end
    from public.channels c where c.id = p_channel
  ), false)
$$;

create or replace function public.shares_server_with(p_user uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.server_members a
    join public.server_members b on b.server_id = a.server_id
    where a.user_id = auth.uid() and b.user_id = p_user
  )
$$;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

-- Copy the Discord identity into a Biscord profile on first sign-in.
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  base_username text;
begin
  base_username := lower(split_part(
    coalesce(meta ->> 'name', meta ->> 'user_name', meta ->> 'full_name',
      'user' || substr(new.id::text, 1, 8)),
    '#', 1
  ));

  insert into public.profiles (id, discord_id, username, display_name, avatar_url)
  values (
    new.id,
    coalesce(meta ->> 'provider_id', meta ->> 'sub'),
    base_username,
    coalesce(meta -> 'custom_claims' ->> 'global_name', meta ->> 'full_name'),
    coalesce(meta ->> 'avatar_url', meta ->> 'picture')
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Derive mentions server-side so clients can't spoof them.
create or replace function public.messages_before_write()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  srv uuid;
begin
  if tg_op = 'UPDATE' then
    if new.content is distinct from old.content then
      new.edited_at := now();
      -- links may have changed; the unfurl function repopulates them
      new.embeds := '[]'::jsonb;
    else
      return new;
    end if;
  end if;

  new.mentions := coalesce(array(
    select distinct (m[1])::uuid
    from regexp_matches(
      new.content,
      '<@!?([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})>',
      'g'
    ) as m
  ), '{}');

  select c.server_id into srv from public.channels c where c.id = new.channel_id;

  new.mention_everyone := new.content ~ '(^|\s)@(everyone|here)(\s|$)'
    and (srv is null or coalesce(public.has_permission(srv, 131072), false));

  return new;
end;
$$;

create trigger messages_before_write
  before insert or update on public.messages
  for each row execute function public.messages_before_write();

create or replace function public.messages_after_insert()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  update public.channels set last_message_at = new.created_at
  where id = new.channel_id;

  insert into public.read_states (user_id, channel_id, last_read_at)
  values (new.author_id, new.channel_id, new.created_at)
  on conflict (user_id, channel_id)
  do update set last_read_at = excluded.last_read_at;

  return new;
end;
$$;

create trigger messages_after_insert
  after insert on public.messages
  for each row execute function public.messages_after_insert();

create or replace function public.reactions_before_insert()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  select m.channel_id into new.channel_id
  from public.messages m where m.id = new.message_id;
  return new;
end;
$$;

create trigger reactions_before_insert
  before insert on public.reactions
  for each row execute function public.reactions_before_insert();

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

create or replace function public.create_server(p_name text, p_icon_url text default null)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  srv uuid;
  text_category uuid;
  voice_category uuid;
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
  values (srv, 'category', 'Canais de texto', 0)
  returning id into text_category;

  insert into public.channels (server_id, type, name, position)
  values (srv, 'category', 'Canais de voz', 1)
  returning id into voice_category;

  insert into public.channels (server_id, type, name, parent_id, position)
  values
    (srv, 'text', 'geral', text_category, 0),
    (srv, 'voice', 'Geral', voice_category, 0);

  return srv;
end;
$$;

create or replace function public.create_invite(
  p_server uuid,
  p_max_age_seconds integer default 604800,
  p_max_uses integer default 0
)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  new_code text;
begin
  if not coalesce(public.has_permission(p_server, 1), false) then
    raise exception 'missing permission' using errcode = '42501';
  end if;

  new_code := substr(
    translate(encode(extensions.gen_random_bytes(9), 'base64'), '+/=', 'xyz'),
    1, 8
  );

  insert into public.invites (code, server_id, inviter_id, max_uses, expires_at)
  values (
    new_code, p_server, auth.uid(), greatest(p_max_uses, 0),
    case when p_max_age_seconds > 0
      then now() + make_interval(secs => p_max_age_seconds) end
  );

  return new_code;
end;
$$;

create or replace function public.get_invite(p_code text)
returns table (
  code text,
  server_id uuid,
  server_name text,
  server_icon_url text,
  member_count bigint,
  inviter_name text,
  is_member boolean
)
language sql stable security definer set search_path = ''
as $$
  select
    i.code,
    s.id,
    s.name,
    s.icon_url,
    (select count(*) from public.server_members m where m.server_id = s.id),
    coalesce(p.display_name, p.username),
    public.is_server_member(s.id)
  from public.invites i
  join public.servers s on s.id = i.server_id
  join public.profiles p on p.id = i.inviter_id
  where i.code = p_code
    and (i.expires_at is null or i.expires_at > now())
    and (i.max_uses = 0 or i.uses < i.max_uses)
$$;

create or replace function public.accept_invite(p_code text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  inv public.invites;
begin
  select * into inv from public.invites i
  where i.code = p_code
    and (i.expires_at is null or i.expires_at > now())
    and (i.max_uses = 0 or i.uses < i.max_uses)
  for update;

  if inv is null then
    raise exception 'invalid invite' using errcode = 'P0002';
  end if;

  if exists (
    select 1 from public.server_bans b
    where b.server_id = inv.server_id and b.user_id = auth.uid()
  ) then
    raise exception 'banned' using errcode = '42501';
  end if;

  if not public.is_server_member(inv.server_id) then
    insert into public.server_members (server_id, user_id)
    values (inv.server_id, auth.uid());
    update public.invites set uses = uses + 1 where code = inv.code;
  end if;

  return inv.server_id;
end;
$$;

create or replace function public.ban_member(p_server uuid, p_user uuid, p_reason text default null)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not coalesce(public.has_permission(p_server, 4), false) then
    raise exception 'missing permission' using errcode = '42501';
  end if;
  if exists (select 1 from public.servers s where s.id = p_server and s.owner_id = p_user) then
    raise exception 'cannot ban the owner' using errcode = '42501';
  end if;

  insert into public.server_bans (server_id, user_id, reason)
  values (p_server, p_user, p_reason)
  on conflict do nothing;

  delete from public.server_members where server_id = p_server and user_id = p_user;
end;
$$;

create or replace function public.open_dm(p_user uuid)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  ch uuid;
begin
  if p_user = auth.uid() then
    raise exception 'cannot DM yourself';
  end if;

  select c.id into ch
  from public.channels c
  join public.channel_recipients a on a.channel_id = c.id and a.user_id = auth.uid()
  join public.channel_recipients b on b.channel_id = c.id and b.user_id = p_user
  where c.type = 'dm'
  limit 1;

  if ch is not null then
    return ch;
  end if;

  if not exists (select 1 from public.profiles where id = p_user) then
    raise exception 'user not found' using errcode = 'P0002';
  end if;

  insert into public.channels (type) values ('dm') returning id into ch;
  insert into public.channel_recipients (channel_id, user_id)
  values (ch, auth.uid()), (ch, p_user);

  return ch;
end;
$$;

create or replace function public.create_group_dm(p_users uuid[], p_name text default null)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  ch uuid;
begin
  if coalesce(array_length(p_users, 1), 0) < 2 or array_length(p_users, 1) > 9 then
    raise exception 'group DMs need 3 to 10 members';
  end if;

  insert into public.channels (type, name, owner_id)
  values ('group_dm', nullif(trim(p_name), ''), auth.uid())
  returning id into ch;

  insert into public.channel_recipients (channel_id, user_id)
  select ch, u from (
    select unnest(p_users) as u union select auth.uid()
  ) members
  where exists (select 1 from public.profiles p where p.id = members.u);

  return ch;
end;
$$;

create or replace function public.send_friend_request(p_username text)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  target uuid;
  existing public.friendships;
begin
  select id into target from public.profiles
  where lower(username) = lower(trim(p_username));

  if target is null then
    raise exception 'user not found' using errcode = 'P0002';
  end if;
  if target = auth.uid() then
    raise exception 'cannot add yourself';
  end if;
  if exists (
    select 1 from public.blocks b
    where (b.user_id = target and b.target_id = auth.uid())
       or (b.user_id = auth.uid() and b.target_id = target)
  ) then
    raise exception 'user not found' using errcode = 'P0002';
  end if;

  select * into existing from public.friendships f
  where (f.requester_id = auth.uid() and f.addressee_id = target)
     or (f.requester_id = target and f.addressee_id = auth.uid());

  if existing is null then
    insert into public.friendships (requester_id, addressee_id)
    values (auth.uid(), target);
    return 'pending';
  end if;

  if existing.status = 'pending' and existing.requester_id = target then
    update public.friendships set status = 'accepted'
    where requester_id = target and addressee_id = auth.uid();
    return 'accepted';
  end if;

  return existing.status;
end;
$$;

create or replace function public.respond_friend_request(p_user uuid, p_accept boolean)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if p_accept then
    update public.friendships set status = 'accepted'
    where requester_id = p_user and addressee_id = auth.uid() and status = 'pending';
  else
    delete from public.friendships
    where requester_id = p_user and addressee_id = auth.uid() and status = 'pending';
  end if;
end;
$$;

create or replace function public.remove_friend(p_user uuid)
returns void
language sql security definer set search_path = ''
as $$
  delete from public.friendships
  where (requester_id = auth.uid() and addressee_id = p_user)
     or (requester_id = p_user and addressee_id = auth.uid())
$$;

create or replace function public.block_user(p_user uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  perform public.remove_friend(p_user);
  insert into public.blocks (user_id, target_id) values (auth.uid(), p_user)
  on conflict do nothing;
end;
$$;

create or replace function public.toggle_pin(p_message uuid)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  msg public.messages;
begin
  select * into msg from public.messages where id = p_message;
  if msg is null or not public.channel_permission(msg.channel_id, 8192) then
    raise exception 'missing permission' using errcode = '42501';
  end if;

  update public.messages set pinned = not msg.pinned where id = p_message;
  return not msg.pinned;
end;
$$;

create or replace function public.mark_read(p_channel uuid)
returns void
language sql security definer set search_path = ''
as $$
  insert into public.read_states (user_id, channel_id, last_read_at)
  select auth.uid(), p_channel, now()
  where public.can_view_channel(p_channel)
  on conflict (user_id, channel_id)
  do update set last_read_at = excluded.last_read_at
$$;

-- Unread + mention counts for every channel the caller can see.
create or replace function public.unread_states()
returns table (
  channel_id uuid,
  server_id uuid,
  last_message_at timestamptz,
  last_read_at timestamptz,
  mention_count bigint
)
language sql stable security definer set search_path = ''
as $$
  with visible as (
    select c.id, c.server_id, c.type, c.last_message_at
    from public.channels c
    where c.last_message_at is not null
      and c.type in ('text', 'dm', 'group_dm')
      and (
        (c.server_id is not null and public.is_server_member(c.server_id))
        or exists (
          select 1 from public.channel_recipients cr
          where cr.channel_id = c.id and cr.user_id = auth.uid()
        )
      )
  )
  select
    v.id,
    v.server_id,
    v.last_message_at,
    rs.last_read_at,
    (
      select count(*) from public.messages m
      where m.channel_id = v.id
        and m.author_id <> auth.uid()
        and m.created_at > coalesce(rs.last_read_at, '-infinity'::timestamptz)
        and (
          v.server_id is null
          or auth.uid() = any (m.mentions)
          or m.mention_everyone
        )
    )
  from visible v
  left join public.read_states rs
    on rs.channel_id = v.id and rs.user_id = auth.uid()
$$;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.servers enable row level security;
alter table public.server_members enable row level security;
alter table public.server_bans enable row level security;
alter table public.roles enable row level security;
alter table public.member_roles enable row level security;
alter table public.channels enable row level security;
alter table public.channel_recipients enable row level security;
alter table public.messages enable row level security;
alter table public.reactions enable row level security;
alter table public.invites enable row level security;
alter table public.friendships enable row level security;
alter table public.blocks enable row level security;
alter table public.read_states enable row level security;

-- profiles
create policy "profiles are visible to signed in users" on public.profiles
  for select to authenticated using (true);
create policy "users update their own presence" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- servers
create policy "members see their servers" on public.servers
  for select to authenticated using (public.is_server_member(id));
create policy "managers edit servers" on public.servers
  for update to authenticated
  using (coalesce(public.has_permission(id, 32), false))
  with check (coalesce(public.has_permission(id, 32), false));
create policy "owners delete servers" on public.servers
  for delete to authenticated using (owner_id = auth.uid());

-- server_members
create policy "members see co-members" on public.server_members
  for select to authenticated using (public.is_server_member(server_id));
create policy "members leave or get kicked" on public.server_members
  for delete to authenticated using (
    not exists (
      select 1 from public.servers s
      where s.id = server_id and s.owner_id = user_id
    )
    and (
      user_id = auth.uid()
      or coalesce(public.has_permission(server_id, 2), false)
    )
  );
create policy "nicknames" on public.server_members
  for update to authenticated using (
    (user_id = auth.uid() and coalesce(public.has_permission(server_id, 67108864), false))
    or coalesce(public.has_permission(server_id, 134217728), false)
  );

-- server_bans
create policy "ban managers see bans" on public.server_bans
  for select to authenticated using (coalesce(public.has_permission(server_id, 4), false));
create policy "ban managers lift bans" on public.server_bans
  for delete to authenticated using (coalesce(public.has_permission(server_id, 4), false));

-- roles
create policy "members see roles" on public.roles
  for select to authenticated using (public.is_server_member(server_id));
create policy "role managers create roles" on public.roles
  for insert to authenticated
  with check (coalesce(public.has_permission(server_id, 268435456), false));
create policy "role managers edit roles" on public.roles
  for update to authenticated
  using (coalesce(public.has_permission(server_id, 268435456), false));
create policy "role managers delete roles" on public.roles
  for delete to authenticated
  using (not is_default and coalesce(public.has_permission(server_id, 268435456), false));

-- member_roles
create policy "members see role assignments" on public.member_roles
  for select to authenticated using (public.is_server_member(server_id));
create policy "role managers assign roles" on public.member_roles
  for insert to authenticated with check (
    coalesce(public.has_permission(server_id, 268435456), false)
    and exists (
      select 1 from public.roles r
      where r.id = role_id and r.server_id = member_roles.server_id and not r.is_default
    )
  );
create policy "role managers unassign roles" on public.member_roles
  for delete to authenticated
  using (coalesce(public.has_permission(server_id, 268435456), false));

-- channels
create policy "viewers see channels" on public.channels
  for select to authenticated using (
    case when server_id is null then public.is_channel_recipient(id)
    else coalesce(public.has_permission(server_id, 1024), false) end
  );
create policy "channel managers create channels" on public.channels
  for insert to authenticated with check (
    server_id is not null and coalesce(public.has_permission(server_id, 16), false)
  );
create policy "channel managers edit channels" on public.channels
  for update to authenticated using (
    (server_id is not null and coalesce(public.has_permission(server_id, 16), false))
    or (type = 'group_dm' and public.is_channel_recipient(id))
  );
create policy "channel managers delete channels" on public.channels
  for delete to authenticated using (
    server_id is not null and coalesce(public.has_permission(server_id, 16), false)
  );

-- channel_recipients
create policy "recipients see each other" on public.channel_recipients
  for select to authenticated using (public.is_channel_recipient(channel_id));
create policy "leave group dms" on public.channel_recipients
  for delete to authenticated using (
    user_id = auth.uid()
    and exists (
      select 1 from public.channels c where c.id = channel_id and c.type = 'group_dm'
    )
  );

-- messages
create policy "viewers read messages" on public.messages
  for select to authenticated using (
    public.can_view_channel(channel_id)
    and public.channel_permission(channel_id, 65536)
  );
create policy "senders post messages" on public.messages
  for insert to authenticated with check (
    author_id = auth.uid()
    and public.can_send_message(channel_id)
    and (attachments = '[]'::jsonb or public.channel_permission(channel_id, 32768))
  );
create policy "authors edit messages" on public.messages
  for update to authenticated
  using (author_id = auth.uid())
  with check (author_id = auth.uid());
create policy "authors or moderators delete messages" on public.messages
  for delete to authenticated using (
    author_id = auth.uid()
    or exists (
      select 1 from public.channels c
      where c.id = channel_id
        and c.server_id is not null
        and coalesce(public.has_permission(c.server_id, 8192), false)
    )
  );

-- reactions
create policy "viewers see reactions" on public.reactions
  for select to authenticated using (public.can_view_channel(channel_id));
create policy "users react" on public.reactions
  for insert to authenticated with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.messages m
      where m.id = message_id
        and public.can_view_channel(m.channel_id)
        and public.channel_permission(m.channel_id, 64)
    )
  );
create policy "users remove their reactions" on public.reactions
  for delete to authenticated using (
    user_id = auth.uid() or public.channel_permission(channel_id, 8192)
  );

-- invites
create policy "members see invites" on public.invites
  for select to authenticated using (public.is_server_member(server_id));
create policy "inviters or managers revoke invites" on public.invites
  for delete to authenticated using (
    inviter_id = auth.uid() or coalesce(public.has_permission(server_id, 32), false)
  );

-- friendships
create policy "users see their friendships" on public.friendships
  for select to authenticated
  using (requester_id = auth.uid() or addressee_id = auth.uid());
create policy "users cancel their friendships" on public.friendships
  for delete to authenticated
  using (requester_id = auth.uid() or addressee_id = auth.uid());

-- blocks
create policy "users see their blocks" on public.blocks
  for select to authenticated using (user_id = auth.uid());
create policy "users unblock" on public.blocks
  for delete to authenticated using (user_id = auth.uid());

-- read_states
create policy "users own their read states" on public.read_states
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Column-level privileges (RLS decides rows, grants decide columns)
-- ---------------------------------------------------------------------------

revoke all on all tables in schema public from anon;
revoke insert, update on all tables in schema public from authenticated;

grant update (status, custom_status) on public.profiles to authenticated;
grant update (name, icon_url) on public.servers to authenticated;
grant update (nickname) on public.server_members to authenticated;
grant insert (server_id, name, color, position, permissions, hoist, mentionable)
  on public.roles to authenticated;
grant update (name, color, position, permissions, hoist, mentionable)
  on public.roles to authenticated;
grant insert (server_id, user_id, role_id) on public.member_roles to authenticated;
grant insert (server_id, type, name, topic, position, parent_id)
  on public.channels to authenticated;
grant update (name, topic, position, parent_id) on public.channels to authenticated;
grant insert (id, channel_id, author_id, content, reply_to_id, attachments)
  on public.messages to authenticated;
grant update (content) on public.messages to authenticated;
grant insert (message_id, user_id, emoji) on public.reactions to authenticated;
grant insert (user_id, channel_id, last_read_at) on public.read_states to authenticated;
grant update (last_read_at) on public.read_states to authenticated;

revoke execute on all functions in schema public from anon, public;
grant execute on all functions in schema public to authenticated;

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------

alter publication supabase_realtime add table
  public.profiles,
  public.servers,
  public.server_members,
  public.roles,
  public.member_roles,
  public.channels,
  public.channel_recipients,
  public.messages,
  public.reactions,
  public.friendships;

-- ---------------------------------------------------------------------------
-- Storage: public buckets with unguessable paths, uploads scoped to the user
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit)
values
  ('attachments', 'attachments', true, 26214400),
  ('icons', 'icons', true, 8388608)
on conflict (id) do nothing;

create policy "users upload into their own folder" on storage.objects
  for insert to authenticated with check (
    bucket_id in ('attachments', 'icons')
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "users delete their own uploads" on storage.objects
  for delete to authenticated using (
    bucket_id in ('attachments', 'icons')
    and (storage.foldername(name))[1] = auth.uid()::text
  );

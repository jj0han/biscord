-- Guests, like Discord:
--   * Accounts without Discord linked (anonymous sign-in) can only join
--     servers that allow it; new servers don't (server setting).
--   * An invite can point at a voice channel as a *temporary* (guest) invite:
--     the person only gets that voice channel and is removed when they leave
--     the call, instead of becoming a regular member.
--   * Guest accounts that leave Biscord (sign out) are deleted along with
--     everything they posted.

-- ---------------------------------------------------------------------------
-- Server setting
-- ---------------------------------------------------------------------------

alter table public.servers
  add column allow_guests boolean not null default false;

-- servers that already existed keep accepting guests, as they did until now
update public.servers set allow_guests = true;

grant update (allow_guests) on public.servers to authenticated;

-- ---------------------------------------------------------------------------
-- Temporary (voice guest) membership
-- ---------------------------------------------------------------------------

-- non-null: a temporary member who can only use this voice channel
alter table public.server_members
  add column guest_channel_id uuid references public.channels (id) on delete cascade;

alter table public.invites
  add column channel_id uuid references public.channels (id) on delete cascade,
  add column temporary boolean not null default false;

create or replace function public.is_anonymous_user()
returns boolean
language sql stable set search_path = ''
as $$
  select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)
$$;

-- the voice channel a temporary member is limited to (null for everyone else)
create or replace function public.guest_channel(p_server uuid)
returns uuid
language sql stable security definer set search_path = ''
as $$
  select m.guest_channel_id from public.server_members m
  where m.server_id = p_server and m.user_id = auth.uid()
$$;

-- temporary members get no server-wide permission at all
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
        and m.guest_channel_id is null
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

-- ...except view, connect, speak and stream in their voice channel
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
        or c.id = public.guest_channel(c.server_id)
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
        or (
          c.id = public.guest_channel(c.server_id)
          and (p_perm & ~(1024 | 512 | 1048576 | 2097152)::bigint) = 0
        )
    end
    from public.channels c where c.id = p_channel
  ), false)
$$;

drop policy "viewers see channels" on public.channels;
create policy "viewers see channels" on public.channels
  for select to authenticated using (
    case when server_id is null then public.is_channel_recipient(id)
    else coalesce(public.has_permission(server_id, 1024), false)
      or id = public.guest_channel(server_id) end
  );

drop policy "members see invites" on public.invites;
create policy "members see invites" on public.invites
  for select to authenticated using (public.member_permissions(server_id) <> 0);

-- unread counters only for channels the caller can actually see
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
        (c.server_id is not null and public.is_server_member(c.server_id)
          and public.can_view_channel(c.id))
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
        and m.type = 'default'
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

-- getting a role (or accepting a regular invite) makes a guest a member
create or replace function public.member_roles_after_insert()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  update public.server_members set guest_channel_id = null
  where server_id = new.server_id and user_id = new.user_id
    and guest_channel_id is not null;
  return new;
end;
$$;

create trigger member_roles_after_insert
  after insert on public.member_roles
  for each row execute function public.member_roles_after_insert();

-- ---------------------------------------------------------------------------
-- "X entrou no servidor" in the system channel
-- ---------------------------------------------------------------------------

create or replace function public.server_members_after_write()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  ch uuid;
begin
  -- temporary guests don't count as joining; becoming a member does
  if new.guest_channel_id is not null then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.guest_channel_id is null then
    return new;
  end if;
  -- the Discord sync brings Discord's own join messages instead
  if auth.role() = 'service_role' then
    return new;
  end if;

  select s.system_channel_id into ch
  from public.servers s
  where s.id = new.server_id and s.owner_id <> new.user_id;

  if ch is not null then
    insert into public.messages (channel_id, author_id, type)
    values (ch, new.user_id, 'member_join');
  end if;
  return new;
end;
$$;

create trigger server_members_after_write
  after insert or update of guest_channel_id on public.server_members
  for each row execute function public.server_members_after_write();

-- ---------------------------------------------------------------------------
-- Invites
-- ---------------------------------------------------------------------------

drop function public.create_invite(uuid, integer, integer);
create or replace function public.create_invite(
  p_server uuid,
  p_max_age_seconds integer default 604800,
  p_max_uses integer default 0,
  p_channel uuid default null,
  p_temporary boolean default false
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
  if p_channel is not null and not exists (
    select 1 from public.channels c
    where c.id = p_channel and c.server_id = p_server
      and c.type in ('text', 'voice')
  ) then
    raise exception 'invalid channel';
  end if;
  if p_temporary and not exists (
    select 1 from public.channels c where c.id = p_channel and c.type = 'voice'
  ) then
    raise exception 'temporary invites need a voice channel';
  end if;

  new_code := substr(
    translate(encode(extensions.gen_random_bytes(9), 'base64'), '+/=', 'xyz'),
    1, 8
  );

  insert into public.invites (code, server_id, inviter_id, max_uses, expires_at, channel_id, temporary)
  values (
    new_code, p_server, auth.uid(), greatest(p_max_uses, 0),
    case when p_max_age_seconds > 0
      then now() + make_interval(secs => p_max_age_seconds) end,
    p_channel, p_temporary
  );

  return new_code;
end;
$$;

drop function public.get_invite(text);
create or replace function public.get_invite(p_code text)
returns table (
  code text,
  server_id uuid,
  server_name text,
  server_icon_url text,
  member_count bigint,
  inviter_name text,
  is_member boolean,
  channel_id uuid,
  channel_name text,
  channel_type text,
  temporary boolean,
  allow_guests boolean
)
language sql stable security definer set search_path = ''
as $$
  select
    i.code,
    s.id,
    s.name,
    s.icon_url,
    (select count(*) from public.server_members m
      where m.server_id = s.id and m.guest_channel_id is null),
    coalesce(p.display_name, p.username),
    exists (
      select 1 from public.server_members m
      where m.server_id = s.id and m.user_id = auth.uid()
        and m.guest_channel_id is null
    ),
    c.id,
    c.name,
    c.type,
    i.temporary,
    s.allow_guests
  from public.invites i
  join public.servers s on s.id = i.server_id
  join public.profiles p on p.id = i.inviter_id
  left join public.channels c on c.id = i.channel_id
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
  srv public.servers;
  membership public.server_members;
begin
  select * into inv from public.invites i
  where i.code = p_code
    and (i.expires_at is null or i.expires_at > now())
    and (i.max_uses = 0 or i.uses < i.max_uses)
  for update;

  if inv is null then
    raise exception 'invalid invite' using errcode = 'P0002';
  end if;

  select * into srv from public.servers s where s.id = inv.server_id;

  if public.is_anonymous_user() and not srv.allow_guests then
    raise exception 'guests not allowed' using errcode = '42501', hint = 'guests_not_allowed';
  end if;

  if exists (
    select 1 from public.server_bans b
    where b.server_id = inv.server_id and b.user_id = auth.uid()
  ) then
    raise exception 'banned' using errcode = '42501';
  end if;

  select * into membership from public.server_members m
  where m.server_id = inv.server_id and m.user_id = auth.uid();

  if inv.temporary then
    if membership is null then
      insert into public.server_members (server_id, user_id, guest_channel_id)
      values (inv.server_id, auth.uid(), inv.channel_id);
      update public.invites set uses = uses + 1 where code = inv.code;
    elsif membership.guest_channel_id is not null then
      update public.server_members set guest_channel_id = inv.channel_id
      where server_id = inv.server_id and user_id = auth.uid();
    end if;
  elsif membership is null then
    insert into public.server_members (server_id, user_id)
    values (inv.server_id, auth.uid());
    update public.invites set uses = uses + 1 where code = inv.code;
  elsif membership.guest_channel_id is not null then
    update public.server_members set guest_channel_id = null
    where server_id = inv.server_id and user_id = auth.uid();
    update public.invites set uses = uses + 1 where code = inv.code;
  end if;

  return inv.server_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Deleting guest accounts
-- ---------------------------------------------------------------------------

-- Removes an account and everything that doesn't cascade on its own.
create or replace function public.purge_user(p_user uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  delete from public.servers where owner_id = p_user;
  update public.channels set owner_id = null where owner_id = p_user;
  delete from public.messages where author_id = p_user;
  delete from auth.users where id = p_user;
end;
$$;

-- A guest leaving Biscord (signing out) can never get back into the account.
create or replace function public.delete_guest_account()
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null or not public.is_anonymous_user() then
    raise exception 'only guest accounts can be deleted this way';
  end if;
  perform public.purge_user(auth.uid());
end;
$$;

-- Safety net for guests who left without the app getting to delete them
-- (signed out elsewhere, sessions revoked) or simply never came back, and for
-- temporary voice guests whose app closed mid-call.
create or replace function public.cleanup_guests()
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  guest uuid;
begin
  for guest in
    select u.id from auth.users u
    where u.is_anonymous
      and u.created_at < now() - interval '15 minutes'
      and not exists (
        select 1 from auth.sessions se
        where se.user_id = u.id
          and (se.not_after is null or se.not_after > now())
          and coalesce(se.refreshed_at at time zone 'utc', se.updated_at, se.created_at)
            > now() - interval '30 days'
      )
  loop
    perform public.purge_user(guest);
  end loop;

  delete from public.server_members
  where guest_channel_id is not null
    and joined_at < now() - interval '1 day';
end;
$$;

revoke execute on function public.is_anonymous_user() from public, anon;
revoke execute on function public.guest_channel(uuid) from public, anon;
revoke execute on function public.member_roles_after_insert() from public, anon, authenticated;
revoke execute on function public.server_members_after_write() from public, anon, authenticated;
revoke execute on function public.create_invite(uuid, integer, integer, uuid, boolean) from public, anon;
revoke execute on function public.get_invite(text) from public, anon;
revoke execute on function public.purge_user(uuid) from public, anon, authenticated;
revoke execute on function public.delete_guest_account() from public, anon;
revoke execute on function public.cleanup_guests() from public, anon, authenticated;
grant execute on function public.is_anonymous_user() to authenticated;
grant execute on function public.guest_channel(uuid) to authenticated;
grant execute on function public.create_invite(uuid, integer, integer, uuid, boolean) to authenticated;
grant execute on function public.get_invite(text) to authenticated;
grant execute on function public.delete_guest_account() to authenticated;

create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;

select cron.schedule(
  'biscord-cleanup-guests',
  '*/10 * * * *',
  'select public.cleanup_guests()'
);

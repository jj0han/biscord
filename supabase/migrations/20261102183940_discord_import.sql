-- Importing a Discord server (through the Biscord bot) and optionally keeping
-- it in sync, Discord -> Biscord. The `discord-import` edge function does the
-- work; these tables remember which Discord object became which Biscord row.

create table public.discord_links (
  server_id uuid primary key references public.servers (id) on delete cascade,
  guild_id text not null unique,
  imported_by uuid references public.profiles (id) on delete set null,
  -- keep pulling changes from Discord
  sync boolean not null default false,
  -- messages per channel brought over by the first import (-1 = all)
  history_limit integer not null default 500,
  backfill_done boolean not null default false,
  last_synced_at timestamptz,
  last_error text,
  -- one worker at a time per server
  locked_until timestamptz,
  created_at timestamptz not null default now()
);

create table public.discord_objects (
  server_id uuid not null references public.servers (id) on delete cascade,
  kind text not null check (kind in ('channel', 'role', 'member')),
  discord_id text not null,
  biscord_id uuid not null,
  -- text channels: newest imported message id (where the sync resumes)
  cursor text,
  -- text channels: oldest imported message id and whether the backfill is done
  oldest text,
  backfilled boolean not null default false,
  imported_count integer not null default 0,
  primary key (server_id, kind, discord_id)
);

create index discord_objects_biscord_idx on public.discord_objects (biscord_id);

alter table public.messages
  add column discord_id text unique,
  -- author of an imported message who has no Biscord account (yet):
  -- {discord_id, name, avatar_url}; author_id then holds the importer
  add column imported_author jsonb,
  -- Discord id of the replied message, until that message is imported too
  add column discord_reply_to text;

create index messages_imported_author_idx
  on public.messages ((imported_author ->> 'discord_id'))
  where imported_author is not null;
create index messages_discord_reply_idx
  on public.messages (discord_reply_to)
  where discord_reply_to is not null;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.discord_links enable row level security;
alter table public.discord_objects enable row level security;

create policy "members see the discord link" on public.discord_links
  for select to authenticated using (public.is_server_member(server_id));
create policy "admins toggle the sync" on public.discord_links
  for update to authenticated
  using (coalesce(public.has_permission(server_id, 8), false))
  with check (coalesce(public.has_permission(server_id, 8), false));
create policy "admins unlink" on public.discord_links
  for delete to authenticated
  using (coalesce(public.has_permission(server_id, 8), false));

revoke all on public.discord_links from anon;
revoke all on public.discord_objects from anon, authenticated;
revoke insert, update on public.discord_links from authenticated;
grant update (sync) on public.discord_links to authenticated;

-- imported messages can't be edited or deleted as if the importer wrote them
drop policy "authors edit messages" on public.messages;
create policy "authors edit messages" on public.messages
  for update to authenticated
  using (author_id = auth.uid() and type = 'default' and imported_author is null)
  with check (author_id = auth.uid() and type = 'default' and imported_author is null);

drop policy "authors or moderators delete messages" on public.messages;
create policy "authors or moderators delete messages" on public.messages
  for delete to authenticated using (
    (author_id = auth.uid() and imported_author is null)
    or exists (
      select 1 from public.channels c
      where c.id = channel_id
        and c.server_id is not null
        and coalesce(public.has_permission(c.server_id, 8192), false)
    )
  );

alter publication supabase_realtime add table public.discord_links;

-- ---------------------------------------------------------------------------
-- Someone who joins Biscord with Discord takes over their imported messages
-- ---------------------------------------------------------------------------

create or replace function public.profiles_claim_imported()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.discord_id is not null
     and (tg_op = 'INSERT' or new.discord_id is distinct from old.discord_id) then
    update public.messages
    set author_id = new.id, imported_author = null
    where imported_author ->> 'discord_id' = new.discord_id;
  end if;
  return new;
end;
$$;

create trigger profiles_claim_imported
  after insert or update of discord_id on public.profiles
  for each row execute function public.profiles_claim_imported();

-- ---------------------------------------------------------------------------
-- Worker helpers (service role only)
-- ---------------------------------------------------------------------------

create or replace function public.discord_claim(p_server uuid, p_seconds integer)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  claimed uuid;
begin
  update public.discord_links
  set locked_until = now() + make_interval(secs => p_seconds)
  where server_id = p_server
    and (locked_until is null or locked_until < now())
  returning server_id into claimed;
  return claimed is not null;
end;
$$;

create or replace function public.discord_release(p_server uuid)
returns void
language sql security definer set search_path = ''
as $$
  update public.discord_links set locked_until = null where server_id = p_server
$$;

-- point replies at messages that were imported after them
create or replace function public.discord_link_replies(p_server uuid)
returns void
language sql security definer set search_path = ''
as $$
  update public.messages m
  set reply_to_id = r.id, discord_reply_to = null
  from public.messages r, public.channels c
  where m.discord_reply_to = r.discord_id
    and c.id = m.channel_id
    and c.server_id = p_server
$$;

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'discord_sync_secret') then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'discord_sync_secret',
      'authenticates the cron job that calls the discord-import function'
    );
  end if;
end;
$$;

create or replace function public.check_cron_secret(p_secret text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from vault.decrypted_secrets
    where name = 'discord_sync_secret' and decrypted_secret = p_secret
  )
$$;

revoke execute on function public.profiles_claim_imported() from public, anon, authenticated;
revoke execute on function public.discord_claim(uuid, integer) from public, anon, authenticated;
revoke execute on function public.discord_release(uuid) from public, anon, authenticated;
revoke execute on function public.discord_link_replies(uuid) from public, anon, authenticated;
revoke execute on function public.check_cron_secret(text) from public, anon, authenticated;
grant execute on function public.discord_claim(uuid, integer) to service_role;
grant execute on function public.discord_release(uuid) to service_role;
grant execute on function public.discord_link_replies(uuid) to service_role;
grant execute on function public.check_cron_secret(text) to service_role;

-- ---------------------------------------------------------------------------
-- Cron: every 2 minutes, wake the worker when something needs syncing
-- ---------------------------------------------------------------------------

create extension if not exists pg_net with schema extensions;

create or replace function public.run_discord_sync()
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if exists (select 1 from public.discord_links where sync or not backfill_done) then
    perform net.http_post(
      url := 'https://tdfkgqnqqdocnafuvchn.supabase.co/functions/v1/discord-import',
      body := jsonb_build_object('action', 'cron'),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', (
          select decrypted_secret from vault.decrypted_secrets
          where name = 'discord_sync_secret'
        )
      ),
      timeout_milliseconds := 5000
    );
  end if;
end;
$$;

revoke execute on function public.run_discord_sync() from public, anon, authenticated;

select cron.schedule(
  'biscord-discord-sync',
  '*/2 * * * *',
  'select public.run_discord_sync()'
);

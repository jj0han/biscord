-- Guest accounts (Supabase anonymous sign-in): the profile takes the name the
-- guest typed, plus a short suffix so usernames stay distinguishable. Linking
-- Discord later runs sync-discord-profile, which overwrites these fields.

create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  discord_id text := coalesce(meta ->> 'provider_id', meta ->> 'sub');
  guest_name text := nullif(trim(meta ->> 'guest_name'), '');
  base_username text;
begin
  if discord_id is null then
    base_username := coalesce(
      nullif(regexp_replace(lower(coalesce(guest_name, '')), '[^a-z0-9_.]', '', 'g'), ''),
      'convidado'
    ) || '_' || substr(replace(new.id::text, '-', ''), 1, 4);

    insert into public.profiles (id, username, display_name)
    values (new.id, left(base_username, 32), left(coalesce(guest_name, 'Convidado'), 32))
    on conflict (id) do nothing;
    return new;
  end if;

  base_username := lower(split_part(
    coalesce(meta ->> 'name', meta ->> 'user_name', meta ->> 'full_name',
      'user' || substr(new.id::text, 1, 8)),
    '#', 1
  ));

  insert into public.profiles (id, discord_id, username, display_name, avatar_url)
  values (
    new.id,
    discord_id,
    base_username,
    coalesce(meta -> 'custom_claims' ->> 'global_name', meta ->> 'full_name'),
    coalesce(meta ->> 'avatar_url', meta ->> 'picture')
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

revoke execute on function public.handle_new_user() from authenticated, anon, public;

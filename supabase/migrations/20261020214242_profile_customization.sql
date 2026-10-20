-- Users can customize their profile beyond the Discord sync. Fields they
-- change are listed in `overrides`, and a later Discord sync leaves those
-- alone unless the user asks to overwrite them.
alter table public.profiles
  add column bio text check (char_length(bio) <= 190),
  add column overrides text[] not null default '{}';

create or replace function public.update_my_profile(patch jsonb)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  storage_prefix text := 'https://tdfkgqnqqdocnafuvchn.supabase.co/storage/v1/object/public/profiles/' || auth.uid()::text || '/';
  cdn_prefix text := 'https://cdn.discordapp.com/';
  field text;
  url text;
  synced text[] := array['display_name', 'avatar_url', 'banner_url', 'banner_color', 'display_name_styles'];
  result public.profiles;
begin
  if me is null then
    raise exception 'not authenticated';
  end if;

  for field in select jsonb_object_keys(patch) loop
    if field not in ('display_name', 'avatar_url', 'banner_url', 'banner_color', 'display_name_styles', 'bio') then
      raise exception 'field % cannot be changed', field;
    end if;
  end loop;

  -- images must be the user's own uploads (or Discord's CDN)
  foreach field in array array['avatar_url', 'banner_url'] loop
    if patch ? field and jsonb_typeof(patch -> field) = 'string' then
      url := patch ->> field;
      if not (url like storage_prefix || '%' or url like cdn_prefix || '%') then
        raise exception 'invalid image url';
      end if;
    end if;
  end loop;

  if patch ? 'display_name' and char_length(coalesce(patch ->> 'display_name', '')) > 32 then
    raise exception 'display name too long';
  end if;
  if patch ? 'banner_color' and jsonb_typeof(patch -> 'banner_color') = 'string'
     and (patch ->> 'banner_color') !~ '^#[0-9a-fA-F]{6}$' then
    raise exception 'invalid banner color';
  end if;
  if patch ? 'display_name_styles' and jsonb_typeof(patch -> 'display_name_styles') = 'object'
     and jsonb_array_length(coalesce(patch -> 'display_name_styles' -> 'colors', '[]')) > 4 then
    raise exception 'too many name colors';
  end if;

  update public.profiles p set
    display_name = case when patch ? 'display_name' then nullif(trim(patch ->> 'display_name'), '') else p.display_name end,
    avatar_url = case when patch ? 'avatar_url' then patch ->> 'avatar_url' else p.avatar_url end,
    banner_url = case when patch ? 'banner_url' then patch ->> 'banner_url' else p.banner_url end,
    banner_color = case when patch ? 'banner_color' then patch ->> 'banner_color' else p.banner_color end,
    display_name_styles = case
      when patch ? 'display_name_styles' then nullif(patch -> 'display_name_styles', 'null'::jsonb)
      else p.display_name_styles end,
    bio = case when patch ? 'bio' then nullif(trim(patch ->> 'bio'), '') else p.bio end,
    overrides = (
      select coalesce(array_agg(distinct f), '{}')
      from unnest(
        p.overrides || array(
          select k from jsonb_object_keys(patch) k where k = any (synced)
        )
      ) f
    )
  where p.id = me
  returning * into result;

  return result;
end;
$$;

revoke execute on function public.update_my_profile(jsonb) from public, anon;
grant execute on function public.update_my_profile(jsonb) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'profiles', 'profiles', true, 10485760,
  array['image/png', 'image/jpeg', 'image/gif', 'image/webp']
)
on conflict (id) do nothing;

create policy "users upload profile images into their own folder" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'profiles'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "users delete their own profile images" on storage.objects
  for delete to authenticated using (
    bucket_id = 'profiles'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

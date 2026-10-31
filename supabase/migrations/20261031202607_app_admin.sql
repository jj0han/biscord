-- Biscord-wide administration: who owns the app, app settings (stream
-- quality options) and a self-measured voice usage log, since LiveKit's
-- usage API needs a paid plan.

create table public.app_admins (
  user_id uuid primary key references public.profiles (id) on delete cascade
);
alter table public.app_admins enable row level security;

create or replace function public.is_app_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.app_admins where user_id = auth.uid())
$$;
revoke execute on function public.is_app_admin() from public, anon;
grant execute on function public.is_app_admin() to authenticated;

create policy "admins see the admin list" on public.app_admins
  for select to authenticated using (public.is_app_admin());

insert into public.app_admins (user_id)
values ('489e0f71-d896-4932-b89e-e16a5604f1ce');

-- single-row settings document
create table public.app_settings (
  id boolean primary key default true check (id),
  stream_options jsonb not null default '{
    "resolutions": ["720", "1080", "1440"],
    "frameRates": [15, 30, 60],
    "audio": true
  }'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.app_settings enable row level security;
insert into public.app_settings default values;

create policy "everyone reads app settings" on public.app_settings
  for select to authenticated using (true);
create policy "admins change app settings" on public.app_settings
  for update to authenticated
  using (public.is_app_admin()) with check (public.is_app_admin());

-- one row per minute in a call, reported by each client
create table public.voice_usage (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  seconds integer not null check (seconds between 0 and 600),
  bytes_received bigint not null check (bytes_received between 0 and 10737418240),
  recorded_at timestamptz not null default now()
);
create index voice_usage_recorded_at on public.voice_usage (recorded_at);
alter table public.voice_usage enable row level security;

create policy "users report their own usage" on public.voice_usage
  for insert to authenticated with check (user_id = auth.uid());
create policy "admins read usage" on public.voice_usage
  for select to authenticated using (public.is_app_admin());

-- month totals, per day and per user, for the admin page
create or replace function public.voice_usage_report(p_month date default date_trunc('month', now())::date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  first_day timestamptz := date_trunc('month', p_month::timestamptz);
  next_month timestamptz := first_day + interval '1 month';
  result jsonb;
begin
  if not public.is_app_admin() then
    raise exception 'not allowed';
  end if;

  select jsonb_build_object(
    'seconds', coalesce(sum(seconds), 0),
    'bytes', coalesce(sum(bytes_received), 0),
    'days', coalesce((
      select jsonb_agg(d order by d->>'day')
      from (
        select jsonb_build_object(
          'day', to_char(date_trunc('day', recorded_at), 'YYYY-MM-DD'),
          'seconds', sum(seconds),
          'bytes', sum(bytes_received)
        ) d
        from public.voice_usage
        where recorded_at >= first_day and recorded_at < next_month
        group by date_trunc('day', recorded_at)
      ) days
    ), '[]'::jsonb),
    'users', coalesce((
      select jsonb_agg(u order by (u->>'bytes')::bigint desc)
      from (
        select jsonb_build_object(
          'user_id', user_id,
          'seconds', sum(seconds),
          'bytes', sum(bytes_received)
        ) u
        from public.voice_usage
        where recorded_at >= first_day and recorded_at < next_month
        group by user_id
      ) users
    ), '[]'::jsonb)
  )
  into result
  from public.voice_usage
  where recorded_at >= first_day and recorded_at < next_month;

  return result;
end;
$$;
revoke execute on function public.voice_usage_report(date) from public, anon;
grant execute on function public.voice_usage_report(date) to authenticated;

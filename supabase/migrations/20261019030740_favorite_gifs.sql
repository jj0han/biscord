-- Favorite GIFs (Discord's star in the GIF picker), private to each user.
create table public.favorite_gifs (
  user_id uuid not null default auth.uid()
    references public.profiles (id) on delete cascade,
  url text not null check (char_length(url) <= 2048),
  preview text not null check (char_length(preview) <= 2048),
  width integer not null default 0,
  height integer not null default 0,
  created_at timestamptz not null default now(),
  primary key (user_id, url)
);

alter table public.favorite_gifs enable row level security;

create policy "users see their favorite gifs" on public.favorite_gifs
  for select to authenticated using (user_id = (select auth.uid()));
create policy "users add favorite gifs" on public.favorite_gifs
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "users remove favorite gifs" on public.favorite_gifs
  for delete to authenticated using (user_id = (select auth.uid()));

revoke all on public.favorite_gifs from anon;
revoke insert, update on public.favorite_gifs from authenticated;
grant insert (user_id, url, preview, width, height) on public.favorite_gifs to authenticated;

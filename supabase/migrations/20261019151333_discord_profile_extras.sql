-- More of the Discord profile mirrored by sync-discord-profile.
alter table public.profiles
  add column public_flags integer not null default 0,
  add column premium_type integer not null default 0,
  -- {font_id, effect_id, colors[]} from Discord's display name styles
  add column display_name_styles jsonb,
  -- static image + video of the profile nameplate collectible
  add column nameplate_url text,
  -- public connections: [{type, id, name, verified}]
  add column connections jsonb not null default '[]'::jsonb;

# Biscord

A private, 1:1 Discord-style chat app for a group of friends. You sign in with
Discord (the profile — name, avatar, banner, colors, avatar decoration, server
tag — is imported from it), but servers, channels, messages, friends and calls
live in Biscord itself.

## Stack

| Layer | Choice |
| --- | --- |
| App | Vite + React 19 + TanStack Router/Query, Tailwind v4, shadcn/ui (base-ui) |
| Auth | Supabase Auth with the Discord OAuth provider (`identify email`) |
| Data | Supabase Postgres with row-level security (`supabase/migrations`) |
| Realtime | Supabase Realtime: postgres changes, presence (online/idle/dnd, voice), broadcast (typing) |
| Files | Supabase Storage (`attachments`, `icons` buckets) |
| Link embeds | `unfurl` edge function (Open Graph + YouTube oEmbed, SSRF-guarded) |
| Voice / video / screen share | [LiveKit](https://livekit.io) (Cloud free tier or self-hosted), tokens from the `livekit-token` edge function |
| GIFs | Giphy, proxied by the `gifs` edge function |
| Desktop | [Tauri 2](https://tauri.app) shell around the same web app (custom title bar, deep-link login, native notifications) |
| Icons | [Phosphor](https://phosphoricons.com) (fill weight by default, closest to Discord's glyphs) |

## Features

- Servers: create, icon, invites (expiring links), leave, kick, ban, delete
- Channels: text / voice / categories, topics, collapse, unread dots and mention badges
- Roles: colors, hoisting, Discord-compatible permission bits, enforced in SQL
- Messages: Discord markdown (bold, italics, underline, strike, spoilers, code
  blocks with highlighting, quotes, headings, subtext, masked links, `<t:…>`
  timestamps), mentions (`@user`, `@everyone`, `#channel`, roles), replies,
  editing (↑ edits your last message), deleting (shift-click skips confirm),
  reactions, pins, search, attachments (drag/drop, paste, spoilers), link embeds
- DMs and group DMs, friends (requests, accept/ignore, remove, block)
- Presence (online, idle, do not disturb, invisible) and custom status
- Profile popouts with banner, decoration, server tag, roles
- Voice channels and DM calls with camera, speaking indicator, mute/deafen,
  device selection and a voice timer
- "Go Live" screen share with audio, 720p/1080p/1440p and 15/30/60 FPS
- GIF picker (Giphy) and GIF/image-only messages rendered as media
- Discord's refreshed layout: title bar, floating user card, squircle rail,
  centered settings, full profile modal, "Active now", Dark and Midnight themes
- Desktop notifications + ping for mentions and DMs

## Running locally

Requirements: Node 22+, pnpm, Docker Desktop (for the local Supabase stack).

1. Create a Discord application at <https://discord.com/developers/applications>
   → OAuth2. Add the redirect `http://127.0.0.1:54321/auth/v1/callback`.
2. `cp supabase/.env.example supabase/.env` and fill the Discord client id/secret.
3. Create a LiveKit project (or self-host) and
   `cp supabase/functions/.env.example supabase/functions/.env`.
4. Start everything:

```bash
pnpm install
pnpm db:start          # prints the API URL and the publishable/anon key
pnpm functions:serve   # in another terminal
cp .env.example .env.local   # paste the URL and key from db:start
pnpm dev
```

`pnpm db:reset` re-applies the migrations from scratch.

## Desktop app (Tauri 2)

Requirements: Rust (stable) and, on Windows, WebView2 (preinstalled on 10/11).

```bash
pnpm desktop:dev     # runs Vite + the desktop window
pnpm desktop:build   # produces the installer in src-tauri/target/release/bundle
```

Desktop login opens Discord in the system browser and comes back through the
`biscord://auth/callback` deep link, so add that URL to Supabase Auth's
redirect allow-list. The same code still runs as a regular website.

## Deploying

- **Supabase**: create a project, `supabase link`, `supabase db push`,
  `supabase functions deploy`, `supabase secrets set --env-file supabase/functions/.env`
  (`LIVEKIT_URL`, `LIVEKIT_API_KEY` — starts with `API` —, `LIVEKIT_API_SECRET`,
  `GIPHY_API_KEY`).
  Enable the Discord provider in Auth → Providers and add your site URL to the
  redirect allow-list.
- **Frontend**: any static host (Vercel works out of the box). Set
  `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`, and rewrite all
  paths to `index.html`.

## Known gaps

- Per-channel permission overwrites (roles apply server-wide), role hierarchy
- Markdown lists, custom server emoji, stickers
- Jump-to-message from search/pins results, threads, forum channels
- Link-embed images load straight from the origin (no media proxy)

## Scripts

`pnpm dev` · `pnpm build` · `pnpm lint` · `pnpm format` · `pnpm typecheck` ·
`pnpm desktop:dev` · `pnpm desktop:build` · `pnpm db:start` · `pnpm db:reset` ·
`pnpm functions:serve`

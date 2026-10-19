// Pulls the caller's Discord profile (avatar, banner, colors, decoration,
// server tag) with the OAuth provider token and mirrors it into `profiles`.
import { corsHeaders, json } from "../_shared/cors.ts"
import { adminClient, requireUser } from "../_shared/supabase.ts"

const CDN = "https://cdn.discordapp.com"

type DiscordUser = {
  id: string
  username: string
  global_name: string | null
  avatar: string | null
  banner: string | null
  banner_color: string | null
  accent_color: number | null
  avatar_decoration_data: { asset: string } | null
  primary_guild: {
    identity_guild_id: string | null
    identity_enabled: boolean | null
    tag: string | null
    badge: string | null
  } | null
}

function assetExt(hash: string) {
  return hash.startsWith("a_") ? "gif" : "png"
}

function defaultAvatar(id: string) {
  const index = Number((BigInt(id) >> 22n) % 6n)
  return `${CDN}/embed/avatars/${index}.png`
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  const auth = await requireUser(req)
  if (!auth) {
    return json({ error: "unauthorized" }, 401)
  }

  const { providerToken } = (await req.json().catch(() => ({}))) as {
    providerToken?: string
  }
  if (!providerToken) {
    return json({ error: "missing providerToken" }, 400)
  }

  const res = await fetch("https://discord.com/api/v10/users/@me", {
    headers: { Authorization: `Bearer ${providerToken}` },
  })
  if (!res.ok) {
    return json({ error: "discord rejected the token" }, 502)
  }
  const d = (await res.json()) as DiscordUser

  // The token must belong to the same Discord account linked to this user.
  const linked = auth.user.identities?.some(
    (identity) => identity.provider === "discord" && identity.id === d.id
  )
  if (!linked) {
    return json({ error: "discord account mismatch" }, 403)
  }

  const tag =
    d.primary_guild?.identity_enabled && d.primary_guild.tag
      ? d.primary_guild
      : null

  const profile = {
    discord_id: d.id,
    username: d.username,
    display_name: d.global_name,
    avatar_url: d.avatar
      ? `${CDN}/avatars/${d.id}/${d.avatar}.${assetExt(d.avatar)}?size=256`
      : defaultAvatar(d.id),
    banner_url: d.banner
      ? `${CDN}/banners/${d.id}/${d.banner}.${assetExt(d.banner)}?size=600`
      : null,
    banner_color: d.banner_color,
    accent_color: d.accent_color,
    avatar_decoration_url: d.avatar_decoration_data
      ? `${CDN}/avatar-decoration-presets/${d.avatar_decoration_data.asset}.png?size=160&passthrough=true`
      : null,
    guild_tag: tag?.tag ?? null,
    guild_tag_badge_url:
      tag?.badge && tag.identity_guild_id
        ? `${CDN}/guild-tag-badges/${tag.identity_guild_id}/${tag.badge}.png?size=32`
        : null,
    synced_at: new Date().toISOString(),
  }

  const { data, error } = await adminClient()
    .from("profiles")
    .update(profile)
    .eq("id", auth.user.id)
    .select()
    .single()

  if (error) {
    return json({ error: error.message }, 500)
  }

  return json({ profile: data })
})

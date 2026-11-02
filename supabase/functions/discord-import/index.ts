// Imports a Discord server into Biscord through the Biscord bot and, when
// asked, keeps it in sync (Discord -> Biscord only): name and icon, roles,
// channels and categories, members who have a Biscord account, and message
// history. Private Discord channels (hidden from @everyone) are skipped,
// since Biscord has no per-channel permissions to keep them private.
//
// Actions:
//   guilds  (user)  servers the bot is in where the caller is owner/admin
//   import  (user)  creates the Biscord server; history then arrives in steps
//   step    (user)  continues the import / syncs now, time-boxed
//   cron    (pg_cron, x-cron-secret) works through every linked server
//
// Needs DISCORD_BOT_TOKEN, with the Server Members and Message Content
// intents turned on in the Discord developer portal.
import { corsHeaders, json } from "../_shared/cors.ts"
import { adminClient, requireUser } from "../_shared/supabase.ts"

const API = "https://discord.com/api/v10"
const CDN = "https://cdn.discordapp.com"
const BOT_TOKEN = (Deno.env.get("DISCORD_BOT_TOKEN") ?? "").trim()

const ADMINISTRATOR = 8n
const VIEW_CHANNEL = 1024n
// the Discord permissions Biscord understands (same bit values)
const SUPPORTED_PERMISSIONS = [
  1, 2, 4, 8, 16, 32, 64, 512, 1024, 2048, 8192, 16384, 32768, 65536, 131072,
  1048576, 2097152, 4194304, 67108864, 134217728, 268435456,
].reduce((all, bit) => all | BigInt(bit), 0n)

const MAX_ATTACHMENT_COPY = 8 * 1024 * 1024
// imported message types: default, member join, reply, slash command, context menu
const MESSAGE_TYPES = new Set([0, 7, 19, 20, 23])
// application flags for the privileged intents (full or "limited")
const FLAG_MEMBERS = (1 << 14) | (1 << 15)
const FLAG_CONTENT = (1 << 18) | (1 << 19)

type DUser = {
  id: string
  username: string
  global_name: string | null
  avatar: string | null
  bot?: boolean
}
type DRole = {
  id: string
  name: string
  color: number
  hoist: boolean
  position: number
  permissions: string
  mentionable: boolean
  managed: boolean
}
type DGuild = {
  id: string
  name: string
  icon: string | null
  owner_id: string
  system_channel_id: string | null
  roles: DRole[]
}
type DOverwrite = { id: string; type: number; allow: string; deny: string }
type DChannel = {
  id: string
  type: number
  name: string
  topic?: string | null
  position: number
  parent_id?: string | null
  last_message_id?: string | null
  permission_overwrites?: DOverwrite[]
}
type DMember = { user: DUser; nick: string | null; roles: string[] }
type DAttachment = {
  id: string
  filename: string
  size: number
  url: string
  content_type?: string
  width?: number | null
  height?: number | null
}
type DEmbedMedia = { url?: string; width?: number; height?: number }
type DEmbed = {
  type?: string
  url?: string
  title?: string
  description?: string
  color?: number
  provider?: { name?: string; url?: string }
  author?: { name?: string; url?: string }
  thumbnail?: DEmbedMedia
  image?: DEmbedMedia
  video?: DEmbedMedia
}
type DMessage = {
  id: string
  type: number
  content: string
  author: DUser
  timestamp: string
  edited_timestamp: string | null
  attachments: DAttachment[]
  embeds: DEmbed[]
  mentions: DUser[]
  pinned: boolean
  message_reference?: { message_id?: string }
  sticker_items?: { name: string }[]
}

type Link = {
  server_id: string
  guild_id: string
  imported_by: string | null
  sync: boolean
  history_limit: number
  backfill_done: boolean
}
type ChannelObject = {
  discord_id: string
  biscord_id: string
  cursor: string | null
  oldest: string | null
  backfilled: boolean
  imported_count: number
}

class DiscordError extends Error {
  constructor(
    readonly status: number,
    readonly body: string
  ) {
    super(`Discord ${status}: ${body}`)
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function discord<T>(path: string): Promise<T> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch(`${API}${path}`, {
      headers: { Authorization: `Bot ${BOT_TOKEN}` },
    })
    if (res.status === 429) {
      const body = (await res.json().catch(() => ({}))) as {
        retry_after?: number
      }
      await sleep((body.retry_after ?? 1) * 1000 + 100)
      continue
    }
    if (!res.ok) throw new DiscordError(res.status, await res.text())
    return (await res.json()) as T
  }
  throw new DiscordError(429, "rate limited")
}

const snowflake = (id: string) => BigInt(id)
const byId = (a: { id: string }, b: { id: string }) =>
  snowflake(a.id) < snowflake(b.id) ? -1 : 1

function avatarUrl(user: DUser) {
  if (user.avatar) {
    const ext = user.avatar.startsWith("a_") ? "gif" : "png"
    return `${CDN}/avatars/${user.id}/${user.avatar}.${ext}?size=128`
  }
  const index = Number((snowflake(user.id) >> 22n) % 6n)
  return `${CDN}/embed/avatars/${index}.png`
}

function iconUrl(guild: { id: string; icon: string | null }) {
  if (!guild.icon) return null
  const ext = guild.icon.startsWith("a_") ? "gif" : "png"
  return `${CDN}/icons/${guild.id}/${guild.icon}.${ext}?size=256`
}

function permissionsOf(guild: DGuild, roleIds: string[]) {
  return guild.roles
    .filter((r) => r.id === guild.id || roleIds.includes(r.id))
    .reduce((all, r) => all | BigInt(r.permissions), 0n)
}

async function canImport(guild: DGuild, discordUserId: string) {
  if (guild.owner_id === discordUserId) return true
  const member = await discord<DMember>(
    `/guilds/${guild.id}/members/${discordUserId}`
  ).catch(() => null)
  if (!member) return false
  return (permissionsOf(guild, member.roles) & ADMINISTRATOR) === ADMINISTRATOR
}

/** Hidden from @everyone on Discord: would leak if imported. */
function isPrivate(channel: DChannel, guildId: string) {
  const everyone = channel.permission_overwrites?.find((o) => o.id === guildId)
  return !!everyone && (BigInt(everyone.deny) & VIEW_CHANNEL) === VIEW_CHANNEL
}

function biscordType(type: number) {
  if (type === 0 || type === 5) return "text"
  if (type === 2 || type === 13) return "voice"
  if (type === 4) return "category"
  return null
}

function friendlyError(error: unknown) {
  if (error instanceof DiscordError) {
    if (error.status === 401) {
      return "O token do bot (DISCORD_BOT_TOKEN) é inválido."
    }
    if (error.status === 403) {
      return "O bot do Biscord não tem acesso (ative o Server Members Intent no portal do Discord e confira as permissões do bot)."
    }
    if (error.status === 404) {
      return "O bot do Biscord não está mais neste servidor do Discord."
    }
  }
  return error instanceof Error ? error.message : String(error)
}

// ---------------------------------------------------------------------------
// One linked server
// ---------------------------------------------------------------------------

type Admin = ReturnType<typeof adminClient>

class Worker {
  private profiles = new Map<string, string | null>()
  private channels = new Map<string, string>()
  private roles = new Map<string, string>()
  private fallbackAuthor = ""

  constructor(
    private admin: Admin,
    private link: Link,
    private deadline: number
  ) {}

  private get serverId() {
    return this.link.server_id
  }

  private timeLeft() {
    return this.deadline - Date.now()
  }

  private async objects(kind: "channel" | "role" | "member") {
    const { data } = await this.admin
      .from("discord_objects")
      .select("*")
      .eq("server_id", this.serverId)
      .eq("kind", kind)
    return (data ?? []) as (ChannelObject & { kind: string })[]
  }

  private async map(kind: string, discordId: string, biscordId: string) {
    await this.admin.from("discord_objects").upsert({
      server_id: this.serverId,
      kind,
      discord_id: discordId,
      biscord_id: biscordId,
    })
  }

  private async unmap(kind: string, discordId: string) {
    await this.admin
      .from("discord_objects")
      .delete()
      .eq("server_id", this.serverId)
      .eq("kind", kind)
      .eq("discord_id", discordId)
  }

  /** Biscord profile ids for Discord users (null = no Biscord account). */
  private async resolveProfiles(ids: string[]) {
    const unknown = [...new Set(ids)].filter((id) => !this.profiles.has(id))
    for (let i = 0; i < unknown.length; i += 200) {
      const chunk = unknown.slice(i, i + 200)
      const { data } = await this.admin
        .from("profiles")
        .select("id, discord_id")
        .in("discord_id", chunk)
      for (const id of chunk) this.profiles.set(id, null)
      for (const row of data ?? []) this.profiles.set(row.discord_id, row.id)
    }
  }

  async load() {
    const [channels, roles, server] = await Promise.all([
      this.objects("channel"),
      this.objects("role"),
      this.admin
        .from("servers")
        .select("owner_id")
        .eq("id", this.serverId)
        .single(),
    ])
    for (const c of channels) this.channels.set(c.discord_id, c.biscord_id)
    for (const r of roles) this.roles.set(r.discord_id, r.biscord_id)
    this.fallbackAuthor = this.link.imported_by ?? server.data?.owner_id ?? ""
  }

  // -------------------------------------------------------------------------
  // Structure: server, roles, channels, members
  // -------------------------------------------------------------------------

  async syncStructure(guild: DGuild) {
    await this.syncRoles(guild)
    await this.syncChannels(guild)
    await this.admin
      .from("servers")
      .update({
        name: guild.name.slice(0, 100),
        icon_url: iconUrl(guild),
        system_channel_id: guild.system_channel_id
          ? (this.channels.get(guild.system_channel_id) ?? null)
          : null,
      })
      .eq("id", this.serverId)
    return this.syncMembers(guild)
  }

  private async syncRoles(guild: DGuild) {
    const { data: defaultRole } = await this.admin
      .from("roles")
      .select("id")
      .eq("server_id", this.serverId)
      .eq("is_default", true)
      .single()

    const seen = new Set<string>()
    for (const role of guild.roles) {
      const permissions = Number(
        BigInt(role.permissions) & SUPPORTED_PERMISSIONS
      )
      if (role.id === guild.id) {
        if (defaultRole) {
          await this.admin
            .from("roles")
            .update({ permissions })
            .eq("id", defaultRole.id)
        }
        continue
      }
      // bot/integration roles belong to Discord apps, not people
      if (role.managed) continue
      seen.add(role.id)
      const row = {
        name: role.name.slice(0, 100) || "cargo",
        color: role.color,
        hoist: role.hoist,
        mentionable: role.mentionable,
        position: role.position,
        permissions,
      }
      const existing = this.roles.get(role.id)
      if (existing) {
        await this.admin.from("roles").update(row).eq("id", existing)
      } else {
        const { data } = await this.admin
          .from("roles")
          .insert({ ...row, server_id: this.serverId })
          .select("id")
          .single()
        if (data) {
          this.roles.set(role.id, data.id)
          await this.map("role", role.id, data.id)
        }
      }
    }
    for (const [discordId, biscordId] of this.roles) {
      if (seen.has(discordId)) continue
      await this.admin.from("roles").delete().eq("id", biscordId)
      await this.unmap("role", discordId)
      this.roles.delete(discordId)
    }
  }

  private async syncChannels(guild: DGuild) {
    const all = await discord<DChannel[]>(`/guilds/${guild.id}/channels`)
    const wanted = all.filter(
      (c) => biscordType(c.type) && !isPrivate(c, guild.id)
    )
    // categories first, so children can point at them
    wanted.sort(
      (a, b) =>
        Number(b.type === 4) - Number(a.type === 4) || a.position - b.position
    )

    const seen = new Set<string>()
    for (const channel of wanted) {
      seen.add(channel.id)
      const type = biscordType(channel.type)!
      const parent =
        channel.parent_id && type !== "category"
          ? (this.channels.get(channel.parent_id) ?? null)
          : null
      const row = {
        name: channel.name.slice(0, 100),
        topic: channel.topic?.slice(0, 1024) ?? null,
        // Discord lists voice channels after text ones in each category
        position: channel.position + (type === "voice" ? 500 : 0),
        parent_id: parent,
      }
      const existing = this.channels.get(channel.id)
      if (existing) {
        await this.admin.from("channels").update(row).eq("id", existing)
        continue
      }
      const { data } = await this.admin
        .from("channels")
        .insert({ ...row, type, server_id: this.serverId })
        .select("id")
        .single()
      if (!data) continue
      this.channels.set(channel.id, data.id)
      await this.admin.from("discord_objects").upsert({
        server_id: this.serverId,
        kind: "channel",
        discord_id: channel.id,
        biscord_id: data.id,
        // after the first import, new channels just follow along from now
        backfilled: this.link.backfill_done || type !== "text",
        cursor: this.link.backfill_done
          ? (channel.last_message_id ?? null)
          : null,
      })
    }
    for (const [discordId, biscordId] of this.channels) {
      if (seen.has(discordId)) continue
      await this.admin.from("channels").delete().eq("id", biscordId)
      await this.unmap("channel", discordId)
      this.channels.delete(discordId)
    }
  }

  /** Returns a warning when the member list couldn't be read. */
  private async syncMembers(guild: DGuild): Promise<string | null> {
    const members: DMember[] = []
    try {
      let after = "0"
      while (true) {
        const page = await discord<DMember[]>(
          `/guilds/${guild.id}/members?limit=1000&after=${after}`
        )
        members.push(...page)
        if (page.length < 1000) break
        after = page[page.length - 1].user.id
      }
    } catch (error) {
      return error instanceof DiscordError && error.status === 403
        ? "Não foi possível ler os membros: ative o Server Members Intent do bot no portal do Discord."
        : friendlyError(error)
    }

    const humans = members.filter((m) => !m.user.bot)
    await this.resolveProfiles(humans.map((m) => m.user.id))

    const [{ data: current }, { data: bans }, { data: server }, mapped] =
      await Promise.all([
        this.admin
          .from("server_members")
          .select("user_id, nickname")
          .eq("server_id", this.serverId),
        this.admin
          .from("server_bans")
          .select("user_id")
          .eq("server_id", this.serverId),
        this.admin
          .from("servers")
          .select("owner_id")
          .eq("id", this.serverId)
          .single(),
        this.objects("member"),
      ])
    const currentIds = new Map(
      (current ?? []).map((m) => [
        m.user_id as string,
        m.nickname as string | null,
      ])
    )
    const banned = new Set((bans ?? []).map((b) => b.user_id as string))
    const managedRoleIds = new Set(this.roles.values())

    const { data: assignments } = await this.admin
      .from("member_roles")
      .select("user_id, role_id")
      .eq("server_id", this.serverId)
    const rolesOf = new Map<string, Set<string>>()
    for (const a of assignments ?? []) {
      if (!managedRoleIds.has(a.role_id)) continue
      const set = rolesOf.get(a.user_id) ?? new Set<string>()
      set.add(a.role_id)
      rolesOf.set(a.user_id, set)
    }

    const inGuild = new Set<string>()
    for (const member of humans) {
      const userId = this.profiles.get(member.user.id)
      if (!userId || banned.has(userId)) continue
      inGuild.add(member.user.id)
      const nickname = member.nick?.slice(0, 32) ?? null

      if (!currentIds.has(userId)) {
        await this.admin.from("server_members").insert({
          server_id: this.serverId,
          user_id: userId,
          nickname,
        })
        await this.map("member", member.user.id, userId)
      } else {
        if (!mapped.some((m) => m.discord_id === member.user.id)) {
          await this.map("member", member.user.id, userId)
        }
        if (currentIds.get(userId) !== nickname) {
          await this.admin
            .from("server_members")
            .update({ nickname })
            .eq("server_id", this.serverId)
            .eq("user_id", userId)
        }
      }

      const want = new Set(
        member.roles.flatMap((id) => {
          const role = this.roles.get(id)
          return role ? [role] : []
        })
      )
      const have = rolesOf.get(userId) ?? new Set<string>()
      const add = [...want].filter((r) => !have.has(r))
      const remove = [...have].filter((r) => !want.has(r))
      if (add.length) {
        await this.admin.from("member_roles").insert(
          add.map((role_id) => ({
            server_id: this.serverId,
            user_id: userId,
            role_id,
          }))
        )
      }
      if (remove.length) {
        await this.admin
          .from("member_roles")
          .delete()
          .eq("user_id", userId)
          .in("role_id", remove)
      }
    }

    // members the import added who left the Discord server leave here too
    for (const object of mapped) {
      if (inGuild.has(object.discord_id)) continue
      if (object.biscord_id !== server?.owner_id) {
        await this.admin
          .from("server_members")
          .delete()
          .eq("server_id", this.serverId)
          .eq("user_id", object.biscord_id)
      }
      await this.unmap("member", object.discord_id)
    }
    return null
  }

  // -------------------------------------------------------------------------
  // Messages
  // -------------------------------------------------------------------------

  private convertContent(message: DMessage) {
    const names = new Map(
      message.mentions.map((u) => [u.id, u.global_name ?? u.username])
    )
    let content = message.content
      .replace(/<@!?(\d+)>/g, (_, id: string) => {
        const profile = this.profiles.get(id)
        return profile ? `<@${profile}>` : `@${names.get(id) ?? "usuário"}`
      })
      .replace(/<@&(\d+)>/g, (_, id: string) => {
        const role = this.roles.get(id)
        return role ? `<@&${role}>` : "@cargo"
      })
      .replace(/<#(\d+)>/g, (_, id: string) => {
        const channel = this.channels.get(id)
        return channel ? `<#${channel}>` : "#canal-privado"
      })
      .replace(/<a?:(\w+):\d+>/g, ":$1:")
    if (!content && message.sticker_items?.length) {
      content = `*[figurinha: ${message.sticker_items[0].name}]*`
    }
    return content.slice(0, 4000)
  }

  private async copyAttachment(a: DAttachment) {
    const base = {
      id: a.id,
      filename: a.filename,
      size: a.size,
      content_type: a.content_type ?? "application/octet-stream",
      ...(a.width ? { width: a.width } : {}),
      ...(a.height ? { height: a.height } : {}),
      ...(a.filename.startsWith("SPOILER_") ? { spoiler: true } : {}),
    }
    // Discord's links expire after about a day: keep our own copy
    if (a.size <= MAX_ATTACHMENT_COPY) {
      const res = await fetch(a.url).catch(() => null)
      if (res?.ok) {
        const safe = a.filename.replace(/[^\w.-]+/g, "_").slice(-100) || "file"
        const path = `discord/${this.serverId}/${a.id}/${safe}`
        const { error } = await this.admin.storage
          .from("attachments")
          .upload(path, await res.arrayBuffer(), {
            contentType: base.content_type,
            cacheControl: "31536000",
            upsert: true,
          })
        if (!error) {
          return {
            ...base,
            url: this.admin.storage.from("attachments").getPublicUrl(path).data
              .publicUrl,
          }
        }
      }
    }
    return { ...base, url: a.url }
  }

  private convertEmbeds(embeds: DEmbed[]) {
    const media = (m?: DEmbedMedia) =>
      m?.url ? { url: m.url, width: m.width, height: m.height } : undefined
    return embeds.flatMap((e) => {
      const type = (
        ["rich", "image", "video", "gifv", "article"].includes(e.type ?? "")
          ? e.type
          : "link"
      ) as string
      if (!e.url && type !== "rich") return []
      return [
        {
          type,
          url: e.url ?? "",
          title: e.title,
          description: e.description,
          color: e.color,
          provider: e.provider?.name
            ? { name: e.provider.name, url: e.provider.url }
            : undefined,
          author: e.author?.name
            ? { name: e.author.name, url: e.author.url }
            : undefined,
          thumbnail: media(e.thumbnail),
          image: media(e.image),
          video: e.video?.url
            ? {
                ...media(e.video),
                embedUrl: /youtube\.com\/embed\//.test(e.video.url)
                  ? e.video.url
                  : undefined,
              }
            : undefined,
        },
      ]
    })
  }

  private async toRows(messages: DMessage[], channelId: string) {
    const wanted = messages.filter((m) => MESSAGE_TYPES.has(m.type))
    await this.resolveProfiles(
      wanted.flatMap((m) => [m.author.id, ...m.mentions.map((u) => u.id)])
    )
    const rows = []
    for (const m of wanted) {
      const author = this.profiles.get(m.author.id)
      rows.push({
        channel_id: channelId,
        author_id: author ?? this.fallbackAuthor,
        imported_author: author
          ? null
          : {
              discord_id: m.author.id,
              name: m.author.global_name ?? m.author.username,
              avatar_url: avatarUrl(m.author),
              ...(m.author.bot ? { bot: true } : {}),
            },
        type: m.type === 7 ? "member_join" : "default",
        content: m.type === 7 ? "" : this.convertContent(m),
        attachments: await Promise.all(
          m.attachments.map((a) => this.copyAttachment(a))
        ),
        embeds: this.convertEmbeds(m.embeds),
        pinned: m.pinned,
        created_at: m.timestamp,
        edited_at: m.edited_timestamp,
        discord_id: m.id,
        discord_reply_to: m.message_reference?.message_id ?? null,
      })
    }
    return rows
  }

  private async insert(messages: DMessage[], channelId: string) {
    const rows = await this.toRows(messages, channelId)
    if (!rows.length) return 0
    const { error } = await this.admin
      .from("messages")
      .upsert(rows, { onConflict: "discord_id", ignoreDuplicates: true })
    if (error) throw new Error(error.message)
    return rows.length
  }

  /** First import: walks each text channel back to the history limit. */
  async backfill() {
    const objects = (await this.objects("channel")).filter((o) => !o.backfilled)
    for (const object of objects) {
      const limit = this.link.history_limit
      let { oldest, cursor, imported_count: count } = object
      let done = limit === 0
      if (done && !cursor) {
        const channel = await discord<DChannel>(
          `/channels/${object.discord_id}`
        )
        cursor = channel.last_message_id ?? null
      }
      while (!done && this.timeLeft() > 8000) {
        const page = await discord<DMessage[]>(
          `/channels/${object.discord_id}/messages?limit=100${oldest ? `&before=${oldest}` : ""}`
        ).catch((error) => {
          // a channel the bot can't read imports as empty
          if (error instanceof DiscordError && error.status === 403) return []
          throw error
        })
        page.sort(byId)
        const take = limit < 0 ? page : page.slice(-(limit - count))
        if (take.length) {
          if (!cursor) cursor = take[take.length - 1].id
          count += await this.insert(take, object.biscord_id)
          oldest = take[0].id
        }
        done = page.length < 100 || (limit > 0 && count >= limit)
      }
      await this.admin
        .from("discord_objects")
        .update({ oldest, cursor, imported_count: count, backfilled: done })
        .eq("server_id", this.serverId)
        .eq("kind", "channel")
        .eq("discord_id", object.discord_id)
      if (!done) return false
    }
    return true
  }

  /** Later runs: new messages, plus edits and deletions among recent ones. */
  async follow() {
    const objects = (await this.objects("channel")).filter((o) =>
      this.isText(o.biscord_id)
    )
    for (const object of objects) {
      if (this.timeLeft() < 8000) return false
      let cursor = object.cursor ?? "0"
      let count = object.imported_count
      while (this.timeLeft() > 8000) {
        const page = await discord<DMessage[]>(
          `/channels/${object.discord_id}/messages?limit=100&after=${cursor}`
        ).catch(() => [] as DMessage[])
        page.sort(byId)
        if (page.length) {
          count += await this.insert(page, object.biscord_id)
          cursor = page[page.length - 1].id
        }
        if (page.length < 100) break
      }
      await this.admin
        .from("discord_objects")
        .update({ cursor, imported_count: count })
        .eq("server_id", this.serverId)
        .eq("kind", "channel")
        .eq("discord_id", object.discord_id)
      await this.reconcileRecent(object)
    }
    return true
  }

  private textChannels = new Set<string>()
  async loadTextChannels() {
    const { data } = await this.admin
      .from("channels")
      .select("id")
      .eq("server_id", this.serverId)
      .eq("type", "text")
    this.textChannels = new Set((data ?? []).map((c) => c.id as string))
  }
  private isText(id: string) {
    return this.textChannels.has(id)
  }

  private async reconcileRecent(object: ChannelObject) {
    const recent = await discord<DMessage[]>(
      `/channels/${object.discord_id}/messages?limit=50`
    ).catch(() => null)
    if (!recent || recent.length === 0) return
    recent.sort(byId)
    const since = recent[0].timestamp
    const { data: stored } = await this.admin
      .from("messages")
      .select("id, discord_id, edited_at, pinned")
      .eq("channel_id", object.biscord_id)
      .not("discord_id", "is", null)
      .gte("created_at", since)
    const live = new Map(recent.map((m) => [m.id, m]))
    for (const row of stored ?? []) {
      const message = live.get(row.discord_id)
      if (!message) {
        await this.admin.from("messages").delete().eq("id", row.id)
        continue
      }
      const edited =
        message.edited_timestamp &&
        (!row.edited_at ||
          Date.parse(message.edited_timestamp) > Date.parse(row.edited_at))
      if (edited) {
        await this.resolveProfiles(message.mentions.map((u) => u.id))
        await this.admin
          .from("messages")
          .update({ content: this.convertContent(message) })
          .eq("id", row.id)
        // the edit trigger clears embeds and stamps now(); restore Discord's
        await this.admin
          .from("messages")
          .update({
            embeds: this.convertEmbeds(message.embeds),
            edited_at: message.edited_timestamp,
          })
          .eq("id", row.id)
      }
      if (message.pinned !== row.pinned) {
        await this.admin
          .from("messages")
          .update({ pinned: message.pinned })
          .eq("id", row.id)
      }
    }
  }

  /** Everything one run does for this server. */
  async run(options: { structure: boolean }) {
    const guild = await discord<DGuild>(`/guilds/${this.link.guild_id}`)
    await this.load()
    let warning: string | null = null
    if (options.structure) warning = await this.syncStructure(guild)
    await this.loadTextChannels()

    let backfillDone = this.link.backfill_done
    if (!backfillDone) backfillDone = await this.backfill()
    if (backfillDone && this.link.backfill_done && this.link.sync) {
      await this.follow()
    }
    await this.admin.rpc("discord_link_replies", { p_server: this.serverId })

    const { data: progress } = await this.admin
      .from("discord_objects")
      .select("backfilled, imported_count")
      .eq("server_id", this.serverId)
      .eq("kind", "channel")
    await this.admin
      .from("discord_links")
      .update({
        backfill_done: backfillDone,
        last_synced_at: new Date().toISOString(),
        last_error: warning,
      })
      .eq("server_id", this.serverId)

    return {
      done: backfillDone,
      warning,
      channels: progress?.length ?? 0,
      channelsDone: progress?.filter((p) => p.backfilled).length ?? 0,
      messages: (progress ?? []).reduce((n, p) => n + p.imported_count, 0),
    }
  }
}

async function runLink(
  admin: Admin,
  link: Link,
  deadline: number,
  options: { structure: boolean }
) {
  const seconds = Math.ceil((deadline - Date.now()) / 1000) + 30
  const { data: claimed } = await admin.rpc("discord_claim", {
    p_server: link.server_id,
    p_seconds: seconds,
  })
  if (!claimed) return { busy: true }
  try {
    return await new Worker(admin, link, deadline).run(options)
  } catch (error) {
    const message = friendlyError(error)
    await admin
      .from("discord_links")
      .update({ last_error: message })
      .eq("server_id", link.server_id)
    return { error: message }
  } finally {
    await admin.rpc("discord_release", { p_server: link.server_id })
  }
}

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }
  const started = Date.now()
  const body = (await req.json().catch(() => ({}))) as {
    action?: string
    guildId?: string
    serverId?: string
    historyLimit?: number
    sync?: boolean
  }
  const admin = adminClient()

  if (!BOT_TOKEN) {
    return json(
      {
        error:
          "Falta configurar o bot: defina DISCORD_BOT_TOKEN nos secrets das edge functions.",
      },
      500
    )
  }

  if (body.action === "cron") {
    const { data: ok } = await admin.rpc("check_cron_secret", {
      p_secret: req.headers.get("x-cron-secret") ?? "",
    })
    if (!ok) return json({ error: "forbidden" }, 403)
    const { data: links } = await admin
      .from("discord_links")
      .select("*")
      .or("sync.eq.true,backfill_done.eq.false")
    const work = (async () => {
      for (const link of (links ?? []) as Link[]) {
        const deadline = Math.min(started + 120_000, Date.now() + 60_000)
        if (deadline - Date.now() < 15_000) break
        await runLink(admin, link, deadline, { structure: link.sync })
      }
    })()
    // pg_net doesn't wait for us: keep working after answering
    const runtime = (
      globalThis as {
        EdgeRuntime?: { waitUntil: (promise: Promise<unknown>) => void }
      }
    ).EdgeRuntime
    if (runtime) {
      runtime.waitUntil(work)
      return json({ accepted: links?.length ?? 0 }, 202)
    }
    await work
    return json({ done: links?.length ?? 0 })
  }

  const auth = await requireUser(req)
  if (!auth) return json({ error: "unauthorized" }, 401)

  const { data: me } = await admin
    .from("profiles")
    .select("discord_id")
    .eq("id", auth.user.id)
    .single()
  const discordId = me?.discord_id as string | null

  if (body.action === "guilds") {
    if (!discordId) {
      return json({ error: "Vincule sua conta do Discord primeiro." }, 400)
    }
    try {
      const [app, partials] = await Promise.all([
        discord<{ id: string; flags?: number }>("/applications/@me"),
        discord<{ id: string; name: string; icon: string | null }[]>(
          "/users/@me/guilds"
        ),
      ])
      const { data: links } = await admin
        .from("discord_links")
        .select("server_id, guild_id")
        .in(
          "guild_id",
          partials.map((g) => g.id)
        )
      const guilds = await Promise.all(
        partials.map(async (partial) => {
          const guild = await discord<DGuild>(`/guilds/${partial.id}`).catch(
            () => null
          )
          return {
            id: partial.id,
            name: partial.name,
            iconUrl: iconUrl(partial),
            canImport: guild ? await canImport(guild, discordId) : false,
            importedServerId:
              links?.find((l) => l.guild_id === partial.id)?.server_id ?? null,
          }
        })
      )
      const flags = app.flags ?? 0
      return json({
        applicationId: app.id,
        intents: {
          members: (flags & FLAG_MEMBERS) !== 0,
          content: (flags & FLAG_CONTENT) !== 0,
        },
        guilds,
      })
    } catch (error) {
      return json({ error: friendlyError(error) }, 502)
    }
  }

  if (body.action === "import") {
    if (!discordId) {
      return json({ error: "Vincule sua conta do Discord primeiro." }, 400)
    }
    if (!body.guildId) return json({ error: "missing guildId" }, 400)

    const { data: existing } = await admin
      .from("discord_links")
      .select("server_id")
      .eq("guild_id", body.guildId)
      .maybeSingle()
    if (existing) {
      return json(
        { error: "already_imported", serverId: existing.server_id },
        409
      )
    }

    let guild: DGuild
    try {
      guild = await discord<DGuild>(`/guilds/${body.guildId}`)
      if (!(await canImport(guild, discordId))) {
        return json(
          {
            error:
              "Só o dono ou quem tem cargo de administrador no servidor do Discord pode importá-lo.",
          },
          403
        )
      }
    } catch (error) {
      return json({ error: friendlyError(error) }, 502)
    }

    // the Discord owner owns the copy too, when they're on Biscord
    const { data: owner } = await admin
      .from("profiles")
      .select("id")
      .eq("discord_id", guild.owner_id)
      .maybeSingle()
    const ownerId = (owner?.id as string | undefined) ?? auth.user.id

    const { data: server, error } = await admin
      .from("servers")
      .insert({
        name: guild.name.slice(0, 100).padEnd(2, "_"),
        icon_url: iconUrl(guild),
        owner_id: ownerId,
        allow_guests: false,
      })
      .select("id")
      .single()
    if (error || !server) {
      return json({ error: "Não foi possível criar o servidor." }, 500)
    }
    const serverId = server.id as string

    const { error: linkError } = await admin.from("discord_links").insert({
      server_id: serverId,
      guild_id: guild.id,
      imported_by: auth.user.id,
      sync: body.sync === true,
      history_limit: Math.max(-1, Math.trunc(body.historyLimit ?? 500)),
    })
    if (linkError) {
      // someone imported it a moment ago
      await admin.from("servers").delete().eq("id", serverId)
      const { data: winner } = await admin
        .from("discord_links")
        .select("server_id")
        .eq("guild_id", guild.id)
        .maybeSingle()
      return json(
        { error: "already_imported", serverId: winner?.server_id ?? null },
        409
      )
    }

    await admin.from("server_members").insert(
      [...new Set([ownerId, auth.user.id])].map((user_id) => ({
        server_id: serverId,
        user_id,
      }))
    )
    await admin.from("roles").insert({
      server_id: serverId,
      name: "@everyone",
      permissions: 70372929,
      is_default: true,
      position: 0,
    })

    const { data: link } = await admin
      .from("discord_links")
      .select("*")
      .eq("server_id", serverId)
      .single()
    const result = await runLink(admin, link as Link, started + 50_000, {
      structure: true,
    })
    return json({ serverId, ...result })
  }

  if (body.action === "step") {
    if (!body.serverId) return json({ error: "missing serverId" }, 400)
    const { data: allowed } = await auth.client.rpc("has_permission", {
      p_server: body.serverId,
      p_perm: 8,
    })
    if (!allowed) return json({ error: "forbidden" }, 403)
    const { data: link } = await admin
      .from("discord_links")
      .select("*")
      .eq("server_id", body.serverId)
      .maybeSingle()
    if (!link) return json({ error: "not linked" }, 404)
    const result = await runLink(admin, link as Link, started + 50_000, {
      structure: (link as Link).backfill_done,
    })
    return json(result)
  }

  return json({ error: "unknown action" }, 400)
})

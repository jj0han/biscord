// Generates Discord-style link embeds for a message. The author calls this
// right after sending (or editing); embeds are written with the service role
// and reach every client through the realtime UPDATE.
import { corsHeaders, json } from "../_shared/cors.ts"
import { adminClient, requireUser } from "../_shared/supabase.ts"

type EmbedMedia = { url: string; width?: number; height?: number }

type Embed = {
  type: "link" | "article" | "image" | "video" | "gifv" | "rich"
  url: string
  title?: string
  description?: string
  color?: number
  provider?: { name: string; url?: string }
  author?: { name: string; url?: string }
  thumbnail?: EmbedMedia
  image?: EmbedMedia
  video?: EmbedMedia & { embedUrl?: string }
}

const MAX_EMBEDS = 5
const MAX_BYTES = 1_000_000
const TIMEOUT_MS = 6000
const USER_AGENT =
  "Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com) Biscord/1.0"

// ---------------------------------------------------------------------------
// URL extraction — mirrors Discord: no embeds for <suppressed> links,
// spoilers or code.
// ---------------------------------------------------------------------------

function extractUrls(content: string) {
  const stripped = content
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/\|\|[\s\S]*?\|\|/g, " ")

  const urls: string[] = []
  const re = /(<)?(https?:\/\/[^\s<>]+[^\s<>.,:;"')\]!?])(>)?/g
  for (const match of stripped.matchAll(re)) {
    if (match[1] && match[3]) continue
    const url = match[2]
    if (!urls.includes(url)) urls.push(url)
    if (urls.length >= MAX_EMBEDS) break
  }
  return urls
}

// ---------------------------------------------------------------------------
// SSRF protection: only fetch hosts that resolve to public addresses.
// ---------------------------------------------------------------------------

function isPrivateV4(ip: string) {
  const p = ip.split(".").map(Number)
  if (p.length !== 4 || p.some((n) => Number.isNaN(n))) return true
  const [a, b] = p
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  )
}

function isPrivateV6(ip: string) {
  const v = ip.toLowerCase()
  if (v === "::" || v === "::1") return true
  const mapped = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
  if (mapped) return isPrivateV4(mapped[1])
  return /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(v)
}

async function assertPublic(url: URL) {
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("unsupported protocol")
  }
  if (url.port && !["80", "443", "8080", "8443"].includes(url.port)) {
    throw new Error("unsupported port")
  }

  const host = url.hostname.replace(/^\[|\]$/g, "")
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    if (isPrivateV4(host)) throw new Error("private address")
    return
  }
  if (host.includes(":")) {
    if (isPrivateV6(host)) throw new Error("private address")
    return
  }
  if (
    host === "localhost" ||
    host.endsWith(".local") ||
    host.endsWith(".internal")
  ) {
    throw new Error("private host")
  }

  const [v4, v6] = await Promise.all([
    Deno.resolveDns(host, "A").catch(() => [] as string[]),
    Deno.resolveDns(host, "AAAA").catch(() => [] as string[]),
  ])
  const all = [...v4, ...v6]
  if (all.length === 0) throw new Error("unresolvable host")
  if (v4.some(isPrivateV4) || v6.some(isPrivateV6)) {
    throw new Error("private address")
  }
}

async function safeFetch(input: string) {
  let url = new URL(input)
  for (let hop = 0; hop < 4; hop++) {
    await assertPublic(url)
    const res = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        "User-Agent": USER_AGENT,
        Accept:
          "text/html,application/xhtml+xml,image/*,video/*;q=0.9,*/*;q=0.5",
        "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
      },
    })
    const location = res.headers.get("location")
    if (res.status >= 300 && res.status < 400 && location) {
      await res.body?.cancel()
      url = new URL(location, url)
      continue
    }
    return { res, url }
  }
  throw new Error("too many redirects")
}

async function readText(res: Response) {
  const reader = res.body?.getReader()
  if (!reader) return ""
  const chunks: Uint8Array[] = []
  let size = 0
  while (size < MAX_BYTES) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    size += value.length
    // <head> is all we need
    if (new TextDecoder().decode(value).includes("</head>")) break
  }
  await reader.cancel().catch(() => {})
  const buf = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    buf.set(chunk, offset)
    offset += chunk.length
  }
  return new TextDecoder().decode(buf)
}

/** Reads width/height from the first bytes of a GIF or PNG so embeds don't jump. */
async function imageSize(
  res: Response
): Promise<{ width?: number; height?: number }> {
  const reader = res.body?.getReader()
  if (!reader) return {}
  try {
    const { value } = await reader.read()
    if (!value || value.length < 24) return {}
    const ascii = new TextDecoder().decode(value.slice(0, 6))
    if (ascii.startsWith("GIF")) {
      return {
        width: value[6] | (value[7] << 8),
        height: value[8] | (value[9] << 8),
      }
    }
    if (value[1] === 0x50 && value[2] === 0x4e && value[3] === 0x47) {
      const view = new DataView(value.buffer, value.byteOffset)
      return { width: view.getUint32(16), height: view.getUint32(20) }
    }
    return {}
  } finally {
    await reader.cancel().catch(() => {})
  }
}

// ---------------------------------------------------------------------------
// HTML metadata parsing
// ---------------------------------------------------------------------------

function decodeEntities(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) =>
      String.fromCodePoint(parseInt(n, 16))
    )
}

function parseMeta(html: string) {
  const meta = new Map<string, string>()
  for (const tag of html.matchAll(/<meta\b[^>]*>/gi)) {
    const attrs = new Map<string, string>()
    for (const attr of tag[0].matchAll(
      /([a-zA-Z:_-]+)\s*=\s*("([^"]*)"|'([^']*)')/g
    )) {
      attrs.set(attr[1].toLowerCase(), attr[3] ?? attr[4] ?? "")
    }
    const key = (attrs.get("property") ?? attrs.get("name") ?? "").toLowerCase()
    const content = attrs.get("content")
    if (key && content && !meta.has(key)) {
      meta.set(key, decodeEntities(content.trim()))
    }
  }
  const title = html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]
  if (title && !meta.has("title"))
    meta.set("title", decodeEntities(title.trim()))
  return meta
}

function truncate(value: string | undefined, max: number) {
  if (!value) return undefined
  return value.length > max ? `${value.slice(0, max - 1)}…` : value
}

function toColor(value: string | undefined) {
  const hex = value?.match(/^#?([0-9a-f]{6})$/i)?.[1]
  return hex ? parseInt(hex, 16) : undefined
}

function absolute(value: string | undefined, base: URL) {
  if (!value) return undefined
  try {
    const url = new URL(value, base)
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.href
      : undefined
  } catch {
    return undefined
  }
}

function num(value: string | undefined) {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : undefined
}

// ---------------------------------------------------------------------------
// Providers
// ---------------------------------------------------------------------------

function youtubeId(url: URL) {
  if (url.hostname === "youtu.be") return url.pathname.slice(1) || null
  if (/(^|\.)youtube\.com$/.test(url.hostname)) {
    if (url.pathname === "/watch") return url.searchParams.get("v")
    const m = url.pathname.match(/^\/(shorts|embed|live)\/([\w-]+)/)
    if (m) return m[2]
  }
  return null
}

async function youtubeEmbed(original: string, id: string): Promise<Embed> {
  const embed: Embed = {
    type: "video",
    url: original,
    color: 0xff0000,
    provider: { name: "YouTube", url: "https://www.youtube.com" },
    thumbnail: {
      url: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
      width: 480,
      height: 360,
    },
    video: {
      url: `https://www.youtube.com/watch?v=${id}`,
      embedUrl: `https://www.youtube.com/embed/${id}`,
      width: 1280,
      height: 720,
    },
  }
  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(original)}`,
      { signal: AbortSignal.timeout(TIMEOUT_MS) }
    )
    if (res.ok) {
      const data = await res.json()
      embed.title = data.title
      embed.author = { name: data.author_name, url: data.author_url }
    }
  } catch {
    // title is optional
  }
  return embed
}

async function unfurl(raw: string): Promise<Embed | null> {
  const parsed = new URL(raw)

  const yt = youtubeId(parsed)
  if (yt) return youtubeEmbed(raw, yt)

  const { res, url } = await safeFetch(raw)
  if (!res.ok) {
    await res.body?.cancel()
    return null
  }

  const type = res.headers.get("content-type") ?? ""

  if (type.startsWith("image/")) {
    const size = await imageSize(res)
    return {
      type: type === "image/gif" ? "gifv" : "image",
      url: raw,
      image: { url: url.href, ...size },
    }
  }
  if (type.startsWith("video/")) {
    await res.body?.cancel()
    return { type: "video", url: raw, video: { url: url.href } }
  }
  if (!type.includes("html")) {
    await res.body?.cancel()
    return null
  }

  const meta = parseMeta(await readText(res))
  const get = (...keys: string[]) => {
    for (const key of keys) {
      const value = meta.get(key)
      if (value) return value
    }
    return undefined
  }

  const title = get("og:title", "twitter:title", "title")
  const description = get(
    "og:description",
    "twitter:description",
    "description"
  )
  const imageUrl = absolute(
    get(
      "og:image:secure_url",
      "og:image",
      "twitter:image",
      "twitter:image:src"
    ),
    url
  )
  const videoUrl = absolute(
    get("og:video:secure_url", "og:video:url", "og:video"),
    url
  )
  const siteName = get("og:site_name", "application-name")

  if (!title && !description && !imageUrl) return null

  const largeImage = get("twitter:card") === "summary_large_image"
  const media: EmbedMedia | undefined = imageUrl
    ? {
        url: imageUrl,
        width: num(get("og:image:width")),
        height: num(get("og:image:height")),
      }
    : undefined

  const embed: Embed = {
    type: get("og:type") === "article" ? "article" : "link",
    url: raw,
    title: truncate(title, 256),
    description: truncate(description, 350),
    color: toColor(get("theme-color")),
    provider: siteName
      ? { name: truncate(siteName, 256)!, url: url.origin }
      : undefined,
    author: get("author", "article:author")
      ? { name: truncate(get("author", "article:author"), 256)! }
      : undefined,
  }

  if (videoUrl && media) {
    embed.type = "video"
    embed.thumbnail = media
    embed.video = {
      url: videoUrl,
      width: num(get("og:video:width")),
      height: num(get("og:video:height")),
    }
  } else if (media && largeImage) {
    embed.image = media
  } else if (media) {
    embed.thumbnail = media
  }

  return embed
}

// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  const auth = await requireUser(req)
  if (!auth) {
    return json({ error: "unauthorized" }, 401)
  }

  const { messageId } = (await req.json().catch(() => ({}))) as {
    messageId?: string
  }
  if (!messageId) {
    return json({ error: "missing messageId" }, 400)
  }

  const { data: message } = await auth.client
    .from("messages")
    .select("id, author_id, content")
    .eq("id", messageId)
    .maybeSingle()

  if (!message || message.author_id !== auth.user.id) {
    return json({ error: "not found" }, 404)
  }

  const urls = extractUrls(message.content)
  const results = await Promise.allSettled(urls.map(unfurl))
  const embeds = results
    .map((r) => (r.status === "fulfilled" ? r.value : null))
    .filter((e): e is Embed => e !== null)

  // Skip the write when nothing changed, and never overwrite a newer edit.
  const { error } = await adminClient()
    .from("messages")
    .update({ embeds })
    .eq("id", message.id)
    .eq("content", message.content)

  if (error) {
    return json({ error: error.message }, 500)
  }

  return json({ embeds })
})

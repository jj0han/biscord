// GIF search for the composer's GIF picker, proxied so the Giphy key stays
// server-side. Returns trending GIFs when no query is given.
import { corsHeaders, json } from "../_shared/cors.ts"
import { requireUser } from "../_shared/supabase.ts"

type GiphyImage = { url: string; width: string; height: string; webp?: string }

type GiphyGif = {
  id: string
  title: string
  images: {
    original: GiphyImage
    fixed_width: GiphyImage
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  const auth = await requireUser(req)
  if (!auth) {
    return json({ error: "unauthorized" }, 401)
  }

  const apiKey = Deno.env.get("GIPHY_API_KEY")
  if (!apiKey) {
    return json({ error: "GIPHY_API_KEY não configurada." }, 500)
  }

  const { query = "", offset = 0 } = (await req.json().catch(() => ({}))) as {
    query?: string
    offset?: number
  }

  const params = new URLSearchParams({
    api_key: apiKey,
    limit: "30",
    offset: String(Math.max(0, Math.min(Number(offset) || 0, 4999))),
    rating: "pg-13",
    bundle: "messaging_non_clips",
  })
  const term = query.trim().slice(0, 50)
  if (term) {
    params.set("q", term)
    params.set("lang", "pt")
  }

  const res = await fetch(
    `https://api.giphy.com/v1/gifs/${term ? "search" : "trending"}?${params}`,
    { signal: AbortSignal.timeout(8000) }
  )
  if (!res.ok) {
    return json({ error: "giphy indisponível" }, 502)
  }

  const body = (await res.json()) as { data: GiphyGif[] }
  const gifs = body.data.map((gif) => ({
    id: gif.id,
    title: gif.title,
    // the canonical media URL; the unfurl function turns it into a gifv embed
    url: `https://media.giphy.com/media/${gif.id}/giphy.gif`,
    width: Number(gif.images.original.width),
    height: Number(gif.images.original.height),
    preview: gif.images.fixed_width.webp ?? gif.images.fixed_width.url,
    previewWidth: Number(gif.images.fixed_width.width),
    previewHeight: Number(gif.images.fixed_width.height),
  }))

  return json({ gifs })
})

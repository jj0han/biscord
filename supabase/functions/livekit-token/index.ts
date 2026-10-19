// Issues a LiveKit access token for a voice channel (or a DM call). The room
// name is the Biscord channel id, so permissions map 1:1.
import {
  AccessToken,
  RoomServiceClient,
  TrackSource,
} from "npm:livekit-server-sdk@2"

import { corsHeaders, json } from "../_shared/cors.ts"
import { requireUser } from "../_shared/supabase.ts"

const CONNECT = 1048576
const SPEAK = 2097152
const STREAM = 512

// Checked once per function instance: a key/secret pair that LiveKit rejects
// would otherwise only show up as "invalid token" in the browser.
let credentialsOk: Promise<boolean> | null = null

function checkCredentials(url: string, key: string, secret: string) {
  credentialsOk ??= new RoomServiceClient(
    url.replace(/^wss:/, "https:"),
    key,
    secret
  )
    .listRooms()
    .then(() => true)
    .catch((error) => {
      credentialsOk = null
      const status = (error as { status?: number }).status
      return status !== 401 && status !== 403
    })
  return credentialsOk
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  const auth = await requireUser(req)
  if (!auth) {
    return json({ error: "unauthorized" }, 401)
  }

  const { channelId } = (await req.json().catch(() => ({}))) as {
    channelId?: string
  }
  if (!channelId) {
    return json({ error: "missing channelId" }, 400)
  }

  const apiKey = (Deno.env.get("LIVEKIT_API_KEY") ?? "").trim()
  const apiSecret = (Deno.env.get("LIVEKIT_API_SECRET") ?? "").trim()
  const url = (Deno.env.get("LIVEKIT_URL") ?? "").trim()
  // LiveKit keys always look like "APIxxxxxxxx"; anything else is a copy/paste
  // mistake that otherwise surfaces as an opaque "invalid token" in the client.
  if (!apiKey.startsWith("API") || !apiSecret || !url.startsWith("wss://")) {
    return json(
      {
        error:
          "LiveKit mal configurado: confira LIVEKIT_URL (wss://…), LIVEKIT_API_KEY (começa com API) e LIVEKIT_API_SECRET nos secrets das edge functions.",
      },
      500
    )
  }

  if (!(await checkCredentials(url, apiKey, apiSecret))) {
    return json(
      {
        error:
          "O LiveKit recusou LIVEKIT_API_KEY + LIVEKIT_API_SECRET: o secret não é dessa chave (ou foi colado com espaço/quebra de linha), ou a chave é de outro projeto que não o de LIVEKIT_URL.",
      },
      500
    )
  }

  const { client, user } = auth

  const { data: channel } = await client
    .from("channels")
    .select("id, type")
    .eq("id", channelId)
    .maybeSingle()

  if (!channel || !["voice", "dm", "group_dm"].includes(channel.type)) {
    return json({ error: "not a voice channel" }, 404)
  }

  const can = async (perm: number) => {
    const { data } = await client.rpc("channel_permission", {
      p_channel: channelId,
      p_perm: perm,
    })
    return data === true
  }

  const [canConnect, canSpeak, canStream] = await Promise.all([
    can(CONNECT),
    can(SPEAK),
    can(STREAM),
  ])

  if (!canConnect) {
    return json({ error: "missing permission" }, 403)
  }

  const { data: profile } = await client
    .from("profiles")
    .select("username, display_name, avatar_url")
    .eq("id", user.id)
    .single()

  const sources: TrackSource[] = []
  if (canSpeak) sources.push(TrackSource.MICROPHONE)
  if (canStream) {
    sources.push(
      TrackSource.CAMERA,
      TrackSource.SCREEN_SHARE,
      TrackSource.SCREEN_SHARE_AUDIO
    )
  }

  const token = new AccessToken(apiKey, apiSecret, {
    identity: user.id,
    name: profile?.display_name ?? profile?.username ?? "user",
    metadata: JSON.stringify({ avatarUrl: profile?.avatar_url ?? null }),
    ttl: "6h",
  })

  token.addGrant({
    room: channelId,
    roomJoin: true,
    canSubscribe: true,
    canPublish: sources.length > 0,
    canPublishSources: sources,
    canPublishData: true,
  })

  return json({ token: await token.toJwt(), url })
})

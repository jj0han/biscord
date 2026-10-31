// Admin-only snapshot of the voice server: whether LiveKit Cloud is accepting
// connections right now (it answers 429 once the free plan's monthly minutes
// or data run out) and which rooms are live. LiveKit's own usage API needs a
// paid plan, so totals come from Biscord's voice_usage log instead.
import { AccessToken, RoomServiceClient } from "npm:livekit-server-sdk@2"

import { corsHeaders, json } from "../_shared/cors.ts"
import { requireUser } from "../_shared/supabase.ts"

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  const auth = await requireUser(req)
  if (!auth) {
    return json({ error: "unauthorized" }, 401)
  }
  const { data: isAdmin } = await auth.client.rpc("is_app_admin")
  if (!isAdmin) {
    return json({ error: "forbidden" }, 403)
  }

  const apiKey = (Deno.env.get("LIVEKIT_API_KEY") ?? "").trim()
  const apiSecret = (Deno.env.get("LIVEKIT_API_SECRET") ?? "").trim()
  const url = (Deno.env.get("LIVEKIT_URL") ?? "").trim()
  const https = url.replace(/^wss:/, "https:")

  // a throwaway token just to ask the server whether it would let us in
  const probe = new AccessToken(apiKey, apiSecret, {
    identity: `status-probe-${auth.user.id}`,
    ttl: "1m",
  })
  probe.addGrant({ room: "biscord-status-probe", roomJoin: true })
  const token = await probe.toJwt()

  const validate = await fetch(
    `${https}/rtc/v1/validate?access_token=${encodeURIComponent(token)}`
  ).catch(() => null)
  const message = validate ? (await validate.text()).trim() : "sem resposta"

  const rooms = await new RoomServiceClient(https, apiKey, apiSecret)
    .listRooms()
    .then((list) =>
      list.map((room) => ({
        name: room.name,
        participants: room.numParticipants,
        publishers: room.numPublishers,
        createdAt: Number(room.creationTime) * 1000,
      }))
    )
    .catch(() => [])

  return json({
    accepting: validate?.ok ?? false,
    status: validate?.status ?? 0,
    message: validate?.ok ? null : message,
    rooms,
  })
})

import type { RealtimeChannel } from "@supabase/supabase-js"
import { useMemo } from "react"
import { toast } from "sonner"

import { playSound } from "@/lib/sounds"
import { createStore } from "@/lib/store"
import { supabase } from "@/lib/supabase"
import type { VoiceState } from "@/lib/types"

/** Voice presence is scoped per server; DM calls share the "dms" scope. */
export const DM_SCOPE = "dms"

export type VoiceConnection = {
  channelId: string
  scope: string
  token: string
  url: string
  /** publish the camera right after connecting */
  video: boolean
  joinedAt: string
}

type VoiceStore = {
  connection: VoiceConnection | null
  connecting: string | null
  muted: boolean
  deafened: boolean
}

function loadPreference(key: string) {
  try {
    return localStorage.getItem(key) === "true"
  } catch {
    return false
  }
}

function savePreference(key: string, value: boolean) {
  try {
    localStorage.setItem(key, String(value))
  } catch {
    // preferences are best-effort
  }
}

export const voiceStore = createStore<VoiceStore>({
  connection: null,
  connecting: null,
  muted: loadPreference("voice:muted"),
  deafened: loadPreference("voice:deafened"),
})

/** scope -> everyone currently in a voice channel of that scope */
export const voiceStatesStore = createStore<Record<string, VoiceState[]>>({})

/** Presence channels by scope, owned by VoiceProvider. */
export const voicePresenceChannels = new Map<string, RealtimeChannel>()

const EMPTY: VoiceState[] = []

export function useScopeVoiceStates(scope: string | null | undefined) {
  return voiceStatesStore.useStore((state) =>
    scope ? (state[scope] ?? EMPTY) : EMPTY
  )
}

export function useChannelVoiceStates(
  scope: string | null | undefined,
  channelId: string
) {
  const states = useScopeVoiceStates(scope)
  return useMemo(
    () => states.filter((s) => s.channel_id === channelId),
    [states, channelId]
  )
}

export function useVoice() {
  return voiceStore.useStore((state) => state)
}

/** Pulls the `{ error }` body out of a failed edge function call. */
async function functionErrorMessage(error: unknown) {
  const context = (error as { context?: Response } | null)?.context
  if (!context || typeof context.json !== "function") return undefined
  try {
    const body = (await context.json()) as { error?: string }
    return body.error
  } catch {
    return undefined
  }
}

export async function joinVoice(
  channelId: string,
  scope: string,
  options: { video?: boolean } = {}
) {
  const current = voiceStore.get()
  if (current.connection?.channelId === channelId || current.connecting) return

  voiceStore.set((s) => ({ ...s, connecting: channelId }))
  const { data, error } = await supabase.functions.invoke<{
    token: string
    url: string
  }>("livekit-token", { body: { channelId } })

  if (error || !data?.token || !data.url) {
    voiceStore.set((s) => ({ ...s, connecting: null }))
    toast.error("Não foi possível conectar ao canal de voz.", {
      description: await functionErrorMessage(error),
    })
    return
  }

  voiceStore.set((s) => ({
    ...s,
    connecting: null,
    connection: {
      channelId,
      scope,
      token: data.token,
      url: data.url,
      video: options.video ?? false,
      joinedAt: new Date().toISOString(),
    },
  }))
}

export function leaveVoice() {
  if (voiceStore.get().connection) playSound("leave")
  voiceStore.set((s) => ({ ...s, connection: null, connecting: null }))
}

export function toggleMute() {
  voiceStore.set((s) => {
    // unmuting while deafened undeafens too, like Discord
    const muted = !s.muted
    const deafened = muted ? s.deafened : false
    playSound(muted ? "mute" : "unmute")
    savePreference("voice:muted", muted)
    savePreference("voice:deafened", deafened)
    return { ...s, muted, deafened }
  })
}

export function toggleDeafen() {
  voiceStore.set((s) => {
    const deafened = !s.deafened
    playSound(deafened ? "deafen" : "undeafen")
    savePreference("voice:deafened", deafened)
    return { ...s, deafened }
  })
}

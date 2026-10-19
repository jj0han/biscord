import { createStore } from "@/lib/store"
import type { PresenceStatus } from "@/lib/types"

/** userId -> live status, fed by the global presence channel. */
export const presenceStore = createStore<Record<string, PresenceStatus>>({})

export function usePresence(userId: string | null | undefined) {
  return presenceStore.useStore((state) =>
    userId ? (state[userId] ?? "offline") : "offline"
  )
}

/** The channel the user is looking at, so unread counters skip it. */
export const activeChannelStore = createStore<string | null>(null)

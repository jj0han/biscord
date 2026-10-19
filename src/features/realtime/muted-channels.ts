import { createStore } from "@/lib/store"

const KEY = "notifications:muted-channels"

function load(): string[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]") as string[]
  } catch {
    return []
  }
}

/** Channels whose mentions/DMs shouldn't ping or show desktop notifications. */
export const mutedChannelsStore = createStore<string[]>(load())

export function toggleChannelMute(channelId: string) {
  mutedChannelsStore.set((prev) => {
    const next = prev.includes(channelId)
      ? prev.filter((id) => id !== channelId)
      : [...prev, channelId]
    try {
      localStorage.setItem(KEY, JSON.stringify(next))
    } catch {
      // preference only
    }
    return next
  })
}

export function useChannelMuted(channelId: string) {
  return mutedChannelsStore.useStore((ids) => ids.includes(channelId))
}

import { createStore } from "@/lib/store"

const KEY = "servers:hide-muted"

function load(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<
      string,
      boolean
    >
  } catch {
    return {}
  }
}

/** serverId -> hide channels whose notifications are muted. */
export const hideMutedStore = createStore<Record<string, boolean>>(load())

export function setHideMuted(serverId: string, hide: boolean) {
  hideMutedStore.set((prev) => {
    const next = { ...prev, [serverId]: hide }
    try {
      localStorage.setItem(KEY, JSON.stringify(next))
    } catch {
      // preference only
    }
    return next
  })
}

export function useHideMuted(serverId: string) {
  return hideMutedStore.useStore((state) => state[serverId] ?? false)
}

import { type QueryClient, queryOptions } from "@tanstack/react-query"

import { queryKeys } from "@/lib/query-keys"
import { createStore } from "@/lib/store"
import { supabase } from "@/lib/supabase"

export type DiscordGuild = {
  id: string
  name: string
  iconUrl: string | null
  /** the caller is the owner or an administrator there */
  canImport: boolean
  /** already imported into this Biscord server */
  importedServerId: string | null
}

export type DiscordGuilds = {
  applicationId: string
  intents: { members: boolean; content: boolean }
  guilds: DiscordGuild[]
}

export type ImportProgress = {
  done?: boolean
  busy?: boolean
  error?: string
  warning?: string | null
  channels?: number
  channelsDone?: number
  messages?: number
}

export class DiscordImportError extends Error {
  readonly serverId: string | null

  constructor(message: string, serverId: string | null = null) {
    super(message)
    this.serverId = serverId
  }
}

/** Calls discord-import, turning `{ error }` bodies into a DiscordImportError. */
async function call<T>(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke<T>("discord-import", {
    body,
  })
  if (!error) return data as T
  const context = (error as { context?: Response }).context
  const payload = (await context?.json?.().catch(() => null)) as {
    error?: string
    serverId?: string
  } | null
  throw new DiscordImportError(
    payload?.error ?? "Não foi possível falar com o Discord.",
    payload?.serverId ?? null
  )
}

export const discordGuildsQuery = queryOptions({
  queryKey: queryKeys.discordGuilds,
  queryFn: () => call<DiscordGuilds>({ action: "guilds" }),
  retry: false,
  staleTime: 30_000,
})

/** Link that adds the Biscord bot to a Discord server (view + history). */
export function botInviteUrl(applicationId: string) {
  const url = new URL("https://discord.com/oauth2/authorize")
  url.searchParams.set("client_id", applicationId)
  url.searchParams.set("scope", "bot")
  url.searchParams.set("permissions", String(1024 + 65536))
  return url.href
}

export function importDiscordServer(input: {
  guildId: string
  historyLimit: number
  sync: boolean
}) {
  return call<ImportProgress & { serverId: string }>({
    action: "import",
    ...input,
  })
}

/** serverId -> progress of the import (or sync) this window is running. */
export const importProgressStore = createStore<Record<string, ImportProgress>>(
  {}
)

const running = new Set<string>()

/**
 * Keeps calling the worker until the history is in. The cron job would get
 * there too, every couple of minutes; this just makes it quick while open.
 */
export async function runDiscordImport(qc: QueryClient, serverId: string) {
  if (running.has(serverId)) return
  running.add(serverId)
  try {
    for (let round = 0; round < 500; round++) {
      let progress: ImportProgress
      try {
        progress = await call<ImportProgress>({ action: "step", serverId })
      } catch (error) {
        progress = { error: (error as Error).message }
      }
      importProgressStore.set((prev) => ({ ...prev, [serverId]: progress }))
      await qc.invalidateQueries({ queryKey: queryKeys.discordLink(serverId) })
      if (progress.done || progress.error) break
      // another worker (cron) has it: check back shortly
      if (progress.busy) await new Promise((r) => setTimeout(r, 5000))
    }
  } finally {
    running.delete(serverId)
    await qc.invalidateQueries({ queryKey: queryKeys.channels(serverId) })
    await qc.invalidateQueries({ queryKey: queryKeys.messages })
  }
}

/** One manual "sync now" round. */
export async function syncDiscordNow(qc: QueryClient, serverId: string) {
  const progress = await call<ImportProgress>({ action: "step", serverId })
  importProgressStore.set((prev) => ({ ...prev, [serverId]: progress }))
  await Promise.all([
    qc.invalidateQueries({ queryKey: queryKeys.discordLink(serverId) }),
    qc.invalidateQueries({ queryKey: ["server", serverId] }),
    qc.invalidateQueries({ queryKey: queryKeys.messages }),
  ])
  return progress
}

export async function setDiscordSync(serverId: string, sync: boolean) {
  const { error } = await supabase
    .from("discord_links")
    .update({ sync })
    .eq("server_id", serverId)
  if (error) throw error
}

export async function unlinkDiscord(serverId: string) {
  const { error } = await supabase
    .from("discord_links")
    .delete()
    .eq("server_id", serverId)
  if (error) throw error
}

import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect } from "react"

import { DiscordIcon } from "@/components/brand-icon"
import { Spinner } from "@/components/spinner"
import {
  importProgressStore,
  runDiscordImport,
} from "@/features/discord/queries"
import { discordLinkQuery, usePermissions } from "@/features/servers/queries"
import { Permission } from "@/lib/permissions"

/**
 * While a Discord import is still bringing history in, says so at the top of
 * the channel list, and (for admins) keeps it moving after a reload.
 */
export function DiscordImportBanner({ serverId }: { serverId: string }) {
  const qc = useQueryClient()
  const { data: link } = useQuery(discordLinkQuery(serverId))
  const { can } = usePermissions(serverId)
  const progress = importProgressStore.useStore((all) => all[serverId])
  const importing = !!link && !link.backfill_done
  const admin = can(Permission.Administrator)

  useEffect(() => {
    if (importing && admin) void runDiscordImport(qc, serverId)
  }, [importing, admin, qc, serverId])

  if (!importing) return null

  return (
    <div className="mb-2 flex items-center gap-2 rounded-md bg-[#5865f2]/15 p-2 text-xs text-header">
      <DiscordIcon className="size-4 shrink-0 text-[#5865f2]" />
      <span className="flex-1">
        Importando mensagens do Discord
        {progress?.messages ? ` (${progress.messages})` : ""}…
      </span>
      <Spinner />
    </div>
  )
}

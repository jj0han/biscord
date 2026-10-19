import { PlusIcon, SpeakerHighIcon } from "@phosphor-icons/react"
import { useQuery } from "@tanstack/react-query"
import { useNavigate, useParams } from "@tanstack/react-router"
import { useState } from "react"

import { BiscordLogo } from "@/components/biscord-logo"
import { ServerIcon } from "@/components/server-icon"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import { UserAvatar } from "@/components/user-avatar"
import { useUserId } from "@/features/auth/auth-provider"
import { dmsQuery, otherRecipients } from "@/features/dms/queries"
import { RailItem } from "@/features/layout/rail-item"
import { useServerUnread, useUnreadDms } from "@/features/messages/unread"
import { useProfile } from "@/features/profiles/queries"
import { AddServerDialog } from "@/features/servers/add-server-dialog"
import { serversQuery } from "@/features/servers/queries"
import { ServerMenuItems, useServerMenu } from "@/features/servers/server-menu"
import { useScopeVoiceStates } from "@/features/voice/voice-store"
import { displayName } from "@/lib/format"
import type { Server } from "@/lib/types"

function VoiceAvatar({ userId }: { userId: string }) {
  const profile = useProfile(userId)
  return (
    <span className="rounded-full ring-2 ring-popover">
      <UserAvatar profile={profile ?? null} size="sm" />
    </span>
  )
}

/** "🔊 + avatars" under a server's name when someone is in its voice channels. */
function VoiceSummary({ serverId }: { serverId: string }) {
  const states = useScopeVoiceStates(serverId)
  if (states.length === 0) return null
  return (
    <span className="flex items-center gap-2">
      <SpeakerHighIcon className="size-4 text-interactive" />
      <span className="flex -space-x-1.5">
        {states.slice(0, 5).map((state) => (
          <VoiceAvatar key={state.user_id} userId={state.user_id} />
        ))}
      </span>
      {states.length > 5 && (
        <span className="text-xs text-muted-foreground">
          +{states.length - 5}
        </span>
      )}
    </span>
  )
}

function ServerButton({ server, active }: { server: Server; active: boolean }) {
  const navigate = useNavigate()
  const { unread, mentions } = useServerUnread(server.id)
  const menu = useServerMenu(server.id)

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger className="w-full">
          <RailItem
            label={server.name}
            active={active}
            unread={unread}
            mentions={mentions}
            extra={<VoiceSummary serverId={server.id} />}
            onClick={() =>
              navigate({
                to: "/channels/$serverId",
                params: { serverId: server.id },
              })
            }
          >
            <ServerIcon
              name={server.name}
              iconUrl={server.icon_url}
              className="size-10 bg-card text-sm"
            />
          </RailItem>
        </ContextMenuTrigger>
        <ContextMenuContent className="w-56">
          <ServerMenuItems menu={menu} kind="context" variant="rail" />
        </ContextMenuContent>
      </ContextMenu>
      {menu.dialogs}
    </>
  )
}

function UnreadDmButton({
  channelId,
  mentions,
}: {
  channelId: string
  mentions: number
}) {
  const userId = useUserId()
  const navigate = useNavigate()
  const { data: dms } = useQuery(dmsQuery)
  const dm = dms?.find((d) => d.id === channelId)
  if (!dm) return null

  const others = otherRecipients(dm, userId)
  const label =
    dm.type === "group_dm"
      ? dm.name || others.map((p) => displayName(p)).join(", ")
      : displayName(others[0])

  return (
    <RailItem
      label={label}
      mentions={mentions}
      onClick={() =>
        navigate({ to: "/channels/@me/$channelId", params: { channelId } })
      }
    >
      <UserAvatar profile={others[0] ?? null} size="lg" />
    </RailItem>
  )
}

export function ServerRail() {
  const navigate = useNavigate()
  const params = useParams({ strict: false })
  const { data: servers } = useQuery(serversQuery)
  const unreadDms = useUnreadDms()
  const [addOpen, setAddOpen] = useState(false)

  const homeActive = !params.serverId

  return (
    <nav
      aria-label="Servidores"
      className="scrollbar-none flex w-(--rail-width) shrink-0 flex-col items-center gap-2 overflow-y-auto bg-rail pt-2 pb-[calc(var(--user-area-height)+1rem)]"
    >
      <RailItem
        label="Mensagens diretas"
        active={homeActive}
        tone="brand"
        onClick={() => navigate({ to: "/channels/@me" })}
      >
        <BiscordLogo className="size-5" />
      </RailItem>

      {unreadDms.map((state) => (
        <UnreadDmButton
          key={state.channel_id}
          channelId={state.channel_id}
          mentions={state.mention_count}
        />
      ))}

      <span className="h-px w-8 shrink-0 bg-border" />

      {servers?.map((server) => (
        <ServerButton
          key={server.id}
          server={server}
          active={params.serverId === server.id}
        />
      ))}

      <RailItem
        label="Adicionar um servidor"
        tone="action"
        onClick={() => setAddOpen(true)}
      >
        <PlusIcon weight="bold" className="size-5" />
      </RailItem>

      <AddServerDialog open={addOpen} onOpenChange={setAddOpen} />
    </nav>
  )
}

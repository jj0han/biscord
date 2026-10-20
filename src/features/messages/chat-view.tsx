import { HashIcon, UsersIcon } from "@phosphor-icons/react"
import { useMemo, useState } from "react"

import { Separator } from "@/components/ui/separator"
import {
  ChatHeader,
  HeaderButton,
  MuteChannelButton,
} from "@/features/layout/chat-header"
import { ChatPane } from "@/features/messages/chat-pane"
import { PinsPopover } from "@/features/messages/pins-popover"
import { SearchBox, SearchPanel } from "@/features/messages/search-panel"
import { MemberList } from "@/features/servers/member-list"
import {
  useChannels,
  useMembers,
  usePermissions,
} from "@/features/servers/queries"
import { Markdown } from "@/lib/markdown/markdown"
import { Permission } from "@/lib/permissions"
import type { Channel } from "@/lib/types"

function readPreference(key: string, fallback: boolean) {
  try {
    const value = localStorage.getItem(key)
    return value === null ? fallback : value === "true"
  } catch {
    return fallback
  }
}

/** A server text channel. */
export function ChatView({ channel }: { channel: Channel }) {
  const serverId = channel.server_id!
  const members = useMembers(serverId)
  const channels = useChannels(serverId)
  const { can } = usePermissions(serverId)
  // narrow windows start without the member list, like Discord
  const [showMembers, setShowMembers] = useState(
    () =>
      readPreference("member-list", true) &&
      window.matchMedia("(min-width: 1024px)").matches
  )
  const [search, setSearch] = useState("")

  const toggleMembers = () => {
    const next = !showMembers
    setShowMembers(next)
    try {
      localStorage.setItem("member-list", String(next))
    } catch {
      // preference only
    }
  }

  const people = useMemo(
    () =>
      (members ?? []).map((m) => ({
        profile: m.profile,
        nickname: m.nickname,
      })),
    [members]
  )

  const permissions = useMemo(
    () => ({
      canSend: can(Permission.SendMessages),
      canReact: can(Permission.AddReactions),
      canAttach: can(Permission.AttachFiles),
      canManageMessages: can(Permission.ManageMessages),
      canMentionEveryone: can(Permission.MentionEveryone),
    }),
    [can]
  )

  const textChannelIds = useMemo(
    () => (channels ?? []).filter((c) => c.type === "text").map((c) => c.id),
    [channels]
  )

  const sidePanel = search.trim() ? (
    <SearchPanel channelIds={textChannelIds} term={search.trim()} />
  ) : showMembers ? (
    <MemberList
      serverId={serverId}
      className="max-lg:absolute max-lg:inset-y-0 max-lg:right-0 max-lg:z-20 max-lg:shadow-2xl"
    />
  ) : null

  return (
    <ChatPane
      channel={channel}
      serverId={serverId}
      people={people}
      mentionChannels={channels ?? []}
      permissions={permissions}
      placeholder={`Conversar em #${channel.name}`}
      sidePanel={sidePanel}
      header={
        <ChatHeader
          actions={
            <>
              <MuteChannelButton channelId={channel.id} />
              <PinsPopover channelId={channel.id} />
              <HeaderButton
                label={
                  showMembers
                    ? "Ocultar lista de membros"
                    : "Mostrar lista de membros"
                }
                active={showMembers}
                onClick={toggleMembers}
              >
                <UsersIcon className="size-5" />
              </HeaderButton>
              <div className="max-md:hidden">
                <SearchBox value={search} onChange={setSearch} />
              </div>
            </>
          }
        >
          <HashIcon
            weight="bold"
            className="size-5 shrink-0 text-channel-icon"
          />
          <h1 className="shrink-0 font-semibold text-header">{channel.name}</h1>
          {channel.topic && (
            <>
              <Separator
                orientation="vertical"
                className="mx-2 h-6 max-md:hidden"
              />
              <span className="truncate text-sm text-muted-foreground max-md:hidden">
                <Markdown content={channel.topic} />
              </span>
            </>
          )}
        </ChatHeader>
      }
      welcome={
        <div className="flex flex-col gap-2 px-4 pt-16 pb-4">
          <span className="flex size-17 items-center justify-center rounded-full bg-secondary">
            <HashIcon className="size-11 text-header" />
          </span>
          <h2 className="text-3xl font-bold text-header">
            Bem-vindo(a) a #{channel.name}!
          </h2>
          <p className="text-muted-foreground">
            Este é o começo do canal #{channel.name}.
          </p>
        </div>
      }
    />
  )
}

import { useNavigate } from "@tanstack/react-router"
import { type ReactNode, useMemo } from "react"

import { ProfilePopover } from "@/features/profiles/profile-popover"
import { useProfile } from "@/features/profiles/queries"
import { useChannels, useMember, useRoles } from "@/features/servers/queries"
import { displayName } from "@/lib/format"
import { MentionPill, MentionRenderersProvider } from "@/lib/markdown/markdown"
import { roleColor } from "@/lib/permissions"

function UserMention({
  id,
  serverId,
}: {
  id: string
  serverId: string | null
}) {
  const profile = useProfile(id)
  const member = useMember(serverId, id)
  return (
    <ProfilePopover userId={id} serverId={serverId}>
      <MentionPill>
        @{profile ? displayName(profile, member?.nickname) : "…"}
      </MentionPill>
    </ProfilePopover>
  )
}

function ChannelMention({
  id,
  serverId,
}: {
  id: string
  serverId: string | null
}) {
  const navigate = useNavigate()
  const channels = useChannels(serverId)
  const channel = channels?.find((c) => c.id === id)
  if (!channel || !serverId) {
    return <MentionPill>#canal-desconhecido</MentionPill>
  }
  return (
    <MentionPill
      onClick={() =>
        navigate({
          to: "/channels/$serverId/$channelId",
          params: { serverId, channelId: id },
        })
      }
    >
      {channel.type === "voice" ? "🔊" : "#"}
      {channel.name}
    </MentionPill>
  )
}

function RoleMention({
  id,
  serverId,
}: {
  id: string
  serverId: string | null
}) {
  const roles = useRoles(serverId)
  const role = roles?.find((r) => r.id === id)
  const color = role ? roleColor(role.color) : undefined
  return (
    <MentionPill
      style={
        color
          ? {
              color,
              backgroundColor: `color-mix(in oklch, ${color} 15%, transparent)`,
            }
          : undefined
      }
    >
      @{role?.name ?? "cargo-desconhecido"}
    </MentionPill>
  )
}

/** Resolves <@id>, <#id> and <@&id> inside markdown for the current chat. */
export function MentionsProvider({
  serverId,
  children,
}: {
  serverId: string | null
  children: ReactNode
}) {
  const value = useMemo(
    () => ({
      user: (id: string) => <UserMention id={id} serverId={serverId} />,
      channel: (id: string) => <ChannelMention id={id} serverId={serverId} />,
      role: (id: string) => <RoleMention id={id} serverId={serverId} />,
    }),
    [serverId]
  )
  return (
    <MentionRenderersProvider value={value}>
      {children}
    </MentionRenderersProvider>
  )
}

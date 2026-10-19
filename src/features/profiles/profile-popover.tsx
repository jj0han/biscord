import { useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { type ReactElement, useState } from "react"

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { UserAvatar } from "@/components/user-avatar"
import { useUserId } from "@/features/auth/auth-provider"
import { openDm } from "@/features/dms/queries"
import { sendMessage } from "@/features/messages/queries"
import { ProfileBadges, StyledName } from "@/features/profiles/discord-extras"
import { ProfileModal } from "@/features/profiles/profile-modal"
import { useProfile } from "@/features/profiles/queries"
import { usePresence } from "@/features/realtime/presence"
import { useMember, useMemberRoles } from "@/features/servers/queries"
import { displayName, formatMemberSince } from "@/lib/format"
import { roleColor } from "@/lib/permissions"
import type { Profile } from "@/lib/types"

function accentToCss(color: number | null | undefined) {
  return color ? `#${color.toString(16).padStart(6, "0")}` : undefined
}

export function ProfileBanner({ profile }: { profile: Profile }) {
  if (profile.banner_url) {
    return (
      <img
        src={profile.banner_url}
        alt=""
        className="h-26 w-full object-cover"
        draggable={false}
      />
    )
  }
  return (
    <div
      className="h-16 w-full bg-primary"
      style={{
        backgroundColor:
          profile.banner_color ?? accentToCss(profile.accent_color),
      }}
    />
  )
}

export function GuildTag({ profile }: { profile: Profile }) {
  if (!profile.guild_tag) return null
  return (
    <span className="inline-flex items-center gap-1 rounded-sm bg-foreground/10 px-1 text-xs font-semibold text-foreground">
      {profile.guild_tag_badge_url && (
        <img src={profile.guild_tag_badge_url} alt="" className="size-3" />
      )}
      {profile.guild_tag}
    </span>
  )
}

type ProfileCardProps = {
  userId: string
  serverId?: string | null
  onClose?: () => void
  onOpenFull?: () => void
  /** replaces the "message" box, e.g. the menu on your own profile */
  footer?: React.ReactNode
}

export function ProfileCard({
  userId,
  serverId,
  onClose,
  onOpenFull,
  footer,
}: ProfileCardProps) {
  const me = useUserId()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const profile = useProfile(userId)
  const status = usePresence(userId)
  const member = useMember(serverId, userId)
  const roles = useMemberRoles(serverId, userId)
  const [draft, setDraft] = useState("")

  if (!profile) {
    return <div className="h-60" />
  }

  const name = displayName(profile, member?.nickname)

  const message = async () => {
    const channelId = await openDm(userId)
    const content = draft.trim()
    if (content) {
      await sendMessage(qc, {
        id: crypto.randomUUID(),
        channelId,
        authorId: me,
        content,
        replyTo: null,
        attachments: [],
      })
    }
    setDraft("")
    onClose?.()
    navigate({ to: "/channels/@me/$channelId", params: { channelId } })
  }

  return (
    <div className="flex flex-col">
      <ProfileBanner profile={profile} />
      <div className="flex flex-col gap-3 px-4 pb-4">
        <div className="flex items-start gap-2">
          <button
            type="button"
            aria-label="Ver perfil completo"
            onClick={onOpenFull}
            className="-mt-12 w-fit shrink-0 rounded-full bg-popover p-1.5"
          >
            <UserAvatar
              profile={profile}
              size="xl"
              showStatus
              status={status}
              surface="popover"
              decoration
            />
          </button>
          {profile.custom_status && (
            <StatusBubble text={profile.custom_status} />
          )}
        </div>

        <div className="flex flex-col gap-1">
          <h2 className="text-xl leading-6 font-bold text-header">
            <StyledName profile={profile} name={name} />
          </h2>
          <div className="flex flex-wrap items-center gap-1.5 text-sm text-header">
            <span>{profile.username}</span>
            <GuildTag profile={profile} />
          </div>
          <ProfileBadges profile={profile} className="mt-1" />
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-xs font-bold text-header">Membro desde</span>
          <span className="text-sm">
            {formatMemberSince(profile.created_at)}
            {member &&
              ` · no servidor desde ${formatMemberSince(member.joined_at)}`}
          </span>
        </div>

        {roles.length > 0 && (
          <div className="flex flex-col gap-1">
            <span className="text-xs font-bold text-header">Cargos</span>
            <div className="flex flex-wrap gap-1">
              {roles.map((role) => (
                <span
                  key={role.id}
                  className="inline-flex items-center gap-1 rounded-sm bg-card px-1.5 py-0.5 text-xs font-medium"
                >
                  <span
                    className="size-3 rounded-full bg-channel-icon"
                    style={{ backgroundColor: roleColor(role.color) }}
                  />
                  {role.name}
                </span>
              ))}
            </div>
          </div>
        )}

        {footer ??
          (userId !== me && (
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  void message()
                }
              }}
              placeholder={`Conversar com @${profile.username}`}
              className="h-10 rounded-lg border border-border bg-transparent px-3 text-sm outline-none placeholder:text-muted-foreground focus:border-primary"
            />
          ))}
      </div>
    </div>
  )
}

/** Discord's custom status "thought bubble" next to the avatar. */
function StatusBubble({ text }: { text: string }) {
  return (
    <div className="relative -mt-7 min-w-0">
      <span className="absolute top-full left-0 size-2.5 -translate-x-1 rounded-full bg-card ring-1 ring-border" />
      <span className="absolute top-full left-0 mt-2.5 size-1.5 -translate-x-2.5 rounded-full bg-card ring-1 ring-border" />
      <div className="line-clamp-3 rounded-2xl bg-card px-3 py-2 text-sm break-words text-header ring-1 ring-border">
        {text}
      </div>
    </div>
  )
}

type ProfilePopoverProps = {
  userId: string
  serverId?: string | null
  children: ReactElement
  side?: "left" | "right" | "top" | "bottom"
}

/** Discord's user popout, opened by clicking an avatar or name. */
export function ProfilePopover({
  userId,
  serverId,
  children,
  side = "right",
}: ProfilePopoverProps) {
  const [open, setOpen] = useState(false)
  const [full, setFull] = useState(false)
  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger render={children} />
        <PopoverContent
          side={side}
          align="start"
          sideOffset={8}
          className="w-75 gap-0 overflow-hidden rounded-xl border border-border p-0"
        >
          <ProfileCard
            userId={userId}
            serverId={serverId}
            onClose={() => setOpen(false)}
            onOpenFull={() => {
              setOpen(false)
              setFull(true)
            }}
          />
        </PopoverContent>
      </Popover>
      <ProfileModal
        userId={userId}
        serverId={serverId}
        open={full}
        onOpenChange={setFull}
      />
    </>
  )
}
